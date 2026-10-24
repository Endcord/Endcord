/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-check

// Decides which plugins can be loaded lazily. A lazy plugin's module is only evaluated the first time its
// plugin object is accessed (it is enabled, its settings are read, or the plugins tab lists it), so disabled
// plugins cost nothing at startup. Anything we cannot prove safe stays eager, exactly as before.

import { readdir, readFile, stat } from "fs/promises";
import { dirname, join, relative, resolve } from "path";

const PLUGIN_ALIASES = ["@plugins/", "@endcordplugins/", "@equicordplugins/"];
const ALIAS_FOLDER_REMAP = { equicordToolbox: "endcordToolbox" };
// Calls that move settings between plugin names at module load. They only matter when the user still has
// settings under the old name, so the plugin is loaded at startup in exactly that case.
// Value: index of the first old-name argument; every argument from there on (up to `oldNameCount`) is an old name.
const CROSS_PLUGIN_MIGRATIONS = {
    migratePluginSettings: { from: 1, count: Infinity },
    migratePluginToSettings: { from: 2, count: 1 },
    migrateSettingToPlugin: { from: 1, count: 1 }
};
const MIGRATION_RE = new RegExp(`\\b(${Object.keys(CROSS_PLUGIN_MIGRATIONS).join("|")})\\b`);
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

/** @param {string} dir */
async function listSourceFiles(dir) {
    /** @type {string[]} */
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await listSourceFiles(p));
        else if (/\.(tsx?|jsx?|mts)$/.test(entry.name)) out.push(p);
    }
    return out;
}

/** @param {string} file absolute or cwd-relative path */
function pluginFolderOf(file) {
    const rel = relative(process.cwd(), resolve(file)).replaceAll("\\", "/");
    return /^src\/plugins\/([^/]+)/.exec(rel)?.[1] ?? null;
}

/**
 * Cross-folder imports of plugin code. `importedByCore` folders are used by core code (or core plugins), which may
 * read their settings at any time, so they stay eager. `imports` lists, per plugin folder, the other plugin folders
 * it imports from: those get loaded together with it, so their settings are bound before it can use them.
 */
async function findCrossImports() {
    /** @type {Set<string>} */
    const importedByCore = new Set();
    /** @type {Map<string, Set<string>>} */
    const imports = new Map();
    for (const file of await listSourceFiles("src")) {
        const importer = pluginFolderOf(file);
        const source = await readFile(file, "utf-8");
        for (const [, spec] of source.matchAll(IMPORT_RE)) {
            let target = null;
            const alias = PLUGIN_ALIASES.find(a => spec.startsWith(a));
            if (alias) {
                const folder = spec.slice(alias.length).split("/")[0];
                target = ALIAS_FOLDER_REMAP[folder] ?? folder;
            } else if (spec.startsWith(".")) {
                target = pluginFolderOf(join(dirname(file), spec));
            }
            if (!target || target === importer) continue;

            if (!importer || importer.startsWith("_")) importedByCore.add(target);
            else {
                if (!imports.has(importer)) imports.set(importer, new Set());
                imports.get(importer)?.add(target);
            }
        }
    }
    return { importedByCore, imports };
}

/** @type {typeof import("typescript")} Loaded on first use. */
let ts = /** @type {any} */ (undefined);

/**
 * Reads the literal `required` / `enabledByDefault` flags from the top level of the definePlugin({...}) call.
 * Returns null when they cannot be determined statically.
 * @param {string} source
 * @param {string} fileName
 * @returns {Promise<{ required: boolean, enabledByDefault: boolean } | null>}
 */
