/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The desktop renderer keeps the code of lazy plugins outside its script (src/shared/pluginChunks.ts). A chunk that
// doesn't parse, or points at a chunk that isn't there, only shows when someone turns that one plugin on, so every
// chunk of the last build is checked here. Run after a release build.
import esbuild from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { join } from "path";
import { Script } from "vm";

const ROOT = join(import.meta.dirname, "..");
let failed = 0;
function check(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
    if (!ok) failed++;
}

// Must match the build and src/shared/pluginChunks.ts
const CHUNKS_MARKER = "\n/*endcord-chunks ";
const LOCALES_MARKER = "\n/*endcord-locales\n";
const unescapeChunk = text => text.replace(/\x7f(\x7f?)/g, "$1");

// Both desktop builds keep their plugin code and translations this way: Discord's app (renderer.js) and Endcord
// Desktop (endcordDesktopRenderer.js). Returns what the loader tests below need
function checkRendererFile(name) {
    const file = readFileSync(join(ROOT, "dist", name));
    console.log(`\n${name}`);
    const layout = /\/\*endcord-layout (\d+) (\d+) (-?\d+)\*\/\n?$/.exec(file.toString("latin1", file.length - 96));
    check(`${name} ends with where its parts start`, !!layout);
    if (!layout) process.exit(1);
    const [chunksAt, dataAt, tablesAt] = layout.slice(1).map(Number);

    check("the chunk section starts where the last line says", file.toString("latin1", chunksAt, chunksAt + CHUNKS_MARKER.length) === CHUNKS_MARKER);
    check("the translations start where the last line says", tablesAt === -1 || file.toString("latin1", tablesAt, tablesAt + LOCALES_MARKER.length) === LOCALES_MARKER);

    const head = file.toString("utf-8", chunksAt, dataAt);
    const index = JSON.parse(head.slice(head.indexOf("\n", CHUNKS_MARKER.length) + 1, -1));
    const { c: ranges, d: deps, p: plugins } = index;
    check("every chunk has its imports listed", ranges.length === deps.length, { ranges: ranges.length, deps: deps.length });

    const dataEnd = tablesAt === -1 ? file.length : tablesAt;
    const section = file.toString("latin1", chunksAt, dataEnd);
    check("the chunk section is one comment", section.indexOf("*/") === section.length - 3, section.indexOf("*/"));

    const script = file.toString("utf-8", 0, chunksAt);
    check("the script itself never mentions the chunk data", !script.includes("EndcordChunks.c0=function"));
    check("the script is plain Latin-1, so V8 keeps it at one byte a character", !/[^\0-\xff]/.test(script));

    // Each chunk parses, defines itself under its own id, and only imports chunks that exist
    const context = { EndcordChunks: {} };
    const broken = [];
    const badDeps = [];
    let bytes = 0;
    for (let n = 0; n < ranges.length; n++) {
        const [offset, length] = ranges[n];
        bytes += length;
        const code = unescapeChunk(file.toString("utf-8", dataAt + offset, dataAt + offset + length));
        try {
            new Script(code, { filename: `chunk-${n}` }).runInNewContext(context);
            if (typeof context.EndcordChunks[`c${n}`] !== "function") broken.push(`c${n} defines nothing`);
        } catch (e) {
            broken.push(`c${n}: ${e.message}`);
        }
        if (/[^\0-\xff]/.test(code)) broken.push(`c${n} has a character past Latin-1`);
        for (const dep of deps[n]) if (!ranges[dep]) badDeps.push(`c${n} -> c${dep}`);
    }
    check(`all ${ranges.length} chunks parse and define themselves`, !broken.length, broken.slice(0, 5));
    check("chunks only import chunks that exist", !badDeps.length, badDeps.slice(0, 5));
    check("the chunk data adds up to the section", dataAt + bytes + 3 === dataEnd, { expected: dataEnd, got: dataAt + bytes + 3 });

    const names = Object.keys(plugins);
    check("lazy plugins are listed", names.length > 100, names.length);
    check("each lazy plugin has an entry chunk", names.every(name => ranges[plugins[name][0]]), names.filter(name => !ranges[plugins[name][0]]).slice(0, 5));
    check("plugins load with plugins that exist", names.every(name => (plugins[name][2] ?? []).every(other => other in plugins)));

    // The last two chunks are the build's own: what the plugin list shows of every lazy plugin, and the CSS of the core's
    // own screens
    const lastExports = n => {
        const module = { exports: {} };
        try {
            context.EndcordChunks[`c${n}`](null, module);
        } catch { }
        return module.exports;
    };
    const manifest = lastExports(ranges.length - 2);
    check("the plugin list knows every lazy plugin", names.every(name => manifest[name] && typeof manifest[name].d === "string"), names.filter(name => !manifest[name]).slice(0, 5));
    const screenCss = lastExports(ranges.length - 1);
    const screenKeys = Object.keys(screenCss);
    check("the core's screen styles are kept, by file", screenKeys.length > 5 && screenKeys.every(key => /^src\/.+\.css$/.test(key) && typeof screenCss[key] === "string"), screenKeys.slice(0, 5));
    check("the script queues every one of them", screenKeys.every(key => script.includes(JSON.stringify(key))), screenKeys.filter(key => !script.includes(JSON.stringify(key))).slice(0, 5));

    // A chunk the plugins of a fresh install need: all of them and what they import, as the preload would pick them
    const onByDefault = names.filter(name => plugins[name][1] & 3);
    const needed = new Set();
    const visit = n => {
        if (needed.has(n)) return;
        needed.add(n);
        for (const dep of deps[n]) visit(dep);
    };
    for (const name of onByDefault) visit(plugins[name][0]);
    const startupBytes = [...needed].reduce((total, n) => total + ranges[n][1], 0);
    console.log(`\n${names.length} lazy plugins in ${ranges.length} chunks, ${Math.round(bytes / 1024)} KB. Script ${Math.round(chunksAt / 1024)} KB; a fresh install also runs ${needed.size} chunks, ${Math.round(startupBytes / 1024)} KB`);
    return { file, chunksAt };
}
checkRendererFile("endcordDesktopRenderer.js");
const { file, chunksAt } = checkRendererFile("renderer.js");

