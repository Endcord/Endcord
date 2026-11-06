/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Endcord's stand-in for Webpack's defineExports (src/webpack/defineExports.ts), fed what Discord's modules pass it.
// Discord's Canary once started passing plain values after the getters, which this used to drop: Discord then
// stopped at its splash screen for everyone with Endcord
import esbuild from "esbuild";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");

let failed = 0;
function check(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
    if (!ok) failed++;
}

const { outputFiles } = await esbuild.build({
    entryPoints: [join(ROOT, "src", "webpack", "defineExports.ts")],
    bundle: true, platform: "neutral", format: "esm", write: false, logLevel: "error"
});
const { defineExports: d } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

// The old way: getters only
let value = 1;
const old = {};
d(old, { A: () => value });
value = 2;
check("a getter export follows the module's variable", old.A === 2);

// Discord's Logger module, as Canary builds it: n.d(t, {}, { A: l })
class Logger { }
const logger = {};
d(logger, {}, { A: Logger });
check("a plain value export is there", logger.A === Logger, Object.keys(logger));
check("and can be constructed", (() => { try { return new logger.A() instanceof Logger; } catch { return false; } })());

// Both at once
const both = {};
d(both, { get: () => "g" }, { val: "v" });
check("getters and values together", both.get === "g" && both.val === "v");

// What Endcord needs of every export: findable, and able to be hidden from searches later
const desc = Object.getOwnPropertyDescriptor(both, "val");
check("exports are enumerable and configurable", desc.enumerable && desc.configurable && Object.getOwnPropertyDescriptor(both, "get").configurable);
Object.defineProperty(both, "val", { enumerable: false });
check("an export can be hidden from searches", !Object.keys(both).includes("val") && both.val === "v");

// Webpack never overwrites an export that's already there
const existing = { A: "first" };
d(existing, { A: () => "getter" }, { A: "value" });
check("an existing export is left alone", existing.A === "first");

// Inherited keys aren't exports
const proto = Object.create({ inherited: () => "x" });
const fromProto = {};
d(fromProto, proto, Object.create({ inheritedValue: 1 }));
check("inherited keys are ignored", !("inherited" in fromProto) && !("inheritedValue" in fromProto));

if (failed) {
    console.error(`\n${failed} FAILED`);
    process.exit(1);
}
console.log("\nALL PASSED");
