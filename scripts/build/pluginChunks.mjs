/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-check

// Builds the Discord desktop renderer with the code of lazy plugins outside its script. A plugin that is off then
// costs no parsing and no memory: the preload only runs the code of plugins that are on (see @shared/pluginChunks).
//
// 1. The core: the renderer without the code of lazy plugins. Only the list of modules it is made of is kept.
// 2. The lazy plugins, split into chunks by esbuild. Every import of a module that is part of the core stays
//    outside the chunks, so plugins share the core's modules instead of bundling copies of them.
// 3. The core again, now with a table of the modules the chunks import, and each plugin pointing at its chunk.
// 4. The chunks, turned into functions taking (require, module, exports), go into renderer.js after the script.

import { createHash } from "crypto";
import esbuild from "esbuild";
import { readFile, writeFile } from "fs/promises";
import { relative, resolve } from "path";

// Must match CHUNKS_MARKER in src/shared/pluginChunks.ts
const CHUNKS_MARKER = "\n/*endcord-chunks ";
// Must match LOCALES_MARKER in src/shared/externalLocales.ts
const LOCALES_MARKER = "\n/*endcord-locales\n";

const SKIP = Symbol("core-externals");

/** @param {string} path @param {string} namespace */
const moduleKey = (path, namespace) =>
    namespace === "file" ? relative(process.cwd(), path).replaceAll("\\", "/") : `${namespace}:${path}`;

/**
 * Leaves every import of a core module out of the chunks, as `core:<key>`, and records how to reach it from the core
 * @param {Set<string>} core metafile input keys of the core
 * @param {Map<string, { key: string, spec: string, resolveDir: string }>} exposes
 * @returns {import("esbuild").Plugin}
 */
const coreExternalsPlugin = (core, exposes) => ({
    name: "core-externals",
    setup(build) {
        build.onResolve({ filter: /.*/ }, async args => {
            if (args.pluginData === SKIP || args.kind === "entry-point") return;

            // The plugin registry is a module of the core that only exists while building it
            if (args.path === "~plugins") {
                const key = "import-plugins:~plugins";
                if (!exposes.has(key)) exposes.set(key, { key, spec: "~plugins", resolveDir: args.resolveDir });
                return { path: `core:${key}`, external: true };
            }

            const result = await build.resolve(args.path, {
                kind: args.kind,
                importer: args.importer,
                namespace: args.namespace,
                resolveDir: args.resolveDir,
                pluginData: SKIP
            });
            if (result.errors.length || result.external) return result.errors.length ? { errors: result.errors } : { path: result.path, external: true };

            const key = moduleKey(result.path, result.namespace);
            if (core.has(key)) {
                // A file is reached by its absolute path; anything else the way the chunk asked for it
                if (!exposes.has(key)) exposes.set(key, { key, spec: result.namespace === "file" ? result.path.replaceAll("\\", "/") : args.path, resolveDir: args.resolveDir });
                return { path: `core:${key}`, external: true };
            }

            return {
                path: result.path,
                namespace: result.namespace,
                pluginData: result.pluginData,
                sideEffects: result.sideEffects,
                suffix: result.suffix
            };
        });
    }
});

const CORE_STRING = String.raw`"core:((?:[^"\\]|\\.)*)"`;
const CORE_IMPORT = new RegExp(String.raw`\b(import|export)\s*([^;"]*?)\s*from\s*${CORE_STRING}|\bimport\s*${CORE_STRING}|${CORE_STRING}`, "g");

/**
 * The names the chunks import from each core module, or "*" when one needs all of it (a namespace import, a
 * require, a re-export of everything). Reads esbuild's own output, whose import and export statements are regular
 * @param {string[]} chunks
 */
