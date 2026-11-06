#!/usr/bin/node
/*
 * Endcord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// @ts-check

import esbuild from "esbuild";
import { readdir, readFile } from "fs/promises";
import { join, resolve } from "path";

import { getPluginTarget } from "../utils.mjs";
import { banner, BUILD_TIMESTAMP, buildOrWatchAll, commonOpts, commonRendererPlugins, exists, externalLocalesPlugin, globPlugins, IS_ANTI_CRASH_TEST, IS_DEV, IS_REPORTER, IS_STANDALONE, IS_UPDATER_DISABLED, isExcludedTarget, resolvePluginName, stringifyValues,stripLocales, VERSION, watch } from "./common.mjs";
import { buildChunkedRenderer } from "./pluginChunks.mjs";

const defines = stringifyValues({
    IS_STANDALONE,
    IS_DEV,
    IS_REPORTER,
    IS_ANTI_CRASH_TEST,
    IS_UPDATER_DISABLED,
    IS_WEB: false,
    IS_EXTENSION: false,
    IS_USERSCRIPT: false,
    VERSION,
    BUILD_TIMESTAMP
});

if (defines.IS_STANDALONE === "false") {
    // If this is a local build (not standalone), optimize
    // for the specific platform we're on
    defines["process.platform"] = JSON.stringify(process.platform);
}

/**
 * @type {import("esbuild").BuildOptions}
 */
const nodeCommonOpts = {
    ...commonOpts,
    define: defines,
    format: "cjs",
    platform: "node",
    target: ["esnext"],
    // @ts-expect-error this is never undefined
    external: ["electron", "original-fs", "~pluginNatives", ...commonOpts.external]
};

// Startup timing marks around the renderer bundle, readable via performance.getEntriesByName
// "use strict" must stay the first statement so the bundle keeps running in strict mode
const rendererBanner = { js: `${banner.js}\n"use strict";performance.mark("endcord:renderer:start");` };
const rendererFooter = s => `performance.mark("endcord:renderer:end");\n//# sourceURL=file:///${s}\n`;

const sourceMapFooter = s => watch ? "" : `//# sourceMappingURL=endcord://${s}.js.map`;
const sourcemap = watch ? "inline" : "external";

/**
 * The native.ts of every plugin this kind of build includes. Plugins left out of it (a .dev plugin in a release, a
 * .web one on desktop) don't bring their native code either
 * @type {(kind: "discordDesktop" | "vesktop") => import("esbuild").Plugin}
 */
const globNativesPlugin = kind => ({
    name: "glob-natives-plugin",
    setup: build => {
        const filter = /^~pluginNatives$/;
        build.onResolve({ filter }, args => {
            return {
                namespace: "import-natives",
                path: args.path
            };
        });

        build.onLoad({ filter, namespace: "import-natives" }, async () => {
            const pluginDirs = ["plugins", "userplugins"];
            let code = "";
            let natives = "\n";
            let i = 0;
            /**
             * @type {string[]}
             */
            const watchFiles = [];
            for (const dir of pluginDirs) {
                const dirPath = join("src", dir);
                if (!await exists(dirPath)) continue;
                const plugins = await readdir(dirPath, { withFileTypes: true });
                for (const file of plugins) {
                    const fileName = file.name;
                    const nativePath = join(dirPath, fileName, "native.ts");
                    const indexNativePath = join(dirPath, fileName, "native/index.ts");

                    watchFiles.push(resolve(nativePath), resolve(indexNativePath));

                    if (!(await exists(nativePath)) && !(await exists(indexNativePath)))
                        continue;

                    const target = getPluginTarget(fileName);
                    if (target && !IS_REPORTER && isExcludedTarget(target, kind)) continue;

                    const pluginName = await resolvePluginName(dirPath, file);

                    const mod = `p${i}`;
                    code += `import * as ${mod} from "./${dir}/${fileName}/native";\n`;
                    natives += `${JSON.stringify(pluginName)}:${mod},\n`;
                    i++;
                }
            }
            code += `export default {${natives}};`;
            return {
                contents: code,
                resolveDir: "./src",
                watchDirs: pluginDirs.map(d => resolve("src", d)),
                watchFiles,
            };
        });
    }
});

