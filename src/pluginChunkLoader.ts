/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Preload side of renderer.js: the script that runs, the plugin code kept outside it (see @shared/pluginChunks) and the
// translation tables after both (see @shared/externalLocales).
//
// Windows Defender reads a script file through the first time it's opened after it changes or its signatures update,
// and the open waits for it: about a second and a half for all of renderer.js, nearly all of it for plugin code that
// isn't on. So the parts a start needs (the script, the code of the plugins that are on, the translations in use) are
// also kept in a small startup file next to it, and a start that finds that file up to date never opens renderer.js.

import type { Settings } from "@api/Settings";
import { findLocaleTable, type LocaleKind, LOCALES_MARKER } from "@shared/externalLocales";
import { CHUNK_ON_BY_DEFAULT, CHUNK_REQUIRED, type ChunkIndex, CHUNKS_MARKER, LAYOUT_TRAILER, type RendererLayout, STARTUP_HEADER, startupFileOf, startupKey, unescapeChunk } from "@shared/pluginChunks";
import { webFrame } from "electron/renderer";
import { closeSync, fstatSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "fs";

const STARTUP_VERSION = 1;

interface ChunkSource {
    path: string;
    /** Where the chunk section starts in renderer.js, and its first line, which holds the hash of the chunk data */
    headAt: number;
    head: string;
    dataAt: number;
    index: ChunkIndex;
}

interface StartupMeta {
    v: number;
    /** Which renderer.js this was made from: its size, change time and file id */
    key: string;
    headAt: number;
    head: string;
    dataAt: number;
    index: ChunkIndex;
    /** The chunks in the file, in order, with their lengths in bytes */
    chunks: [id: number, length: number][];
}

/** What the next startup file should hold, gathered during this start */
interface StartupParts {
    key: string;
    script: string;
    chunks: Map<number, string>;
    tables: Map<string, string>;
    changed: boolean;
}

let source: ChunkSource | undefined;
let startup: StartupParts | undefined;
/** Plugin code loaded until then belongs to the start (dependencies); later it's someone opening the plugin list */
const captureUntil = Date.now() + 5_000;
const defined = new Set<number>();

function readRange(fd: number, from: number, to: number) {
    const buffer = Buffer.alloc(Math.max(0, to - from));
    for (let got = 0; got < buffer.length;) {
        const read = readSync(fd, buffer, got, buffer.length - got, from + got);
        if (read === 0) throw new Error("renderer.js ended early");
        got += read;
    }
    return buffer;
}

/** Where the parts of renderer.js start, from its last line, or null for a file without one */
function readLayout(fd: number): RendererLayout | null {
    const { size } = fstatSync(fd);
    const tail = readRange(fd, Math.max(0, size - 96), size).toString("latin1");
    const match = LAYOUT_TRAILER.exec(tail);
    if (!match) return null;

    const [chunksAt, dataAt, tablesAt] = match.slice(1).map(Number);
    return chunksAt < dataAt && dataAt <= size && tablesAt < size ? { chunksAt, dataAt, tablesAt, size } : null;
}

const fileKey = (path: string) => startupKey(statSync(path));

/** The chunks these need, leaving out the ones already defined */
function withDependencies(index: ChunkIndex, ids: number[]) {
    const out: number[] = [];
    const seen = new Set<number>();
    const visit = (n: number) => {
        if (seen.has(n) || defined.has(n) || !index.c[n]) return;
        seen.add(n);
        for (const dep of index.d[n] ?? []) visit(dep);
        out.push(n);
    };
    for (const n of ids) visit(n);
    return out;
}

/** Defines chunks in the page. The completion value stays undefined so nothing has to be sent back */
function define(chunks: [id: number, code: string][]) {
    if (!chunks.length) return;
    let code = "\"use strict\";window.EndcordChunks??={};\n";
    for (const [n, text] of chunks) {
        code += text;
        defined.add(n);
        if (Date.now() < captureUntil) startup?.chunks.set(n, text);
    }
    webFrame.executeJavaScript(`${code}void 0;\n//# sourceURL=file:///EndcordPlugins`).catch(() => { });
}

/** These chunks' code from renderer.js, with one read covering all of them */
function readChunks(fd: number, ids: number[]): [number, string][] {
    const { index, dataAt } = source!;
    let from = Infinity, to = 0;
    for (const n of ids) {
        const [offset, length] = index.c[n];
        from = Math.min(from, offset);
        to = Math.max(to, offset + length);
    }
    const span = readRange(fd, dataAt + from, dataAt + to);
    return ids.map(n => {
        const [offset, length] = index.c[n];
        return [n, unescapeChunk(span.toString("utf-8", offset - from, offset - from + length))];
    });
}

/** The chunks to define before the script runs: those of the plugins that are on, and of what loads with them */
function startupChunks(index: ChunkIndex, settings: Settings | null) {
    const stored = settings?.plugins ?? {};
    const wanted = new Set<string>();
    for (const [name, [, flags, loadsWith]] of Object.entries(index.p)) {
        if (!(stored[name]?.enabled ?? (flags & (CHUNK_ON_BY_DEFAULT | CHUNK_REQUIRED)) !== 0)) continue;
        wanted.add(name);
        for (const other of loadsWith ?? []) wanted.add(other);
    }
    return withDependencies(index, [...wanted].map(name => index.p[name][0]));
}

/** The startup file's script, chunks and tables, if it was made from this renderer.js and has every chunk needed */
function readStartupFile(path: string, key: string, settings: Settings | null) {
    let file: Buffer;
    try {
        file = readFileSync(startupFileOf(path));
    } catch {
        return null;
    }

    try {
        const header = STARTUP_HEADER.exec(file.toString("latin1", 0, 160));
        if (!header || header[5] !== key) return null;
        const [metaLength, scriptLength, chunksLength, tablesLength] = header.slice(1, 5).map(Number);
        let at = header[0].length;
        const meta: StartupMeta = JSON.parse(file.toString("utf-8", at, at += metaLength));
        if (meta.v !== STARTUP_VERSION || meta.key !== key) return null;

        const script = file.toString("utf-8", at, at += scriptLength);
        const chunks = new Map<number, string>();
        const chunksEnd = at + chunksLength;
        for (const [n, length] of meta.chunks) chunks.set(n, file.toString("utf-8", at, at += length));
        if (at !== chunksEnd) return null;
        const tables = file.toString("utf-8", at, at + tablesLength);

        const needed = startupChunks(meta.index, settings);
        if (!needed.every(n => chunks.has(n))) return null;

        return { meta, script, chunks, tables, needed };
    } catch {
        return null;
    }
}

/** Writes the startup file a while after the start, once Discord no longer needs the disk and the CPU */
function scheduleStartupWrite(path: string) {
    setTimeout(async () => {
        const parts = startup;
        startup = undefined;
        if (!parts || !source) return;

        // A chunk the page ran is gone from EndcordChunks. One still there wasn't needed (a plugin turned off since):
        // the file is written again without it, and a file that held only what ran stays as it is, so it isn't
        // rewritten, and scanned again by Defender, on every start
        const unused = await webFrame.executeJavaScript("Object.keys(window.EndcordChunks ?? {})").catch(() => null);
        if (Array.isArray(unused)) {
            for (const id of unused) {
                if (typeof id === "string" && /^c\d+$/.test(id) && parts.chunks.delete(Number(id.slice(1)))) parts.changed = true;
            }
        }
        if (!parts.changed) return;

        const chunks = [...parts.chunks];
        const tables = [...parts.tables].map(([key, json]) => `\n${key} ${json}`).join("");
        const meta: StartupMeta = {
            v: STARTUP_VERSION,
            key: parts.key,
            headAt: source.headAt,
            head: source.head,
            dataAt: source.dataAt,
            index: source.index,
            chunks: chunks.map(([n, code]) => [n, Buffer.byteLength(code)])
        };
        const metaJson = JSON.stringify(meta);
        const chunkCode = chunks.map(([, code]) => code).join("");
        const tablesText = tables ? `${LOCALES_MARKER.slice(0, -1)}${tables}\n*/\n` : "";
        const header = `/*endcord-startup ${Buffer.byteLength(metaJson)} ${Buffer.byteLength(parts.script)} ${Buffer.byteLength(chunkCode)} ${Buffer.byteLength(tablesText)} ${parts.key}*/\n`;
        const body = `${header}${metaJson}${parts.script}${chunkCode}${tablesText}`;

        // Stable and Canary share these files: write aside, then swap in. Synchronously: the first asynchronous file
        // call in this process starts Node's thread pool, whose four threads Windows gives 8 MB of stack each, up front.
        // That was 32 MB for the whole session, against a few milliseconds' write long after the start
        const target = startupFileOf(path);
        const temp = `${target}.${process.pid}.tmp`;
        try {
            if (fileKey(path) !== parts.key) return;
            writeFileSync(temp, body);
            renameSync(temp, target);
        } catch {
            try {
                rmSync(temp, { force: true });
            } catch { }
        }
    }, 15_000);
}

/**
 * Returns the script to run, after defining the code of the plugins that are on. Anything this misses (a plugin turned
 * on as a dependency, say) is read later by loadPluginChunks.
 */
export function loadRenderer(path: string, settings: Settings | null): string {
    const key = fileKey(path);

    const cached = readStartupFile(path, key, settings);
    if (cached) {
        const { meta } = cached;
        source = { path, headAt: meta.headAt, head: meta.head, dataAt: meta.dataAt, index: meta.index };
        // Rewritten only if this start needs something the file lacks: a translation, or a plugin's code
        startup = { key, script: cached.script, chunks: new Map(), tables: new Map(), changed: false };
        for (const line of cached.tables.split("\n")) {
            const space = line.indexOf(" ");
            if (/^[a-z]{2}\.(dict|desc) /.test(line)) startup.tables.set(line.slice(0, space), line.slice(space + 1));
        }
        // Everything in it: what the last start ran beyond the plugins that are on (a plugin whose settings another one
        // reads, say) runs again. Whatever this start doesn't run is left out when the file is written next
        define([...cached.chunks]);
        scheduleStartupWrite(path);
        return cached.script;
    }

    const fd = openSync(path, "r");
    try {
        const layout = readLayout(fd);
        if (!layout) return splitRenderer(readRange(fd, 0, fstatSync(fd).size), path, settings);

        const script = readRange(fd, 0, layout.chunksAt + 1).toString("utf-8");
        try {
            const head = readRange(fd, layout.chunksAt, layout.dataAt);
            const headEnd = head.indexOf("\n", CHUNKS_MARKER.length);
            const index: ChunkIndex = JSON.parse(head.toString("utf-8", headEnd + 1, head.length - 1));
            source = { path, headAt: layout.chunksAt, head: head.toString("utf-8", 0, headEnd), dataAt: layout.dataAt, index };
            startup = { key, script, chunks: new Map(), tables: new Map(), changed: true };

            const ids = startupChunks(index, settings);
            if (ids.length) define(readChunks(fd, ids));
            scheduleStartupWrite(path);
        } catch (e) {
            // Every plugin can still be read on demand
            console.error("[Endcord] Couldn't read the plugin code in renderer.js", e);
        }
        return script;
    } finally {
        closeSync(fd);
    }
}

/** Like loadRenderer, for the whole file already in memory and without a startup file */
export function splitRenderer(file: Buffer, path: string, settings: Settings | null): string {
    const localesAt = file.lastIndexOf(LOCALES_MARKER);
    const end = localesAt === -1 ? file.length : localesAt;
    const chunksAt = file.lastIndexOf(CHUNKS_MARKER, end);
    if (chunksAt === -1) return file.toString("utf-8", 0, localesAt === -1 ? file.length : localesAt + 1);

    try {
        const headEnd = file.indexOf("\n", chunksAt + CHUNKS_MARKER.length);
        const indexEnd = file.indexOf("\n", headEnd + 1);
        const index: ChunkIndex = JSON.parse(file.toString("utf-8", headEnd + 1, indexEnd));
        const dataAt = indexEnd + 1;
        source = { path, headAt: chunksAt, head: file.toString("utf-8", chunksAt, headEnd), dataAt, index };

        define(startupChunks(index, settings).map(n => {
            const [offset, length] = index.c[n];
            return [n, unescapeChunk(file.toString("utf-8", dataAt + offset, dataAt + offset + length))];
        }));
    } catch (e) {
        console.error("[Endcord] Couldn't read the plugin code in renderer.js", e);
    }

    return file.toString("utf-8", 0, chunksAt + 1);
}

/**
 * Defines these chunks and the ones they import, read from renderer.js. Does nothing when renderer.js changed since
 * the start (an update waiting for a restart): the caller then reports the plugin as unavailable.
 */
export function loadPluginChunks(ids: string[]) {
    if (!source || !Array.isArray(ids)) return;
    const wanted = withDependencies(source.index, ids.map(id => typeof id === "string" && id[0] === "c" ? Number(id.slice(1)) : NaN).filter(Number.isInteger));
    if (!wanted.length) return;

    let fd: number | undefined;
    try {
        fd = openSync(source.path, "r");
        const head = Buffer.from(source.head, "utf-8");
        if (!readRange(fd, source.headAt, source.headAt + head.length).equals(head)) return;
        // While the start is still going (dependencies being loaded), the startup file should hold these too
        if (startup && Date.now() < captureUntil) startup.changed = true;
        define(readChunks(fd, wanted));
    } catch (e) {
        console.error("[Endcord] Couldn't read plugin code from renderer.js", e);
    } finally {
        if (fd !== undefined) closeSync(fd);
    }
}

/** One translation table as JSON, from the startup file's copy when it has it, or null if there's none */
export function readLocaleTable(path: string, lang: string, kind: LocaleKind): string | null {
    const key = `${lang}.${kind}`;
    const kept = startup?.tables.get(key);
    if (kept != null) return kept;

    let tables: string | null;
    const fd = openSync(path, "r");
    try {
        const layout = readLayout(fd);
        if (layout) tables = layout.tablesAt === -1 ? null : readRange(fd, layout.tablesAt, layout.size).toString("utf-8");
        else {
            const file = readRange(fd, 0, fstatSync(fd).size);
            const tablesAt = file.lastIndexOf(LOCALES_MARKER);
            tables = tablesAt === -1 ? null : file.toString("utf-8", tablesAt);
        }
    } finally {
        closeSync(fd);
    }

    const table = tables == null ? null : findLocaleTable(tables, lang, kind);
    if (table != null && startup) {
        startup.tables.set(key, table);
        startup.changed = true;
    }
    return table;
}