function importedCoreNames(chunks) {
    /** @type {Map<string, Set<string> | "*">} */
    const found = new Map();
    const add = (/** @type {string} */ escapedKey, /** @type {string[] | "*"} */ names) => {
        const key = JSON.parse(`"${escapedKey}"`);
        const set = found.get(key) ?? new Set();
        if (set === "*" || names === "*") found.set(key, "*");
        else {
            for (const name of names) set.add(name);
            found.set(key, set);
        }
    };

    for (const code of chunks) for (const m of code.matchAll(CORE_IMPORT)) {
        const [, keyword, clause, fromKey, bareKey, otherKey] = m;
        if (bareKey != null || otherKey != null) {
            add(bareKey ?? otherKey, "*");
            continue;
        }
        if (/\*/.test(clause)) {
            add(fromKey, "*");
            continue;
        }
        /** @type {string[]} */
        const names = [];
        const braces = /\{([^}]*)\}/.exec(clause);
        const outside = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
        if (keyword === "import" && outside) names.push("default");
        if (braces) for (const part of braces[1].split(",")) {
            const name = part.trim().split(/\s+as\s+/)[0].trim();
            if (name) names.push(name);
        }
        add(fromKey, names);
    }

    /** @type {Map<string, string[] | "*">} */
    const result = new Map();
    for (const [key, set] of found) result.set(key, set === "*" ? "*" : [...set].sort());
    return result;
}

// The helpers esbuild declares at the top of each file it turns into CommonJS. The loader passes them to every chunk
// in this order (see pluginChunkRuntime.js), which has to stay the same as here
const CHUNK_HELPERS = ["__create", "__defProp", "__getOwnPropDesc", "__getOwnPropNames", "__getProtoOf", "__hasOwnProp", "__export", "__copyProps", "__toESM", "__toCommonJS"];

/**
 * Each helper's declaration exactly as esbuild writes it, taken from a sample that needs them all
 * @param {import("esbuild").TransformOptions["target"]} target
 */
async function cjsHelpers(target) {
    const sample = "import d, { a } from \"x\"; import * as n from \"y\"; export { a, n, d };";
    const { code } = await esbuild.transform(sample, { format: "cjs", minify: false, target });
    const prelude = code.slice(0, code.indexOf("var stdin_exports"));
    /** @type {Map<string, string>} */
    const declarations = new Map();
    for (const part of prelude.split(/\n(?=var __)/)) {
        const name = /^var (__\w+) =/.exec(part)?.[1];
        if (!name || !CHUNK_HELPERS.includes(name)) throw new Error(`esbuild declares an unknown helper: ${part.slice(0, 60)}`);
        declarations.set(name, part.trimEnd());
    }
    if (declarations.size !== CHUNK_HELPERS.length) throw new Error(`esbuild's helpers changed: ${[...declarations.keys()].join(", ")}`);
    return declarations;
}

// esbuild renames a helper, or a parameter inside one, by adding a number when the file uses the name itself
const withoutRenames = (/** @type {string} */ text) => text.replace(/\b([A-Za-z_]\w*?)\d+\b/g, "$1");

/**
 * The code without esbuild's helper declarations at its top, and the names it calls them by (a helper the code
 * doesn't use gets a placeholder name). Each declaration must match the known one, but for esbuild's renaming
 * @param {string} code
 * @param {Map<string, string>} helpers
 * @param {string} path
 * @returns {{ code: string, names: string[] }}
 */
function stripHelpers(code, helpers, path) {
    /** @type {Map<string, string>} */
    const used = new Map();
    let rest = code;
    for (; ;) {
        const name = /^var (__[A-Za-z]+?)(\d*) =/.exec(rest);
        if (!name) break;
        const canonical = name[1];
        const declaration = helpers.get(canonical);
        // The declaration ends where the next line starts that isn't indented or a closing bracket
        const end = rest.search(/\n(?![ \t)}\]])/);
        const text = end === -1 ? rest : rest.slice(0, end);
        if (!declaration || withoutRenames(text) !== withoutRenames(declaration)) throw new Error(`${path}: unexpected helper ${name[0]}`);
        used.set(canonical, canonical + name[2]);
        rest = end === -1 ? "" : rest.slice(end + 1);
    }
    for (const name of used.values()) {
        if (new RegExp(`(^|\\n)var ${name} =`).test(rest)) throw new Error(`${path}: ${name} is declared again further down`);
    }
    return { code: rest, names: CHUNK_HELPERS.map((h, i) => used.get(h) ?? `$unusedHelper${i}`) };
}

