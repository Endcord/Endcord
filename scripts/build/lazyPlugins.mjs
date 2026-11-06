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

const PLUGIN_ALIASES = ["@plugins/"];
const ALIAS_FOLDER_REMAP = { equicordToolbox: "endcordToolbox" };
// Calls that move settings between plugin names at module load. They only matter when the user still has
// settings under the old name, so the plugin is loaded at startup in exactly that case.
// Value: index of the first old-name argument; every argument from there on (up to `oldNameCount`) is an old name.
const CROSS_PLUGIN_MIGRATIONS = {
    migratePluginSettings: { from: 1, count: Infinity },
    migratePluginToSettings: { from: 2, count: 1 },
    migrateSettingToPlugin: { from: 1, count: 1 },
    migrateRemovedPlugin: { from: 1, count: 1 }
};
const MIGRATION_RE = new RegExp(`\\b(${Object.keys(CROSS_PLUGIN_MIGRATIONS).join("|")})\\b`);
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
const TYPE_IMPORT_RE = /\b(?:import|export)\s+type\b[^;"']*?\bfrom\s*["'][^"']+["']|\btypeof\s+import\s*\(\s*["'][^"']+["']\s*\)/g;

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
        // Type-only imports are gone from the built code, so they don't tie one plugin's code to another's
        const source = (await readFile(file, "utf-8")).replace(TYPE_IMPORT_RE, "");
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
 * The plugin list's view of a lazy plugin, read from its source: d description, t tags, q search terms,
 * p dependencies, h hidden, s has settings, w the keys of its authors in Devs, k its sensitive settings ("*" when one
 * couldn't be named, and its code has to be asked), x something above couldn't be read (the list then loads the
 * plugin). Short keys: this ships in renderer.js for every lazy plugin
 * @typedef {{ d: string, t?: string[], q?: string[], p?: string[], h?: 1, s?: 1, w?: string[], k?: string[], x?: 1 }} PluginListInfo
 */
/** @type {Record<string, "d" | "t" | "q" | "p" | "h">} */
const LIST_FIELDS = { description: "d", tags: "t", searchTerms: "q", dependencies: "p", hidden: "h" };

/**
 * A literal's value: a string, a boolean, or an array of strings. undefined for anything else
 * @param {import("typescript").Expression} node
 * @returns {string | boolean | string[] | undefined}
 */
function staticValue(node) {
    while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isArrayLiteralExpression(node)) {
        const items = node.elements.map(e => ts.isStringLiteralLike(e) ? e.text : undefined);
        return items.every(i => i !== undefined) ? /** @type {string[]} */ (items) : undefined;
    }
    return undefined;
}

/**
 * Reads the literal `required` / `enabledByDefault` flags from the top level of the definePlugin({...}) call, and what
 * the plugin list needs. Returns null when the flags cannot be determined statically.
 * @param {string} source
 * @param {string} fileName
 * @returns {Promise<{ required: boolean, enabledByDefault: boolean, info: PluginListInfo } | null>}
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

    /** @type {{ required: boolean, enabledByDefault: boolean, info: PluginListInfo }} */
    const flags = { required: false, enabledByDefault: false, info: { d: "" } };
    let complete = true;
    for (const prop of /** @type {import("typescript").ObjectLiteralExpression} */ (def).properties) {
        if (ts.isSpreadAssignment(prop)) return null;
        const name = prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : null;
        if (!name) continue;

        // What the plugin list shows and searches, so it can list the plugin without running its code
        if (name === "settings" || name === "options") flags.info.s = 1;
        // Authors written as Devs.someone, for a contributor's list of plugins
        if (name === "authors" && ts.isPropertyAssignment(prop) && ts.isArrayLiteralExpression(prop.initializer)) {
            const keys = prop.initializer.elements.map(e => ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "Devs" && ts.isIdentifier(e.name) ? e.name.text : null);
            if (keys.length && keys.every(k => k != null)) flags.info.w = /** @type {string[]} */ (keys);
            continue;
        }
        const listField = LIST_FIELDS[name];
        if (listField) {
            const value = ts.isPropertyAssignment(prop) ? staticValue(prop.initializer) : undefined;
            if (value === undefined || (listField === "h" ? typeof value !== "boolean" : listField === "d" ? typeof value !== "string" : !Array.isArray(value))) complete = false;
            else if (value !== false && !(Array.isArray(value) && !value.length)) /** @type {Record<string, unknown>} */ (flags.info)[listField] = value === true ? 1 : value;
            continue;
        }

        if (name !== "required" && name !== "enabledByDefault") continue;
        if (!ts.isPropertyAssignment(prop)) return null;
        const { kind } = prop.initializer;
        if (kind === ts.SyntaxKind.TrueKeyword) flags[name] = true;
        else if (kind !== ts.SyntaxKind.FalseKeyword) return null;
    }
    if (!complete) flags.info.x = 1;
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
 * The settings of a plugin marked sensitive: true, which backups and cloud sync leave out. Read from its source so a
 * backup doesn't have to load every plugin's code to find them. "*" stands for one whose name can't be read
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectSensitiveKeys(dir) {
    const s = await stat(dir);
    const files = s.isDirectory() ? await listSourceFiles(dir) : [dir];
    /** @type {Set<string>} */
    const keys = new Set();
    for (const file of files) {
        const source = await readFile(file, "utf-8");
        if (!source.includes("sensitive")) continue;

        ts ??= (await import("typescript")).default;
        const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        /** @param {import("typescript").Node} node */
        const visit = node => {
            if (ts.isPropertyAssignment(node) && node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === "sensitive") {
                if (node.initializer.kind === ts.SyntaxKind.FalseKeyword) return;
                const setting = node.parent?.parent;
                const named = setting && ts.isPropertyAssignment(setting) && setting.name && (ts.isIdentifier(setting.name) || ts.isStringLiteral(setting.name));
                keys.add(named && node.initializer.kind === ts.SyntaxKind.TrueKeyword ? /** @type {any} */ (setting.name).text : "*");
            }
            ts.forEachChild(node, visit);
        };
        visit(sf);
    }
    return [...keys].sort();
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
        const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
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
     * @returns {Promise<{ loadsWith: string[] } & ({ lazy: false } | { lazy: true, required: boolean, enabledByDefault: boolean, info: PluginListInfo, migratesFrom: string[] })>}
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
        const sensitive = await collectSensitiveKeys(entryPath);
        if (sensitive.length) flags.info.k = sensitive;

        return { lazy: true, ...flags, migratesFrom, loadsWith };
    };
}