async function readStaticFlags(source, fileName) {
    ts ??= (await import("typescript")).default;
    const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

    /** @type {import("typescript").ObjectLiteralExpression | null} */
    let def = null;
    let count = 0;
    /** @param {import("typescript").Node} node */
    const visit = node => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "definePlugin") {
            count++;
            let arg = node.arguments[0];
            while (arg && (ts.isAsExpression(arg) || ts.isSatisfiesExpression(arg) || ts.isParenthesizedExpression(arg))) arg = arg.expression;
            if (arg && ts.isObjectLiteralExpression(arg)) def = arg;
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    if (count !== 1 || !def) return null;

    const flags = { required: false, enabledByDefault: false };
    for (const prop of /** @type {import("typescript").ObjectLiteralExpression} */ (def).properties) {
        if (ts.isSpreadAssignment(prop)) return null;
        const name = prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : null;
        if (name !== "required" && name !== "enabledByDefault") continue;
        if (!ts.isPropertyAssignment(prop)) return null;
        const kind = prop.initializer.kind;
        if (kind === ts.SyntaxKind.TrueKeyword) flags[name] = true;
        else if (kind !== ts.SyntaxKind.FalseKeyword) return null;
    }
    return flags;
}

/**
 * @param {string} entryPath path to the plugin entry (folder or single file), relative to cwd
 * @returns {Promise<{ source: string, file: string } | null>}
 */
async function readEntry(entryPath) {
    const s = await stat(entryPath);
    const candidates = s.isDirectory() ? [join(entryPath, "index.ts"), join(entryPath, "index.tsx")] : [entryPath];
    for (const file of candidates) {
        try { return { source: await readFile(file, "utf-8"), file }; } catch { }
    }
    return null;
}

/**
 * Old plugin names this plugin migrates settings from, or null if a migration call can't be read statically.
 * @param {string} dir
 * @returns {Promise<string[] | null>}
 */
async function collectMigrationSources(dir) {
    const s = await stat(dir);
    const files = s.isDirectory() ? await listSourceFiles(dir) : [dir];
    /** @type {string[]} */
    const oldNames = [];
    for (const file of files) {
        const source = await readFile(file, "utf-8");
        if (!MIGRATION_RE.test(source)) continue;

        ts ??= (await import("typescript")).default;
        const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        let unreadable = false;
        /** @param {import("typescript").Node} node */
        const visit = node => {
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && Object.hasOwn(CROSS_PLUGIN_MIGRATIONS, node.expression.text)) {
                const { from, count } = CROSS_PLUGIN_MIGRATIONS[node.expression.text];
                const args = node.arguments.slice(from, from + count);
                if (!args.length || args.some(a => !ts.isStringLiteralLike(a))) unreadable = true;
                else for (const a of args) oldNames.push(/** @type {import("typescript").StringLiteralLike} */ (a).text);
            }
            ts.forEachChild(node, visit);
        };
        visit(sf);
        if (unreadable) return null;
    }
    return oldNames;
}

export function createLazyPluginAnalyzer() {
    /** @type {ReturnType<typeof findCrossImports> | undefined} */
    let crossImports;

    /**
     * @param {string} dir e.g. "plugins", "plugins/_api", "userplugins"
     * @param {string} fileName entry name inside dir
     * @returns {Promise<{ loadsWith: string[] } & ({ lazy: false } | { lazy: true, required: boolean, enabledByDefault: boolean, migratesFrom: string[] })>}
     */
    return async function analyze(dir, fileName) {
        if (dir !== "plugins" || process.env.ENDCORD_NO_LAZY_PLUGINS) return { lazy: false, loadsWith: [] };

        crossImports ??= findCrossImports();
        const { importedByCore, imports } = await crossImports;
        const loadsWith = [...imports.get(fileName) ?? []];
        if (importedByCore.has(fileName)) return { lazy: false, loadsWith };

        const entryPath = join("src", dir, fileName);
        const migratesFrom = await collectMigrationSources(entryPath);
        if (!migratesFrom) return { lazy: false, loadsWith };

        const entry = await readEntry(entryPath);
        if (!entry) return { lazy: false, loadsWith };

        const flags = await readStaticFlags(entry.source, entry.file);
        if (!flags) return { lazy: false, loadsWith };

        return { lazy: true, ...flags, migratesFrom, loadsWith };
    };
}
