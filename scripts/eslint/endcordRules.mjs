/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Rules for mistakes only this codebase can make. Each one exists because the mistake reached the code at least once.

const CANONICAL_IDENT = "[A-Za-z_$][\\w$]*";

/** Turns a patch regex into one the engine accepts, the way canonicalizeMatch does at runtime */
const toEngineRegex = (pattern, flags) => new RegExp(pattern.replaceAll("\\i", CANONICAL_IDENT).replace(/#\{intl::[^}]+\}/g, "x"), flags);

const propertyName = property => property.key?.name ?? property.key?.value;
const findProperty = (object, name) => object.properties.find(p => p.type === "Property" && propertyName(p) === name);

const patchReplaceGroups = {
    meta: {
        type: "problem",
        docs: { description: "A patch's replace can't use a capture group its match doesn't have" },
        messages: {
            missing: "replace uses ${{group}}, but match only has {{count}} capture group(s). It would be written out literally.",
            invalid: "This patch regex doesn't compile: {{error}}"
        }
    },
    create(context) {
        return {
            ObjectExpression(node) {
                const match = findProperty(node, "match")?.value;
                const replace = findProperty(node, "replace")?.value;
                if (!match?.regex || replace?.type !== "Literal" || typeof replace.value !== "string") return;

                let count;
                try {
                    // An empty alternative always matches, which reveals how many groups the regex has
                    count = new RegExp(`${toEngineRegex(match.regex.pattern, "").source}|`).exec("").length - 1;
                } catch (err) {
                    context.report({ node: match, messageId: "invalid", data: { error: err.message } });
                    return;
                }

                for (const [, group] of replace.value.matchAll(/(?<!\$)\$(\d{1,2})/g)) {
                    if (Number(group) > count) context.report({ node: replace, messageId: "missing", data: { group, count: String(count) } });
                }
            }
        };
    }
};

const SECRET_NAME = /token|secret|passw(?:or)?d|api_?key|auth(?:orization|Key)?$|session_?key|cookie|credential|webhook/i;

const sensitiveSettings = {
    meta: {
        type: "problem",
        docs: { description: "A setting that holds a secret must be left out of exports and cloud sync" },
        messages: { missing: "\"{{name}}\" looks like it holds a secret. Add sensitive: true so it stays out of exports and cloud sync." }
    },
    create(context) {
        return {
            'CallExpression[callee.name="definePluginSettings"]': function(node) {
                const settings = node.arguments[0];
                if (settings?.type !== "ObjectExpression") return;

                for (const property of settings.properties) {
                    if (property.type !== "Property" || property.value.type !== "ObjectExpression") continue;

                    const name = String(propertyName(property));
                    const type = findProperty(property.value, "type")?.value;
                    if (!SECRET_NAME.test(name) || type?.property?.name !== "STRING") continue;
                    if (findProperty(property.value, "sensitive")?.value?.value !== true) context.report({ node: property, messageId: "missing", data: { name } });
                }
            }
        };
    }
};

const RUNNERS = new Set(["execFile", "execFileSync", "spawn", "spawnSync"]);

const absoluteProgram = {
    meta: {
        type: "problem",
        docs: { description: "Programs must be run by full path" },
        messages: { bare: "\"{{program}}\" is looked up in the working folder first on Windows, so a planted copy would run. Use its full path." }
    },
    create(context) {
        return {
            CallExpression(node) {
                if (!RUNNERS.has(node.callee.name ?? node.callee.property?.name)) return;

                const program = node.arguments[0];
                if (program?.type === "Literal" && typeof program.value === "string" && !/[\\/]/.test(program.value))
                    context.report({ node: program, messageId: "bare", data: { program: program.value } });
            }
        };
    }
};

// Each layer lists what it must not reach. Type-only imports are fine: they don't exist at runtime
const LAYERS = [
    { files: /\/src\/shared\//, forbidden: /^(?:@main|@api|@components|@plugins|@webpack|electron)(?:\/|$)/, why: "shared code runs in both the main process and the browser" },
    { files: /\/src\/main\//, forbidden: /^(?:@api|@components|@plugins|@webpack)(?:\/|$)/, why: "the main process has no page to run these in" },
    { files: /\/src\/(?:api|components|webpack|utils)\//, forbidden: /^@plugins\/(?!_)/, why: "core code must keep working with any plugin disabled or removed" },
    { files: /\/src\/(?:api|components|webpack|utils)\//, forbidden: /^(?:@main|electron)(?:\/|$)/, why: "this code runs in the page, without Node" }
];

const layerBoundaries = {
    meta: {
        type: "problem",
        docs: { description: "Each layer of the client may only depend on the layers below it" },
        messages: { forbidden: "\"{{source}}\" can't be imported here: {{why}}." }
    },
    create(context) {
        const file = context.filename.replaceAll("\\", "/");
        const layers = LAYERS.filter(layer => layer.files.test(file));
        if (!layers.length) return {};

        return {
            ImportDeclaration(node) {
                if (node.importKind === "type" || (node.specifiers.length && node.specifiers.every(s => s.importKind === "type"))) return;

                const layer = layers.find(l => l.forbidden.test(node.source.value));
                if (layer) context.report({ node: node.source, messageId: "forbidden", data: { source: node.source.value, why: layer.why } });
            }
        };
    }
};

export default {
    rules: {
        "absolute-program": absoluteProgram,
        "layer-boundaries": layerBoundaries,
        "patch-replace-groups": patchReplaceGroups,
        "sensitive-settings": sensitiveSettings
    }
};
