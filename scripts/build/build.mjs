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

import { readdir, readFile } from "fs/promises";
import { join, resolve } from "path";

import { banner, BUILD_TIMESTAMP, commonOpts, exists, globPlugins, IS_DEV, IS_REPORTER, IS_ANTI_CRASH_TEST, IS_STANDALONE, IS_UPDATER_DISABLED, resolvePluginName, VERSION, commonRendererPlugins, watch, buildOrWatchAll, stringifyValues } from "./common.mjs";

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
const rendererBanner = { js: banner.js + '\n"use strict";performance.mark("endcord:renderer:start");' };
const rendererFooter = s => `performance.mark("endcord:renderer:end");\n//# sourceURL=file:///${s}\n`;

const sourceMapFooter = s => watch ? "" : `//# sourceMappingURL=endcord://${s}.js.map`;
const sourcemap = watch ? "inline" : "external";

/**
 * @type {import("esbuild").Plugin}
 */
const globNativesPlugin = {
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
};

/** @type {import("esbuild").BuildOptions[]} */
const buildConfigs = ([
    // Discord Desktop main & renderer & preload
    {
        ...nodeCommonOpts,
        entryPoints: ["src/main/index.ts"],
        outfile: "dist/patcher.js",
        footer: { js: "//# sourceURL=file:///EndcordPatcher\n" + sourceMapFooter("patcher") },
        sourcemap,
        plugins: [
            // @ts-ignore this is never undefined
            ...nodeCommonOpts.plugins,
            globNativesPlugin
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
        plugins: [
            globPlugins("discordDesktop"),
            ...commonRendererPlugins
        ],
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
        footer: { js: "//# sourceURL=file:///EndcordPreload\n" + sourceMapFooter("preload") },
        sourcemap,
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
        footer: { js: "//# sourceURL=file:///EndcordDesktopMain\n" + sourceMapFooter("endcordDesktopMain") },
        sourcemap,
        plugins: [
            ...nodeCommonOpts.plugins,
            globNativesPlugin
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
        plugins: [
            globPlugins("vesktop"),
            ...commonRendererPlugins
        ],
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
        footer: { js: "//# sourceURL=file:///EndcordPreload\n" + sourceMapFooter("endcordDesktopPreload") },
        sourcemap,
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "false",
            IS_VESKTOP: "true"
        }
    }
]);

await buildOrWatchAll(buildConfigs);

// V8 stores a script's source at two bytes per character once a single character is outside Latin-1,
// which doubles the renderer's source memory. esbuild escapes strings but not regex literals, so write
// such characters as \uXXXX there.
if (!watch) {
    for (const file of ["dist/renderer.js", "dist/patcher.js", "dist/preload.js"]) {
        if (!await exists(file)) continue;
        const text = await readFile(file, "utf8");
        const at = text.search(/[^\0-\xFF]/u);
        if (at === -1) continue;
        console.error(`${file} has a character outside Latin-1 near: ${JSON.stringify(text.slice(Math.max(0, at - 60), at + 20))}`);
        console.error("Write it as \\uXXXX in the regex literal it comes from.");
        process.exitCode = 1;
    }
}
