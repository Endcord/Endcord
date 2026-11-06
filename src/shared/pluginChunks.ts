/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * The desktop renderer keeps the code of plugins that load lazily outside its script: the build cuts that code into
 * chunks and puts them in renderer.js after the script, inside one block comment (see scripts/build/pluginChunks.mjs).
 * The preload runs the chunks of the plugins that are on, and the rest are read from the file when something needs
 * them. V8 keeps a script's whole source in memory and parses all of it, so plugins that are off cost neither.
 *
 * The section is: CHUNKS_MARKER, a hash of the chunk data, a newline, the ChunkIndex as one line of JSON, a newline,
 * then the chunks one after another, then the end of the comment. "*" "/" in a chunk is written with \x7f between the
 * two and \x7f itself doubled, so the comment can't end early.
 */

// Must match CHUNKS_MARKER in scripts/build/pluginChunks.mjs
export const CHUNKS_MARKER = "\n/*endcord-chunks ";

export interface ChunkIndex {
    /** Byte offset (from the start of the chunk data) and byte length of each chunk */
    c: [number, number][];
    /** The chunks each chunk imports, which have to be defined with it */
    d: number[][];
    /** Per lazy plugin: its entry chunk, its flags (CHUNK_ON_BY_DEFAULT, CHUNK_REQUIRED) and plugins it loads with */
    p: Record<string, [entry: number, flags: number, loadsWith?: string[]]>;
}

export const CHUNK_ON_BY_DEFAULT = 1;
export const CHUNK_REQUIRED = 2;

/**
 * The last line of a renderer.js with chunks: the byte offsets where the chunk section, its data, and the translation
 * tables (or -1) start. Lets a reader take just the parts it needs
 */
export const LAYOUT_TRAILER = /\/\*endcord-layout (\d+) (\d+) (-?\d+)\*\/\n?$/;

export interface RendererLayout {
    chunksAt: number;
    dataAt: number;
    tablesAt: number;
    size: number;
}

/**
 * The renderer file next to the preload: renderer.js in Discord's app, endcordDesktopRenderer.js in Endcord Desktop.
 * Both builds keep their chunks and translation tables the same way
 */
export const RENDERER_FILE = IS_DISCORD_DESKTOP ? "renderer.js" : "endcordDesktopRenderer.js";

/**
 * The startup file next to a renderer file (renderer.startup.cache for renderer.js): the parts of it a start needs,
 * so a start doesn't open the renderer file (see src/pluginChunkLoader.ts). Its first line gives the byte lengths of
 * its parts and the key of the renderer file it was made from. One per renderer file, so two builds in one folder
 * don't keep replacing each other's
 */
export const startupFileOf = (rendererPath: string) => `${rendererPath.replace(/\.js$/, "")}.startup.cache`;
export const STARTUP_HEADER = /^\/\*endcord-startup (\d+) (\d+) (\d+) (\d+) (\S+)\*\/\n/;

/** Identifies a renderer.js by what stat gives, so checking it doesn't open the file, which is what Defender scans */
export const startupKey = ({ size, mtimeMs, ino }: { size: number; mtimeMs: number; ino: number; }) => `${size}:${mtimeMs}:${ino}`;

/** A chunk's code as it was before it went into the comment */
export function unescapeChunk(text: string) {
    return text.includes("\x7f") ? text.replace(/\x7f(\x7f?)/g, "$1") : text;
}
