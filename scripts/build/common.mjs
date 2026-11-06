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

import "../suppressExperimentalWarnings.js";
import "../checkNodeVersion.js";

import { execSync } from "child_process";
import esbuild, { build, context } from "esbuild";
import { constants as FsConstants, readFileSync } from "fs";
import { access, appendFile, readdir, readFile } from "fs/promises";
import { minify as minifyHtml } from "html-minifier-terser";
import { builtinModules } from "module";
import { join, relative, resolve } from "path";
import { optimize as optimizeSvg } from "svgo";
import { runInNewContext } from "vm";

import { getPluginTarget } from "../utils.mjs";
import { createLazyPluginAnalyzer } from "./lazyPlugins.mjs";

/** @type {import("../../package.json")} */
const PackageJSON = JSON.parse(readFileSync("package.json", "utf-8"));

export const VERSION = PackageJSON.version;
// https://reproducible-builds.org/docs/source-date-epoch/
export const BUILD_TIMESTAMP = Number(process.env.SOURCE_DATE_EPOCH) || Date.now();

export const watch = process.argv.includes("--watch");
export const IS_DEV = watch || process.argv.includes("--dev");
export const IS_REPORTER = process.argv.includes("--reporter");
export const IS_ANTI_CRASH_TEST = process.argv.includes("--anti-crash-test");
export const IS_STANDALONE = process.argv.includes("--standalone");

export const IS_UPDATER_DISABLED = process.argv.includes("--disable-updater");
export const gitHash = process.env.ENDCORD_HASH || (() => {
    try {
        return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    } catch {
        return "main";
    }
})();

export const banner = {
    js: `
// Endcord ${gitHash}
// Standalone: ${IS_STANDALONE}
// Platform: ${IS_STANDALONE === false ? process.platform : "Universal"}
// Updater Disabled: ${IS_UPDATER_DISABLED}
`.trim()
};

/**
 * JSON.stringify all values in an object
 * @type {(obj: Record<string, any>) => Record<string, string>}
 */
export function stringifyValues(obj) {
    for (const key in obj) {
        obj[key] = JSON.stringify(obj[key]);
    }
    return obj;
}

/**
 * @param {import("esbuild").BuildOptions[]} buildConfigs
 */
export async function buildOrWatchAll(buildConfigs) {
    if (watch) {
        await Promise.all(buildConfigs.map(cfg =>
            context(cfg).then(ctx => ctx.watch())
        ));
    } else {
        await Promise.all(buildConfigs.map(async cfg => {
            const res = await build(process.env.ENDCORD_METAFILE ? { ...cfg, metafile: true } : cfg);
            if (res.metafile) (await import("fs")).writeFileSync(`${cfg.outfile ?? cfg.outdir}.meta.json`, JSON.stringify(res.metafile));
            return res;
        }))
            .catch(error => {
                console.error(error.message);
                process.exit(1); // exit immediately to skip the rest of the builds
            });
    }
}