/**
 * The methods each plugin's native.ts exports, for the preload: the main process registers one IPC channel per method
 * under a fixed name (src/main/ipcPlugins.ts), so the preload can build its callers from this list instead of asking
 * the main process for it with a synchronous call while Discord is starting
 * @type {(kind: "discordDesktop" | "vesktop") => import("esbuild").Plugin}
 */
const nativeMethodsPlugin = kind => ({
    name: "native-methods",
    setup: build => {
        build.onResolve({ filter: /^~pluginNativeMethods$/ }, args => ({ namespace: "native-methods", path: args.path }));
        build.onLoad({ filter: /.*/, namespace: "native-methods" }, async () => {
            /** @type {Record<string, string>} */
            const entries = {};
            /** @type {Record<string, string>} */
            const names = {};
            let i = 0;
            for (const dir of ["plugins", "userplugins"]) {
                const dirPath = join("src", dir);
                if (!await exists(dirPath)) continue;
                for (const file of await readdir(dirPath, { withFileTypes: true })) {
                    const target = getPluginTarget(file.name);
                    if (target && !IS_REPORTER && isExcludedTarget(target, kind)) continue;

                    const native = [join(dirPath, file.name, "native.ts"), join(dirPath, file.name, "native/index.ts")];
                    const path = (await exists(native[0])) ? native[0] : (await exists(native[1])) ? native[1] : null;
                    if (!path) continue;

                    entries[`n${i}`] = resolve(path);
                    names[`n${i++}`] = await resolvePluginName(dirPath, file);
                }
            }

            // Bundled only to read the export names, so a native.ts that re-exports from another file is complete
            const { metafile } = await esbuild.build({
                entryPoints: entries,
                bundle: true,
                write: false,
                metafile: true,
                format: "esm",
                platform: "node",
                packages: "external",
                external: ["electron", "original-fs"],
                outdir: "dist/.native-methods",
                logLevel: "silent",
                plugins: /** @type {import("esbuild").Plugin[]} */ (commonOpts.plugins)
            });

            /** @type {Record<string, string[]>} */
            const methods = {};
            for (const output of Object.values(metafile.outputs)) {
                if (!output.entryPoint) continue;
                const id = Object.keys(entries).find(key => resolve(entries[key]) === resolve(/** @type {string} */ (output.entryPoint)));
                if (id && output.exports.length) methods[names[id]] = output.exports;
            }

            return { contents: `export default ${JSON.stringify(methods)};`, loader: "js", watchFiles: Object.values(entries) };
        });
    }
});

/** @param {import("./common.mjs").PluginChunkState} [chunks] */
const discordRendererPlugins = chunks => [
    globPlugins("discordDesktop", chunks),
    externalLocalesPlugin,
    ...commonRendererPlugins
];

/** Endcord Desktop keeps its plugin code and translations the same way (see desktop/) */
/** @param {import("./common.mjs").PluginChunkState} [chunks] */
const desktopRendererPlugins = chunks => [
    globPlugins("vesktop", chunks),
    externalLocalesPlugin,
    ...commonRendererPlugins
];

