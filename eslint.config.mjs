/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import stylistic from "@stylistic/eslint-plugin";
import pathAlias from "eslint-plugin-path-alias";
import react from "eslint-plugin-react";
import header from "eslint-plugin-simple-header";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

import endcord from "./scripts/eslint/endcordRules.mjs";

export default tseslint.config(
    { ignores: ["dist", "packages/endcord-types"] },
    {
        files: ["src/**/*.{tsx,ts,mts,mjs,js,jsx}", "test/**/*.mjs", "scripts/**/*.{ts,mjs}", "browser/*.ts", "desktop/src/*.ts", "eslint.config.mjs"],
        settings: {
            react: {
                version: "18"
            }
        },
        ...react.configs.flat.recommended,
        rules: {
            ...react.configs.flat.recommended.rules,
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",
            "react/display-name": "off",
            "react/no-unescaped-entities": "off",
        }
    },
    {
        files: ["src/**/*.{tsx,ts,mts,mjs,js,jsx}", "test/**/*.mjs", "scripts/**/*.{ts,mjs}", "browser/*.ts", "desktop/src/*.ts", "eslint.config.mjs"],
        plugins: {
            "endcord": endcord,
            "simple-header": header,
            "@stylistic": stylistic,
            "@typescript-eslint": tseslint.plugin,
            "simple-import-sort": simpleImportSort,
            "unused-imports": unusedImports,
            "path-alias": pathAlias
        },
        settings: {
            "import/resolver": {
                map: [
                    ["@webpack", "./src/webpack"],
                    ["@webpack/common", "./src/webpack/common"],
                    ["@utils", "./src/utils"],
                    ["@api", "./src/api"],
                    ["@components", "./src/components"]
                ]
            }
        },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: ["./tsconfig.json"],
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            /*
             * Since it's only been a month and Endcord has already been stolen
             * by random skids who rebranded it to "AlphaCord" and erased all license
             * information
             */
            "simple-header/header": [
                "error",
                {
                    "files": ["scripts/header-new.txt", "scripts/header-old.txt"],
                    "templates": { "author": [".*", "Vendicated and contributors"] }
                }
            ],

            // Style Rules
            "@stylistic/jsx-quotes": ["error", "prefer-double"],
            "@stylistic/quotes": ["error", "double", { "avoidEscape": true }],
            "@stylistic/no-mixed-spaces-and-tabs": "error",
            "@stylistic/arrow-parens": ["error", "as-needed"],
            "@stylistic/eol-last": ["error", "always"],
            "@stylistic/no-multi-spaces": "error",
            "@stylistic/no-trailing-spaces": "error",
            "@stylistic/no-whitespace-before-property": "error",
            "@stylistic/semi": ["error", "always"],
            "@stylistic/semi-style": ["error", "last"],
            "@stylistic/space-in-parens": ["error", "never"],
            "@stylistic/block-spacing": ["error", "always"],
            "@stylistic/object-curly-spacing": ["error", "always"],
            "@stylistic/spaced-comment": ["error", "always", { "markers": ["!"] }],
            "@stylistic/template-curly-spacing": ["error", "never"],
            "@stylistic/no-extra-semi": "error",

            // TS Rules
            "@typescript-eslint/no-array-delete": "error",
            "@typescript-eslint/no-duplicate-type-constituents": "error",
            "@typescript-eslint/no-extra-non-null-assertion": "error",
            "@typescript-eslint/no-for-in-array": "error",
            "@typescript-eslint/no-misused-new": "error",
            "@stylistic/function-call-spacing": ["error", "never"],

            // ESLint Rules
            "yoda": "error",
            "eqeqeq": ["error", "always", { "null": "ignore" }],
            "prefer-destructuring": ["error", {
                "VariableDeclarator": { "array": false, "object": true },
                "AssignmentExpression": { "array": false, "object": false }
            }],
            "operator-assignment": ["error", "always"],
            "no-useless-computed-key": "error",
            "no-unneeded-ternary": ["error", { "defaultAssignment": false }],
            "no-invalid-regexp": "error",
            "no-constant-condition": ["error", { "checkLoops": false }],
            "no-duplicate-imports": "error",
            "@typescript-eslint/dot-notation": [
                "error",
                {
                    "allowPrivateClassPropertyAccess": true,
                    "allowProtectedClassPropertyAccess": true
                }
            ],
            "no-useless-escape": [
                "error",
                {
                    "allowRegexCharacters": ["i"]
                }
            ],
            "no-fallthrough": "error",
            "for-direction": "error",
            "no-async-promise-executor": "error",
            "no-cond-assign": "error",
            "no-dupe-else-if": "error",
            "no-duplicate-case": "error",
            "no-irregular-whitespace": "error",
            "no-loss-of-precision": "error",
            "no-misleading-character-class": "error",
            "no-prototype-builtins": "error",
            "no-regex-spaces": "error",
            "no-shadow-restricted-names": "error",
            "no-unexpected-multiline": "error",
            "no-unsafe-optional-chaining": "error",
            "no-useless-backreference": "error",
            "use-isnan": "error",
            "prefer-const": ["error", { destructuring: "all" }],
            "prefer-spread": "error",
            // These are old deprecated browser globals which may be used by mistake, e.g. `addEventListener(e => console.log(event))`
            "no-restricted-globals": ["error", "event", "name"],

            // Correctness Rules
            "array-callback-return": "error",
            "default-case-last": "error",
            "getter-return": "error",
            "no-constructor-return": "error",
            "no-empty": ["error", { "allowEmptyCatch": true }],
            "no-ex-assign": "error",
            "no-extra-boolean-cast": "error",
            "no-lonely-if": "error",
            "no-new-wrappers": "error",
            "no-self-assign": "error",
            "no-self-compare": "error",
            "no-setter-return": "error",
            "no-sparse-arrays": "error",
            "no-unmodified-loop-condition": "error",
            "no-unreachable": "error",
            "no-unreachable-loop": "error",
            "no-unsafe-finally": "error",
            "no-unused-expressions": ["error", { "allowShortCircuit": true, "allowTernary": true, "allowTaggedTemplates": true }],
            "no-useless-catch": "error",
            "no-useless-concat": "error",
            "no-useless-constructor": "error",
            "no-useless-rename": "error",
            "no-useless-return": "error",
            "no-else-return": "error",
            "object-shorthand": ["error", "always", { "avoidQuotes": true }],
            "prefer-template": "error",
            "valid-typeof": "error",

            // Mistakes only this codebase can make, see scripts/eslint/endcordRules.mjs
            "endcord/layer-boundaries": "error",
            "endcord/patch-replace-groups": "error",
            "endcord/sensitive-settings": "error",
            "endcord/webpack-common-at-load": "error",

            // Security Rules
            "no-eval": "error",
            "no-implied-eval": "error",
            "no-new-func": "error",
            "no-script-url": "error",
            "no-restricted-syntax": ["error",
                {
                    "selector": "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
                    "message": "Build the element with the DOM API. Text from a setting or the network becomes script here."
                },
                {
                    "selector": "CallExpression[callee.property.name='insertAdjacentHTML'], CallExpression[callee.object.name='document'][callee.property.name='write']",
                    "message": "Build the element with the DOM API. Text from a setting or the network becomes script here."
                },
                {
                    "selector": "JSXAttribute[name.name='dangerouslySetInnerHTML']",
                    "message": "Render React elements instead, or sanitize the HTML and say so in an eslint-disable comment."
                }
            ],

            // Devtools stays readable: console.debug is hidden by default, plugins that need more use Logger
            "no-console": ["error", { "allow": ["debug", "info", "warn", "error", "trace", "dir", "table", "group", "groupCollapsed", "groupEnd", "time", "timeEnd"] }],

            // Plugin Rules
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
            "unused-imports/no-unused-imports": "error",
            "path-alias/no-relative": "error"
        }
    },
    {
        // previewExample.tsx is sample text for the ShikiCodeblocks settings, Logger is what the rule points people to, and these scripts print to a terminal
        files: ["src/plugins/shikiCodeblocks.desktop/previewExample.tsx", "src/utils/Logger.ts", "test/**/*.mjs", "scripts/**/*.{ts,mjs}"],
        rules: { "no-console": "off" }
    },
    {
        // Not part of tsconfig: its stubs on globalThis would become types for all of src.
        // The suite's job is also to feed in script URLs
        files: ["test/**/*.mjs"],
        languageOptions: { parserOptions: { project: null } },
        rules: {
            "@typescript-eslint/dot-notation": "off",
            "@typescript-eslint/no-array-delete": "off",
            "@typescript-eslint/no-duplicate-type-constituents": "off",
            "@typescript-eslint/no-extra-non-null-assertion": "off",
            "@typescript-eslint/no-for-in-array": "off",
            "@typescript-eslint/no-misused-new": "off",
            "no-script-url": "off"
        }
    },
    {
        // Patching Discord's webpack modules means compiling their edited source again
        files: ["src/webpack/**/*.ts", "src/components/settings/tabs/patchHelper/**/*.tsx", "src/plugins/UnlimitedFavoriteGIFs/index.tsx", "src/plugins/devCompanion.dev/**/*.tsx"],
        rules: { "no-eval": "off", "no-new-func": "off" }
    },
    {
        // These run outside the renderer's sandbox and CSP, so what they call has to be picked with care
        files: ["src/main/**/*.ts", "src/plugins/**/native.ts", "src/plugins/**/native/*.ts"],
        // These two only exist in source builds, where git and pnpm are whatever the developer has on their PATH
        ignores: ["src/plugins/userpluginInstaller.dev/native.ts", "src/main/updater/git.ts"],
        rules: {
            "endcord/absolute-program": "error",
            "no-restricted-imports": ["error", {
                "paths": [{
                    "name": "child_process",
                    "importNames": ["exec", "execSync"],
                    "message": "Use execFile: its arguments never go through a shell."
                }]
            }],
            "no-restricted-syntax": ["error",
                {
                    "selector": "CallExpression[callee.object.name='shell'][callee.property.name='openExternal']",
                    "message": "Check the URL with isSafeExternalUrl first, then disable this rule on that line."
                },
                {
                    "selector": "CallExpression[callee.object.name='ipcMain'][callee.property.name='handle']",
                    "message": "Use handleIpc: it refuses pages that aren't Discord."
                }
            ]
        }
    }
);