const PluginDefinitionNameMatcher = /definePlugin\(\{\s*(["'])?name\1:\s*(["'`])(.+?)\2/;
/**
 * @param {string} base
 * @param {import("fs").Dirent} dirent
 */
export async function resolvePluginName(base, dirent) {
    const fullPath = join(base, dirent.name);
    const content = dirent.isFile()
        ? await readFile(fullPath, "utf-8")
        : await (async () => {
            for (const file of ["index.ts", "index.tsx"]) {
                try {
                    return await readFile(join(fullPath, file), "utf-8");
                } catch {
                    continue;
                }
            }
            throw new Error(`Invalid plugin ${fullPath}: could not resolve entry point`);
        })();

    return PluginDefinitionNameMatcher.exec(content)?.[3]
        ?? (() => {
            throw new Error(`Invalid plugin ${fullPath}: must contain definePlugin call with simple string name property as first property`);
        })();
}

export async function exists(path) {
    return await access(path, FsConstants.F_OK)
        .then(() => true)
        .catch(() => false);
}

// https://github.com/evanw/esbuild/issues/619#issuecomment-751995294
/**
 * @type {import("esbuild").Plugin}
 */
export const makeAllPackagesExternalPlugin = {
    name: "make-all-packages-external",
    setup(build) {
        const filter = /^[^./]|^\.[^./]|^\.\.[^/]/; // Must not start with "/" or "./" or "../"
        build.onResolve({ filter }, args => ({ path: args.path, external: true }));
    }
};

/**
 * Whether a plugin with this target suffix (myPlugin.dev, myPlugin.desktop...) stays out of a build of this kind
 * @param {string} target
 * @param {"web" | "discordDesktop" | "vesktop"} kind
 */
export const isExcludedTarget = (target, kind) =>
    (target === "dev" && !IS_DEV) ||
    (target === "web" && kind === "discordDesktop") ||
    (target === "desktop" && kind === "web") ||
    (target === "discordDesktop" && kind !== "discordDesktop") ||
    (target === "vesktop" && kind !== "vesktop");

/**
 * State shared by the passes of the chunked desktop renderer build (see ./pluginChunks.mjs). Without it, lazy plugins
 * are bundled into the script as before.
 * @typedef {{
 *   lazy: { name: string, entry: string, folderName: string, required: boolean, enabledByDefault: boolean, loadsWith: string[], info: import("./lazyPlugins.mjs").PluginListInfo }[],
 *   manifestChunk?: string,
 *   screenChunk?: string,
 *   screenCss?: Record<string, string>,
 *   entryIds?: Record<string, string>,
 *   exposes?: { key: string, spec: string, resolveDir: string, names: string[] | "*" }[]
 * }} PluginChunkState
 */

/**
 * The file a plugin entry (a folder with an index file, or a single file) starts from
 * @param {string} base
 * @param {import("fs").Dirent} dirent
 */
async function resolvePluginEntry(base, dirent) {
    const fullPath = resolve(base, dirent.name);
    if (dirent.isFile()) return fullPath;
    for (const file of ["index.ts", "index.tsx"]) {
        if (await exists(join(fullPath, file))) return join(fullPath, file);
    }
    throw new Error(`Invalid plugin ${fullPath}: could not resolve entry point`);
}

/**
 * The loader for plugin code kept outside the script, and the table of core modules that code imports
 * @param {PluginChunkState} chunks
 */
function pluginChunkRuntime(chunks) {
    // Each is required on first use, so a module the core only loads on demand stays that way
    const getters = (chunks.exposes ?? []).map(({ key }, i) =>
        key === "import-plugins:~plugins" ? "$selfModule" : `()=>require("~endcord-expose:${i}")`);

    const runtime = readFileSync("./scripts/build/module/pluginChunkRuntime.js", "utf-8");
    return `${runtime}\nconst $coreModules=[${getters.join(",")}];\nconst $manifestChunk=${JSON.stringify(chunks.manifestChunk ?? "")};\nconst $screenChunk=${JSON.stringify(chunks.screenChunk ?? "")};\n`;
}

/**
 * @type {(kind: "web" | "discordDesktop" | "vesktop", chunks?: PluginChunkState) => import("esbuild").Plugin}
 */
export const globPlugins = (kind, chunks) => ({
    name: "glob-plugins",
    setup: build => {
        const filter = /^~plugins$/;
        build.onResolve({ filter }, args => {
            return {
                namespace: "import-plugins",
                path: args.path
            };
        });

        if (chunks) {
            // Core modules that plugin code outside the script imports, each read through its own small module so
            // it resolves exactly as it did from the plugin. Files are reached by their absolute path instead
            build.onResolve({ filter: /^~endcord-expose:\d+$/ }, args => ({ namespace: "endcord-expose", path: args.path }));
            build.onLoad({ filter: /.*/, namespace: "endcord-expose" }, ({ path }) => {
                const expose = chunks.exposes?.[Number(path.slice(path.indexOf(":") + 1))];
                if (!expose) throw new Error(`Unknown core export ${path}`);
                // Only the names the chunks import, so the rest of the module can still be left out of the core
                const contents = expose.names === "*"
                    ? `module.exports = require(${JSON.stringify(expose.spec)});`
                    : `export { ${expose.names.join(", ")} } from ${JSON.stringify(expose.spec)};`;
                return { contents, resolveDir: expose.resolveDir };
            });

            // The core's own screen styles only matter once one of its screens draws, so their CSS goes with the
            // plugin chunks and the script queues where each one is (see enableScreenStyles in @api/Styles). Plugin
            // chunks keep theirs inline: those are built without this plugin. Registered before the style plugin,
            // so this one answers
            build.onLoad({ filter: /\.css$/, namespace: "screen-style" }, async ({ path }) => {
                let css = await readFile(path, "utf-8");
                if (!watch) css = (await esbuild.transform(css, { loader: "css", minify: true, target: ["chrome120"] })).code;
                const key = relative(process.cwd(), path).replaceAll("\\", "/");
                (chunks.screenCss ??= {})[key] = css;
                return { loader: "js", contents: `(window.EndcordScreenStyles ??= []).push({ k: ${JSON.stringify(key)} });` };
            });
        }

        build.onLoad({ filter, namespace: "import-plugins" }, async () => {
            const pluginDirs = ["plugins/_api", "plugins/_core", "plugins", "userplugins"];
            if (chunks) chunks.lazy = [];
            const analyzeLazy = createLazyPluginAnalyzer();
            let code = "";
            let pluginsCode = "\n";
            let metaCode = "\n";
            let excludedCode = "\n";
            let i = 0;
            /** @type {string[]} Lazy plugins of the chunked build since the last eager one, kept in directory order */
            const lazyRecords = [];
            const flushLazyRecords = () => {
                if (lazyRecords.length) pluginsCode += `$lazyTable(${JSON.stringify(lazyRecords.join(";"))});\n`;
                lazyRecords.length = 0;
            };
            for (const dir of pluginDirs) {
                const userPlugin = dir === "userplugins";

                const fullDir = `./src/${dir}`;
                if (!await exists(fullDir)) continue;
                const files = await readdir(fullDir, { withFileTypes: true });
                for (const file of files) {
                    const fileName = file.name;
                    if (fileName.startsWith("_") || fileName.startsWith(".")) continue;
                    if (fileName === "index.ts") continue;

                    const target = getPluginTarget(fileName);

                    if (target && !IS_REPORTER) {
                        if (isExcludedTarget(target, kind)) {
                            const name = await resolvePluginName(fullDir, file);
                            excludedCode += `${JSON.stringify(name)}:${JSON.stringify(target)},\n`;
                            continue;
                        }
                    }

                    const folderName = `src/${dir}/${fileName}`.replace(/^src\/plugins\//, "");

                    const mod = `p${i}`;
                    const importPath = `./${dir}/${fileName.replace(/\.tsx?$/, "")}`;
                    const lazy = IS_REPORTER ? { lazy: false, loadsWith: [], required: false, enabledByDefault: false, migratesFrom: [], info: { d: "" } } : await analyzeLazy(dir, fileName);
                    const loadsWith = lazy.loadsWith.length ? { loadsWith: lazy.loadsWith } : {};
                    // The registry key has to be known without running the plugin
                    const name = lazy.lazy ? await resolvePluginName(fullDir, file).catch(() => null) : null;
                    if (lazy.lazy && name && chunks) {
                        // The code sits outside the script, in the chunk the second pass gave it. Its registry entry
                        // goes in a compact table, read at startup (see $lazyTable)
                        chunks.lazy.push({ name, entry: await resolvePluginEntry(fullDir, file), folderName, required: lazy.required, enabledByDefault: lazy.enabledByDefault, loadsWith: lazy.loadsWith, info: lazy.info });
                        const flags = (lazy.enabledByDefault ? 1 : 0) | (lazy.required ? 2 : 0) | (userPlugin ? 4 : 0);
                        const defaultFolder = name[0].toLowerCase() + name.slice(1);
                        const record = [name, chunks.entryIds?.[name]?.slice(1) ?? "", folderName === defaultFolder ? "" : folderName, flags || "", lazy.migratesFrom.join(","), lazy.loadsWith.join(",")];
                        if (record.some(field => /[|;]/.test(String(field)))) throw new Error(`Plugin ${name} has a name the registry table can't hold`);
                        lazyRecords.push(record.join("|").replace(/\|+$/, ""));
                    } else if (lazy.lazy && name) {
                        pluginsCode += `$lazy(${JSON.stringify(name)},()=>require(${JSON.stringify(importPath)}).default);\n`;
                        metaCode += `[${JSON.stringify(name)}]:${JSON.stringify({ folderName, userPlugin, required: lazy.required, enabledByDefault: lazy.enabledByDefault, ...(lazy.migratesFrom.length && { migratesFrom: lazy.migratesFrom }), ...loadsWith })},\n`;
                    } else if (chunks) {
                        flushLazyRecords();
                        code += `import ${mod} from "${importPath}";\n`;
                        pluginsCode += `$eager(${mod});$meta[${mod}.name]=${JSON.stringify({ folderName, userPlugin, ...loadsWith })};\n`;
                    } else {
                        code += `import ${mod} from "${importPath}";\n`;
                        pluginsCode += `$eager(${mod});\n`;
                        metaCode += `[${mod}.name]:${JSON.stringify({ folderName, userPlugin, ...loadsWith })},\n`;
                    }
                    i++;
                }
            }
            flushLazyRecords();
            if (process.env.ENDCORD_LAZY_REPORT) console.log(`[${kind}] lazy plugins: ${pluginsCode.split("$lazy(").length - 1}, eager: ${pluginsCode.split("$eager(").length - 1}`);
            code += readFileSync("./scripts/build/module/lazyPluginRegistry.js", "utf-8");
            code += chunks ? pluginChunkRuntime(chunks) : "export function preloadPluginCode() {}\nexport function getPluginListInfo() {}\nexport function getScreenStyle() { return \"\"; }\n";
            code += pluginsCode;
            code += chunks
                ? `export default plugins;export const PluginMeta=$meta;export const ExcludedPlugins={${excludedCode}};`
                : `export default plugins;export const PluginMeta={${metaCode}};export const ExcludedPlugins={${excludedCode}};`;
            return {
                contents: code,
                resolveDir: "./src",
                watchDirs: pluginDirs.map(d => resolve("src", d)),
            };
        });
    }
});

/**
 * @type {import("esbuild").Plugin}
 */
export const gitHashPlugin = {
    name: "git-hash-plugin",
    setup: build => {
        const filter = /^~git-hash$/;
        build.onResolve({ filter }, args => ({
            namespace: "git-hash", path: args.path
        }));
        build.onLoad({ filter, namespace: "git-hash" }, () => ({
            contents: `export default "${gitHash}"`
        }));
    }
};

/**
 * @type {import("esbuild").Plugin}
 */
export const gitRemotePlugin = {
    name: "git-remote-plugin",
    setup: build => {
        const filter = /^~git-remote$/;
        build.onResolve({ filter }, args => ({
            namespace: "git-remote", path: args.path
        }));
        build.onLoad({ filter, namespace: "git-remote" }, async () => {
            const remote = process.env.ENDCORD_REMOTE || "Endcord/Endcord";
            return { contents: `export default "${remote}"` };
        });
    }
};

/**
 * @type {import("esbuild").Plugin}
 */
export const fileUrlPlugin = {
    name: "file-uri-plugin",
    setup: build => {
        const filter = /^file:\/\/.+$/;
        build.onResolve({ filter }, args => ({
            namespace: "file-uri",
            path: args.path,
            pluginData: {
                uri: args.path,
                path: join(args.resolveDir, args.path.slice("file://".length).split("?")[0])
            }
        }));
        build.onLoad({ filter, namespace: "file-uri" }, async ({ pluginData: { path, uri } }) => {
            const { searchParams } = new URL(uri);
            const base64 = searchParams.has("base64");
            const minify = searchParams.has("minify");
            const noTrim = searchParams.get("trim") === "false";

            const encoding = base64 ? "base64" : "utf-8";

            let content;
            if (!minify) {
                content = await readFile(path, encoding);
                if (!noTrim) content = content.trimEnd();
            } else {
                if (path.endsWith(".html")) {
                    content = await minifyHtml(await readFile(path, "utf-8"), {
                        collapseWhitespace: true,
                        removeComments: true,
                        minifyCSS: true,
                        minifyJS: true,
                        removeEmptyAttributes: true,
                        removeRedundantAttributes: true,
                        removeScriptTypeAttributes: true,
                        removeStyleLinkTypeAttributes: true,
                        useShortDoctype: true
                    });
                } else if (path.endsWith(".svg")) {
                    content = optimizeSvg(await readFile(path, "utf-8"), {
                        datauri: base64 ? "base64" : void 0,
                        multipass: true,
                        floatPrecision: 2,
                    }).data;
                } else if (/[mc]?[jt]sx?$/.test(path)) {
                    const res = await esbuild.build({
                        entryPoints: [path],
                        write: false,
                        minify: true
                    });
                    content = res.outputFiles[0].text;
                } else {
                    throw new Error(`Don't know how to minify file type: ${path}`);
                }

                if (base64 && !content.startsWith("data:"))
                    content = Buffer.from(content).toString("base64");
            }

            return {
                contents: `export default ${JSON.stringify(content)}`
            };
        });
    }
};

const styleModule = readFileSync("./scripts/build/module/style.js", "utf-8");
/**
 * @type {import("esbuild").Plugin}
 */
export const stylePlugin = {
    name: "style-plugin",
    setup: ({ onResolve, onLoad }) => {
        onResolve({ filter: /\.css\?managed$/, namespace: "file" }, ({ path, resolveDir }) => ({
            path: relative(process.cwd(), join(resolveDir, path.replace("?managed", ""))),
            namespace: "managed-style",
        }));
        // `import "./style.css?screen"` is for Endcord's own screens: kept in the script and only added to the page
        // the first time one of them is drawn (enableScreenStyles in @api/Styles)
        onResolve({ filter: /\.css\?screen$/, namespace: "file" }, ({ path, resolveDir }) => ({
            path: relative(process.cwd(), join(resolveDir, path.replace("?screen", ""))),
            namespace: "screen-style",
        }));
        // Plain `import "./style.css"` inside a plugin folder would otherwise land in renderer.css and apply
        // to Discord even while the plugin is disabled. Register it as a style owned by that plugin folder
        // instead, so the PluginManager only injects it while the plugin is running.
        // Settings styles stay global because plugin settings can be opened while the plugin is disabled.
        onResolve({ filter: /^\.\.?\/.*\.css$/, namespace: "file" }, ({ path, resolveDir }) => {
            const file = relative(process.cwd(), join(resolveDir, path)).replaceAll("\\", "/");
            const folder = /^src\/plugins\/([^_/][^/]*)\//.exec(file)?.[1];
            const importer = relative(process.cwd(), resolveDir).replaceAll("\\", "/");
            if (!folder || /settings/i.test(file) || /settings/i.test(importer)) return;

            return { path: file, namespace: "plugin-style", pluginData: { folder } };
        });
        onLoad({ filter: /\.css$/, namespace: "plugin-style" }, async ({ path, pluginData: { folder } }) => {
            let css = await readFile(path, "utf-8");
            if (!watch) css = (await esbuild.transform(css, { loader: "css", minify: true, target: ["chrome120"] })).code;

            return {
                loader: "js",
                contents: `${styleModule
                    .replaceAll("STYLE_SOURCE", JSON.stringify(css))
                    .replaceAll("STYLE_NAME", JSON.stringify(path))
                     }\n((window.EndcordPluginStyles ??= {})[${JSON.stringify(folder)}] ??= []).push(${JSON.stringify(path)});\n`
            };
        });
        onLoad({ filter: /\.css$/, namespace: "screen-style" }, async ({ path }) => {
            let css = await readFile(path, "utf-8");
            if (!watch) css = (await esbuild.transform(css, { loader: "css", minify: true, target: ["chrome120"] })).code;

            return {
                loader: "js",
                contents: `(window.EndcordScreenStyles ??= []).push(${JSON.stringify(css)});`
            };
        });
        onLoad({ filter: /\.css$/, namespace: "managed-style" }, async ({ path }) => {
            const css = await readFile(path, "utf-8");
            const name = relative(process.cwd(), path).replaceAll("\\", "/");

            return {
                loader: "js",
                contents: styleModule
                    .replaceAll("STYLE_SOURCE", JSON.stringify(css))
                    .replaceAll("STYLE_NAME", JSON.stringify(name))
            };
        });
    }
};

/**
 * @type {(filter: RegExp, message: string) => import("esbuild").Plugin}
 */
export const banImportPlugin = (filter, message) => ({
    name: "ban-imports",
    setup: build => {
        build.onResolve({ filter }, () => {
            return { errors: [{ text: message }] };
        });
    }
});

/**
 * @type {import("esbuild").BuildOptions}
 */
export const commonOpts = {
    logLevel: "info",
    bundle: true,
    minify: !watch && !IS_REPORTER,
    sourcemap: watch ? "inline" : "external",
    legalComments: "linked",
    banner,
    plugins: [fileUrlPlugin, gitHashPlugin, gitRemotePlugin, stylePlugin],
    external: ["~plugins", "~git-hash", "~git-remote", "/assets/*"],
    inject: ["./scripts/build/inject/react.mjs"],
    jsx: "transform",
    jsxFactory: "EndcordCreateElement",
    jsxFragment: "EndcordFragment"
};

const escapedBuiltinModules = builtinModules
    .map(m => m.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    .join("|");
const builtinModuleRegex = new RegExp(`^(node:)?(${escapedBuiltinModules})$`);

// Must match LOCALES_MARKER in src/shared/externalLocales.ts
const LOCALES_MARKER = "\n/*endcord-locales\n";

/** A desktop renderer's code without the translation tables after it */
export const stripLocales = text => {
    const at = text.lastIndexOf(LOCALES_MARKER);
    return at === -1 ? text : text.slice(0, at);
};

const LOCALE_TABLE_FILE =/[\\/]src[\\/]utils[\\/]i18n[\\/](locales|pluginDescriptions)[\\/]([a-z]{2})\.ts$/;

/** Evaluates a translation table source file to its plain object */
async function readLocaleTable(path) {
    const source = await readFile(path, "utf-8");
    const { code } = await esbuild.transform(source, { loader: "ts", format: "cjs" });

    // The table is plain data. Its only import is a type, which the transform already dropped
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, require: () => ({}) });
    const table = module.exports.default();
    if (!Object.values(table).every(value => typeof value === "string")) throw new Error(`${path}: every translation must be a string`);
    return table;
}

/**
 * The Discord desktop renderer leaves its translation tables out of the code: they go after it in renderer.js as plain
 * UTF-8 JSON inside one block comment, and the preload cuts them off before running the script (see
 * @shared/externalLocales). V8 keeps a script's whole source in memory, and the tables were a third of it while each
 * person uses one language at most. Must come before packLocalesPlugin. Watch builds keep the tables inline
 * @type {import("esbuild").Plugin}
 */
export const externalLocalesPlugin = {
    name: "external-locales",
    setup(build) {
        if (watch) return;

        /** @type {Map<string, string>} */
        const tables = new Map();

        build.onLoad({ filter: LOCALE_TABLE_FILE }, async ({ path }) => {
            const [, folder, lang] = LOCALE_TABLE_FILE.exec(path) ?? [];
            const kind = folder === "locales" ? "dict" : "desc";
            // One line of JSON, which never holds a raw newline; "*\/" keeps "*" "/" from ending the comment
            tables.set(`${lang}.${kind}`, JSON.stringify(await readLocaleTable(path)).replaceAll("*/", "*\\/"));

            return {
                contents: `import { loadExternalTable } from "@utils/i18n/unpack";\nexport default () => loadExternalTable(${JSON.stringify(lang)}, ${JSON.stringify(kind)});`,
                loader: "ts",
                resolveDir: resolve(path, "..")
            };
        });

        build.onEnd(async result => {
            if (result.errors.length) return;

            const { outfile } = build.initialOptions;
            if (!outfile) throw new Error("external-locales needs an outfile");

            const lines = [...tables].sort(([a], [b]) => a.localeCompare(b)).map(([key, json]) => `${key} ${json}`);
            await appendFile(outfile, `${LOCALES_MARKER}${lines.join("\n")}\n*/\n`);
        });
    }
};

/**
 * The web renderers are kept to Latin-1 like the desktop one (see the check at the end of build.mjs), so esbuild writes
 * every other character as a six-byte \u escape. In the Russian translations that's most of the text. Packed as base64
 * of the UTF-8 JSON it takes well under half the room, and only the language in use is ever unpacked (see
 * @utils/i18n/unpack). A table is only packed when that comes out smaller, which for the mostly-Latin languages it doesn't
 * @type {import("esbuild").Plugin}
 */
export const packLocalesPlugin = {
    name: "pack-locales",
    setup(build) {
        if (watch) return;

        build.onLoad({ filter: LOCALE_TABLE_FILE }, async ({ path }) => {
            const table = await readLocaleTable(path);

            const json = JSON.stringify(table);
            const escapedSize = json.replace(/[^\0-\x7E]/g, "\\uXXXX").length;
            const packed = Buffer.from(json, "utf-8").toString("base64");
            if (packed.length >= escapedSize) return undefined;

            return {
                contents: `import { unpackTable } from "@utils/i18n/unpack";\nexport default () => unpackTable(${JSON.stringify(packed)});`,
                loader: "ts",
                resolveDir: resolve(path, "..")
            };
        });
    }
};

export const commonRendererPlugins = [
    packLocalesPlugin,
    banImportPlugin(builtinModuleRegex, "Cannot import node inbuilt modules in browser code. You need to use a native.ts file"),
    banImportPlugin(/^react$/, "Cannot import from react. React and hooks should be imported from @webpack/common"),
    banImportPlugin(/^electron(\/.*)?$/, "Cannot import electron in browser code. You need to use a native.ts file"),
    banImportPlugin(/^ts-pattern$/, "Cannot import from ts-pattern. match and P should be imported from @webpack/common"),
    // @ts-expect-error this is never undefined
    ...commonOpts.plugins
];