/** @type {import("esbuild").BuildOptions[]} */
const buildConfigs = ([
    // Discord Desktop main & renderer & preload
    {
        ...nodeCommonOpts,
        entryPoints: ["src/main/index.ts"],
        outfile: "dist/patcher.js",
        footer: { js: `//# sourceURL=file:///EndcordPatcher\n${sourceMapFooter("patcher")}` },
        sourcemap,
        plugins: [
            // @ts-ignore this is never undefined
            ...nodeCommonOpts.plugins,
            globNativesPlugin("discordDesktop")
        ],
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "true",
            IS_VESKTOP: "false"
        }
    },
    {
        ...commonOpts,
        entryPoints: ["src/Endcord.ts"],
        outfile: "dist/renderer.js",
        format: "iife",
        target: ["esnext"],
        banner: rendererBanner,
        footer: { js: rendererFooter("EndcordRenderer") + sourceMapFooter("renderer") },
        globalName: "Endcord",
        sourcemap,
        plugins: discordRendererPlugins(),
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "true",
            IS_VESKTOP: "false"
        }
    },
    {
        ...nodeCommonOpts,
        entryPoints: ["src/preload.ts"],
        outfile: "dist/preload.js",
        footer: { js: `//# sourceURL=file:///EndcordPreload\n${sourceMapFooter("preload")}` },
        sourcemap,
        plugins: [
            // @ts-ignore this is never undefined
            ...nodeCommonOpts.plugins,
            nativeMethodsPlugin("discordDesktop")
        ],
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "true",
            IS_VESKTOP: "false"
        }
    },

    // Endcord Desktop main & renderer & preload
    {
        ...nodeCommonOpts,
        entryPoints: ["src/main/index.ts"],
        outfile: "dist/endcordDesktopMain.js",
        footer: { js: `//# sourceURL=file:///EndcordDesktopMain\n${sourceMapFooter("endcordDesktopMain")}` },
        sourcemap,
        plugins: [
            ...nodeCommonOpts.plugins,
            globNativesPlugin("vesktop")
        ],
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "false",
            IS_VESKTOP: "true"
        }
    },
    {
        ...commonOpts,
        entryPoints: ["src/Endcord.ts"],
        outfile: "dist/endcordDesktopRenderer.js",
        format: "iife",
        target: ["esnext"],
        banner: rendererBanner,
        footer: { js: rendererFooter("EndcordDesktopRenderer") + sourceMapFooter("endcordDesktopRenderer") },
        globalName: "Endcord",
        sourcemap,
        plugins: desktopRendererPlugins(),
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "false",
            IS_VESKTOP: "true"
        }
    },
    {
        ...nodeCommonOpts,
        entryPoints: ["src/preload.ts"],
        outfile: "dist/endcordDesktopPreload.js",
        footer: { js: `//# sourceURL=file:///EndcordPreload\n${sourceMapFooter("endcordDesktopPreload")}` },
        sourcemap,
        plugins: [
            // @ts-ignore this is never undefined
            ...nodeCommonOpts.plugins,
            nativeMethodsPlugin("vesktop")
        ],
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "false",
            IS_VESKTOP: "true"
        }
    }
]);

// Both desktop renderers keep the code of lazy plugins outside their script (see ./pluginChunks.mjs).
// Watch and reporter builds keep everything in the script
const CHUNKED_RENDERER = !watch && !IS_REPORTER && !process.env.ENDCORD_NO_PLUGIN_CHUNKS;
/** @type {[string, (chunks?: import("./common.mjs").PluginChunkState) => import("esbuild").Plugin[]][]} */
const chunkedRenderers = [["dist/renderer.js", discordRendererPlugins], ["dist/endcordDesktopRenderer.js", desktopRendererPlugins]];
const chunkedConfigs = CHUNKED_RENDERER ? chunkedRenderers.map(([outfile, plugins]) => /** @type {const} */ ([buildConfigs.find(c => c.outfile === outfile), plugins])) : [];

await Promise.all([
    buildOrWatchAll(buildConfigs.filter(c => !chunkedConfigs.some(([chunked]) => chunked === c))),
    ...chunkedConfigs.map(([config, plugins]) => config && buildChunkedRenderer({ ...config, plugins: undefined }, plugins, commonRendererPlugins)
        .catch(error => {
            console.error(error.message);
            process.exit(1);
        }))
]);

// V8 stores a script's source at two bytes per character once a single character is outside Latin-1,
// which doubles the renderer's source memory. esbuild escapes strings but not regex literals, so write
// such characters as \uXXXX there. The translation tables after the renderer's code never run, so they may hold any.
if (!watch && !IS_REPORTER) {
    for (const file of ["dist/renderer.js", "dist/patcher.js", "dist/preload.js", "dist/endcordDesktopRenderer.js", "dist/endcordDesktopMain.js", "dist/endcordDesktopPreload.js"]) {
        if (!await exists(file)) continue;
        const text = stripLocales(await readFile(file, "utf8"));
        const at = text.search(/[^\0-\xFF]/u);
        if (at === -1) continue;
        console.error(`${file} has a character outside Latin-1 near: ${JSON.stringify(text.slice(Math.max(0, at - 60), at + 20))}`);
        console.error("Write it as \\uXXXX in the regex literal it comes from.");
        process.exitCode = 1;
    }
}