// The first asynchronous file call in a window process starts Node's thread pool there, and Windows commits the 8 MB
// stack of each of its four threads up front: 32 MB for the whole session. The preload sticks to synchronous calls
for (const name of ["preload.js", "endcordDesktopPreload.js"]) {
    const preload = readFileSync(join(ROOT, "dist", name), "utf-8");
    const asyncFs = preload.match(/fs\/promises|\.promises\b|\.(readFile|writeFile|appendFile|rename|rm|unlink|mkdir|readdir|copyFile|access|lstat)\)?\(/g);
    check(`${name} makes no asynchronous file calls`, !asyncFs, asyncFs?.slice(0, 5));
}

// The preload's side (src/pluginChunkLoader.ts), with Electron's webFrame stubbed: a start without the startup file,
// one with it, and the cases where it must not be trusted
const OUT = join(ROOT, "dist", ".chunks-test");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await esbuild.build({
    entryPoints: [join(ROOT, "src", "pluginChunkLoader.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: join(OUT, "loader.cjs"), logLevel: "error", tsconfig: join(ROOT, "tsconfig.json"),
    define: { IS_DISCORD_DESKTOP: "true", IS_VESKTOP: "false" },
    plugins: [{
        name: "stub-electron",
        setup(b) {
            b.onResolve({ filter: /^electron\/renderer$/ }, () => ({ path: "electron", namespace: "stub" }));
            // The loader asks the page which chunks it never ran; __unused answers that
            b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const webFrame = { executeJavaScript: code => code.startsWith(\"Object.keys(window.EndcordChunks\") ? Promise.resolve(globalThis.__unused ?? []) : (globalThis.__ran.push(code), Promise.resolve()) };", loader: "js" }));
        }
    }]
});
const require = createRequire(import.meta.url);
const loader = () => {
    delete require.cache[require.resolve(join(OUT, "loader.cjs"))];
    globalThis.__ran = [];
    return require(join(OUT, "loader.cjs"));
};
const ran = () => globalThis.__ran;
// The startup file is written a while after the start; here right away
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, ms > 1000 ? 20 : ms);
const settle = () => new Promise(resolve => realSetTimeout(resolve, 300));

