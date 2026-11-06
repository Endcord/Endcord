/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// A lint rule that quietly stops matching looks exactly like clean code, so each rule is shown a mistake here
import { createRequire } from "module";
import { join } from "path";

import endcord from "../scripts/eslint/endcordRules.mjs";

const ROOT = join(import.meta.dirname, "..");
const require = createRequire(join(ROOT, "package.json"));
const { Linter } = require("eslint");
const tseslint = require("typescript-eslint");

const linter = new Linter({ configType: "flat", cwd: ROOT });
function lint(rule, code, filename) {
    const messages = linter.verify(code, [{
        files: ["**/*.ts"],
        languageOptions: { parser: tseslint.parser, ecmaVersion: "latest", sourceType: "module" },
        plugins: { endcord },
        rules: { [`endcord/${rule}`]: "error" }
    }], { filename: join(ROOT, filename) });

    // Anything else means the sample never reached the rule, which would pass as clean
    const noise = messages.find(message => message.ruleId !== `endcord/${rule}`);
    if (noise) throw new Error(`${rule}: ${noise.message}`);

    return messages;
}

let failed = 0;
function check(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${JSON.stringify(detail)}`}`);
    if (!ok) failed++;
}
const flags = (rule, code, filename = "src/plugins/x/index.ts") => lint(rule, code, filename).length > 0;

// ---- patch-replace-groups ----------------------------------------------------------------------------------
const patch = (match, replace) => `const p = { match: ${match}, replace: ${JSON.stringify(replace)} };`;
check("a replace can use the groups its match has", !flags("patch-replace-groups", patch(String.raw`/(a)(b)/`, "$1$2")));
check("a replace can't use a group that doesn't exist", flags("patch-replace-groups", patch(String.raw`/(a)/`, "$1$2")));
check("a non-capturing group doesn't count", flags("patch-replace-groups", patch(String.raw`/(?:a)/`, "$1")));
check("\\i is understood", !flags("patch-replace-groups", patch(String.raw`/(\i)\.foo/`, "$1")));
check("intl keys are understood", !flags("patch-replace-groups", patch(String.raw`/#{intl::SOME_KEY}(a)/`, "$1")));
check("$self and $& aren't groups", !flags("patch-replace-groups", patch(String.raw`/a/`, "$self.x($&)")));
check("a literal $$ isn't a group", !flags("patch-replace-groups", patch(String.raw`/a/`, "$$1")));

// ---- sensitive-settings ------------------------------------------------------------------------------------
const setting = (name, extra = "") => `definePluginSettings({ ${name}: { type: OptionType.STRING, default: "" ${extra} } });`;
for (const name of ["apiKey", "authToken", "password", "clientSecret", "sessionCookie", "webhookUrl", "kagiSessionToken"])
    check(`${name} must be marked sensitive`, flags("sensitive-settings", setting(name)));
check("a marked setting passes", !flags("sensitive-settings", setting("apiKey", ", sensitive: true")));
check("an ordinary setting passes", !flags("sensitive-settings", setting("displayName")));
check("a switch can be named after a secret", !flags("sensitive-settings", "definePluginSettings({ hideToken: { type: OptionType.BOOLEAN, default: true } });"));

// ---- absolute-program --------------------------------------------------------------------------------------
check("a bare program name is refused", flags("absolute-program", 'execFile("powershell.exe", []);'));
check("spawn is covered too", flags("absolute-program", 'cp.spawn("cmd", []);'));
check("a full path passes", !flags("absolute-program", 'execFile("/usr/bin/osascript", []);'));
check("a computed path passes", !flags("absolute-program", "execFile(POWERSHELL, []);"));

// ---- layer-boundaries --------------------------------------------------------------------------------------
const importing = source => `import { x } from "${source}";`;
check("shared code can't reach the main process", flags("layer-boundaries", importing("@main/settings"), "src/shared/a.ts"));
check("the main process can't reach the page", flags("layer-boundaries", importing("@webpack/common"), "src/main/a.ts"));
check("core can't depend on a plugin", flags("layer-boundaries", importing("@plugins/fakeNitro"), "src/api/a.ts"));
check("core may use its own plugins", !flags("layer-boundaries", importing("@plugins/_api/badges"), "src/api/a.ts"));
check("the page can't import electron", flags("layer-boundaries", importing("electron"), "src/utils/a.ts"));
check("type imports don't exist at runtime", !flags("layer-boundaries", 'import type { x } from "@main/themes";', "src/api/a.ts"));
check("plugins aren't a layer", !flags("layer-boundaries", importing("@plugins/other"), "src/plugins/x/index.ts"));

// ---- webpack-common-at-load --------------------------------------------------------------------------------
const common = 'import { React, useState, Toasts } from "@webpack/common";\n';
const atLoad = code => flags("webpack-common-at-load", common + code, "src/components/a.ts");
check("React.memo while the file loads is refused", atLoad("export const Card = React.memo(() => null);"));
check("so is keeping a hook for later", atLoad("const use = useState;"));
check("inside a function it waits for Discord", !atLoad("export function Card() { return React.memo(() => null); }"));
check("an arrow function waits too", !atLoad("export const make = () => React.memo(() => null);"));
check("types aren't values", !atLoad("interface P extends React.HTMLProps<HTMLDivElement> { a: 1; }\nlet x: React.ComponentType | undefined;"));
check("values that are there from the start pass", !atLoad("const type = Toasts.Type;"));
check("\"as\" still runs", atLoad("const x = React as any;"));

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