/** "*" "/" can't appear inside the comment: \x7f goes between them, and \x7f itself is doubled. See unescapeChunk */
const escapeChunk = (/** @type {string} */ text) => text.replaceAll("\x7f", "\x7f\x7f").replaceAll("*/", "*\x7f/");

/**
 * @param {import("esbuild").BuildOptions} cfg the renderer's options, without plugins
 * @param {(chunks?: import("./common.mjs").PluginChunkState) => import("esbuild").Plugin[]} pluginsFor the renderer's plugins
 * @param {import("esbuild").Plugin[]} chunkPlugins the plugins to build the chunks with
 */
export async function buildChunkedRenderer(cfg, pluginsFor, chunkPlugins) {
    const { outfile: maybeOutfile } = cfg;
    const outfile = /** @type {string} */ (maybeOutfile);
    /** @type {import("./common.mjs").PluginChunkState} */
    const state = { lazy: [] };

    // 1. Which modules make up the core
    const first = await esbuild.build({
        ...cfg,
        plugins: pluginsFor(state).filter(p => p.name !== "external-locales"),
        write: false,
        metafile: true,
        minify: false,
        sourcemap: false,
        logLevel: "warning"
    });
    const core = new Set(Object.keys(first.metafile.inputs));

    // 2. The lazy plugins as chunks
    /** @type {Map<string, { key: string, spec: string, resolveDir: string }>} */
    const exposes = new Map();
    const lazy = [...state.lazy].sort((a, b) => a.name.localeCompare(b.name));
    const outdir = resolve(outfile, "..", ".plugin-chunks");
    const split = await esbuild.build({
        bundle: true,
        minify: cfg.minify,
        define: cfg.define,
        inject: cfg.inject,
        jsx: cfg.jsx,
        jsxFactory: cfg.jsxFactory,
        jsxFragment: cfg.jsxFragment,
        target: cfg.target,
        external: cfg.external,
        logLevel: "warning",
        entryPoints: Object.fromEntries(lazy.map((p, i) => [`p${i}`, p.entry])),
        outdir,
        splitting: true,
        format: "esm",
        write: false,
        metafile: true,
        legalComments: "linked",
        plugins: [coreExternalsPlugin(core, exposes), ...chunkPlugins]
    });

    // Chunk ids, in a stable order
    const outputs = Object.entries(split.metafile.outputs).filter(([path]) => path.endsWith(".js")).sort(([a], [b]) => a.localeCompare(b));
    const idOf = new Map(outputs.map(([path], n) => [resolve(path), n]));
    const entryOf = new Map(outputs.filter(([, out]) => out.entryPoint).map(([path, out]) => [resolve(/** @type {string} */ (out.entryPoint)), /** @type {number} */ (idOf.get(resolve(path)))]));

    // A module in both the core and a chunk would run twice, with two copies of its state. Injected files don't go
    // through resolving, so each chunk gets its own copy: they only hold the JSX helpers, which keep no state
    const injected = new Set((cfg.inject ?? []).map(file => moduleKey(resolve(file), "file")));
    for (const [, out] of outputs) for (const input of Object.keys(out.inputs)) {
        if (core.has(input) && !injected.has(input)) throw new Error(`${input} is in the core and in a plugin chunk`);
    }

    const names = importedCoreNames(split.outputFiles.filter(f => f.path.endsWith(".js")).map(f => f.text));
    // Sorted, so the ids the chunks call core modules by don't depend on the order esbuild resolved them in, and the same
    // source always builds the same renderer.js
    const exposeList = [...exposes.values()].sort((a, b) => a.key.localeCompare(b.key)).map(e => ({ ...e, names: names.get(e.key) ?? "*" }));
    const coreIdOf = new Map(exposeList.map((e, n) => [e.key, n]));
    state.exposes = exposeList;
    state.entryIds = Object.fromEntries(lazy.map(p => {
        const id = entryOf.get(resolve(p.entry));
        if (id == null) throw new Error(`No chunk for plugin ${p.name}`);
        return [p.name, `c${id}`];
    }));
    // One more chunk after esbuild's: what the plugin list shows of each lazy plugin (see PluginListInfo)
    const manifestId = outputs.length;
    state.manifestChunk = `c${manifestId}`;
    // And one with the CSS of the core's own screens (see the screen-style loader in globPlugins)
    const screenId = outputs.length + 1;
    state.screenChunk = `c${screenId}`;

    // 3. The core, now with what the chunks need from it
    const final = await esbuild.build({ ...cfg, plugins: pluginsFor(state), metafile: true });
    for (const input of Object.keys(final.metafile.inputs)) {
        if (!core.has(input) && !input.startsWith("endcord-expose:")) throw new Error(`${input} joined the core after the chunks were made`);
    }

    // 4. The chunks
    const files = new Map(split.outputFiles.map(f => [resolve(f.path), f.text]));
    /** @type {string[]} */
    const texts = [];
    /** @type {number[][]} */
    const deps = [];
    const helpers = await cjsHelpers(cfg.target);
    for (const [path, out] of outputs) {
        const id = /** @type {number} */ (idOf.get(resolve(path)));
        // Unminified first, so esbuild's module helpers can be recognised and left to the loader, which has one copy
        // of them for every chunk (see CHUNK_HELPERS). Minified once wrapped
        let { code } = await esbuild.transform(/** @type {string} */ (files.get(resolve(path))), {
            format: "cjs",
            minify: false,
            target: cfg.target,
            legalComments: "none",
            logLevel: "warning"
        });
        const stripped = stripHelpers(code, helpers, path);
        code = stripped.code;

        code = code
            .replace(/"core:((?:[^"\\]|\\.)*)"/g, (_, spec) => {
                const n = coreIdOf.get(JSON.parse(`"${spec}"`));
                if (n == null) throw new Error(`${path} imports ${spec}, which the core doesn't export`);
                return `"k${n}"`;
            })
            // Only module names in require calls: code can hold other relative paths, like a worker's script
            .replace(/\brequire\("(\.\/[\w.-]+\.js)"\)/g, (_, spec) => {
                const n = idOf.get(resolve(path, "..", spec));
                if (n == null) throw new Error(`${path} imports ${spec}, which isn't a chunk`);
                return `require("c${n}")`;
            });
        if (/"(?:core:|\.\/chunk-)/.test(code)) throw new Error(`${path} still names a module the loader can't find`);

        const wrapped = `EndcordChunks.c${id}=function(require,module,exports,${stripped.names.join(",")}){${code}\n};`;
        const minified = cfg.minify
            ? (await esbuild.transform(wrapped, { minify: true, target: cfg.target, legalComments: "none", logLevel: "warning" })).code
            : `${wrapped}\n`;
        texts[id] = escapeChunk(minified.endsWith("\n") ? minified : `${minified}\n`);
        deps[id] = out.imports
            .filter(i => i.kind === "import-statement" && !i.external)
            .map(i => /** @type {number} */ (idOf.get(resolve(i.path))));
    }

    // The list's view of every lazy plugin. Parsed from a string, which is faster than an object literal this size.
    // Characters past Latin-1 are escaped like everywhere else in renderer.js
    const manifest = JSON.stringify(JSON.stringify(Object.fromEntries(lazy.map(p => [p.name, p.info]))))
        .replace(/[^\0-\xff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
    texts[manifestId] = escapeChunk(`EndcordChunks.c${manifestId}=function(require,module){module.exports=JSON.parse(${manifest})};\n`);
    deps[manifestId] = [];

    const screenCss = Object.fromEntries(Object.entries(state.screenCss ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    const screens = JSON.stringify(JSON.stringify(screenCss)).replace(/[^\0-\xff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
    texts[screenId] = escapeChunk(`EndcordChunks.c${screenId}=function(require,module){module.exports=JSON.parse(${screens})};\n`);
    deps[screenId] = [];

    // What the preload needs to pick the chunks of the plugins that are on. loadsWith names plugin folders
    const lazyByFolder = new Map(lazy.map(p => [p.folderName, p.name]));
    /** @type {Record<string, [number, number, string[]?]>} */
    const pluginIndex = {};
    for (const p of lazy) {
        const entry = /** @type {number} */ (entryOf.get(resolve(p.entry)));
        const flags = (p.enabledByDefault ? 1 : 0) | (p.required ? 2 : 0);
        const loadsWith = p.loadsWith.map(folder => lazyByFolder.get(folder)).filter(n => n != null);
        pluginIndex[p.name] = loadsWith.length ? [entry, flags, /** @type {string[]} */ (loadsWith)] : [entry, flags];
    }

    /** @type {[number, number][]} */
    const ranges = [];
    let offset = 0;
    for (const text of texts) {
        const length = Buffer.byteLength(text, "utf-8");
        ranges.push([offset, length]);
        offset += length;
    }
    const data = texts.join("");
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
    const head = `${CHUNKS_MARKER}${hash}\n${JSON.stringify({ c: ranges, d: deps, p: pluginIndex })}\n`;
    const section = `${head}${data}*/\n`;
    if (data.includes(LOCALES_MARKER) || data.includes(CHUNKS_MARKER)) throw new Error("A plugin chunk contains a section marker");

    // The chunks go between the script and the translation tables. The last line says where each part starts, in
    // bytes, so the preload reads only the script and the chunks it needs instead of the whole file (see LAYOUT_TRAILER
    // in @shared/pluginChunks)
    const rendererText = await readFile(outfile, "utf-8");
    const localesAt = rendererText.lastIndexOf(LOCALES_MARKER);
    const script = localesAt === -1 ? rendererText : rendererText.slice(0, localesAt);
    const tables = localesAt === -1 ? "" : rendererText.slice(localesAt);
    const chunksAt = Buffer.byteLength(script);
    const dataAt = chunksAt + Buffer.byteLength(head);
    const tablesAt = tables ? chunksAt + Buffer.byteLength(section) : -1;
    await writeFile(outfile, `${script}${section}${tables}/*endcord-layout ${chunksAt} ${dataAt} ${tablesAt}*/\n`);

    // Licenses of what only the chunks bundle
    const legal = split.outputFiles.filter(f => f.path.endsWith(".LEGAL.txt")).map(f => f.text.trim()).filter(Boolean);
    if (legal.length) {
        const legalFile = `${outfile}.LEGAL.txt`;
        const existing = await readFile(legalFile, "utf-8").catch(() => "");
        const seen = new Set(existing.split(/\n{2,}/).map(s => s.trim()));
        const extra = [...new Set(legal.flatMap(t => t.split(/\n{2,}/).map(s => s.trim())))].filter(s => s && !seen.has(s));
        if (extra.length) await writeFile(legalFile, `${existing.trimEnd()}\n\n${extra.join("\n\n")}\n`);
    }

    if (process.env.ENDCORD_METAFILE) {
        await writeFile(`${outfile}.meta.json`, JSON.stringify(final.metafile));
        await writeFile(`${outfile}.chunks.meta.json`, JSON.stringify(split.metafile));
    }

    console.log(`${relative(process.cwd(), outfile)}: ${lazy.length} lazy plugins in ${texts.length} chunks (${Math.round(Buffer.byteLength(data) / 1024)} KB), ${exposeList.length} core modules shared`);
    return final;
}