const rendererPath = join(OUT, "renderer.js");
const startupPath = join(OUT, "renderer.startup.cache");
copyFileSync(join(ROOT, "dist", "renderer.js"), rendererPath);
const someOn = { plugins: { Translate: { enabled: true } } };

let L = loader();
const firstScript = L.loadRenderer(rendererPath, someOn);
check("a start runs the script and nothing after it", firstScript === file.toString("utf-8", 0, chunksAt + 1));
check("the code of plugins that are on is defined before it", ran().length === 1 && ran()[0].includes("EndcordChunks.c"));
const turkish = L.readLocaleTable(rendererPath, "tr", "dict");
check("a translation table is read from the file", !!turkish && turkish.length > 1000);
await settle();
check("the start writes the startup file", existsSync(startupPath));

L = loader();
check("the next start gets the same script from the startup file", L.loadRenderer(rendererPath, someOn) === firstScript);
check("and the same plugin code", ran().length === 1 && ran()[0].includes("EndcordChunks.c"));
check("and the translation it read", L.readLocaleTable(rendererPath, "tr", "dict") === turkish);

const startupChunkIds = () => {
    const text = readFileSync(startupPath, "latin1");
    const header = /^\/\*endcord-startup (\d+)/.exec(text);
    const meta = JSON.parse(readFileSync(startupPath).toString("utf-8", text.indexOf("\n") + 1, text.indexOf("\n") + 1 + Number(header[1])));
    return meta.chunks.map(([n]) => n);
};
const before = startupChunkIds();
L = loader();
L.loadRenderer(rendererPath, someOn);
const writtenAt = statSync(startupPath).mtimeMs;
await settle();
check("a start that ran everything in the startup file leaves it as it is", statSync(startupPath).mtimeMs === writtenAt);

globalThis.__unused = [`c${before[0]}`];
L = loader();
L.loadRenderer(rendererPath, someOn);
await settle();
globalThis.__unused = [];
const after = startupChunkIds();
check("a chunk the start didn't run is left out of the startup file", !after.includes(before[0]) && after.length === before.length - 1, { before, after });

L = loader();
check("a plugin turned on since goes back to renderer.js", L.loadRenderer(rendererPath, { plugins: { Translate: { enabled: true }, FakeNitro: { enabled: true } } }) === firstScript && ran().length === 1);

writeFileSync(startupPath, "/*endcord-startup 1 1 1 1 not-a-key*/\ngarbage");
L = loader();
check("a damaged startup file is ignored", L.loadRenderer(rendererPath, someOn) === firstScript);

await settle();
L = loader();
L.loadRenderer(rendererPath, someOn);
await settle();
const later = new Date(Date.now() + 5000);
utimesSync(rendererPath, later, later);
L = loader();
check("a startup file from before renderer.js changed is ignored", L.loadRenderer(rendererPath, someOn) === firstScript && ran().length === 1);

L.loadPluginChunks(["c0"]);
check("a plugin's code is read on demand", ran().length === 2);
L.loadPluginChunks(["c99999", 5, null, "x1"]);
check("ids that aren't chunks do nothing", ran().length === 2);

writeFileSync(rendererPath, "// old\nrun();\n/*endcord-locales\ntr.dict {\"a\":\"b\"}\n*/\n");
rmSync(startupPath, { force: true });
L = loader();
check("a renderer.js from before chunks still runs", L.loadRenderer(rendererPath, someOn) === "// old\nrun();\n");
check("and its translations still read", L.readLocaleTable(rendererPath, "tr", "dict") === "{\"a\":\"b\"}");
globalThis.setTimeout = realSetTimeout;
rmSync(OUT, { recursive: true, force: true });

if (failed) {
    console.error(`\n${failed} FAILED`);
    process.exit(1);
}
console.log("\nALL PASSED");
