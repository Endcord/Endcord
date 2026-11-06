/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The logic behind Endcord's own screens that can run without Discord around it
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const require = createRequire(join(ROOT, "package.json"));
const esbuild = require("esbuild");

const OUT = mkdtempSync(join(tmpdir(), "endcord-ui-"));
await esbuild.build({
    stdin: {
        contents: `
            export { compareVersions, pickUnseenRelease } from "./src/utils/releaseNotes";
            export { DISCORD_DESIGN, fromShareCode, generateThemeCss, normalizeDesign, PRESETS, randomDesign, toShareCode, toThemeFile } from "./src/plugins/themeStudio/design";
            export { applyNewPluginDefaults } from "./src/api/pluginDefaults";
            export { createFrameLimiter } from "./src/utils/frameLimiter";
            export { createKeySequence } from "./src/utils/keySequence";
            export { isHostOf, isSafeMediaUrl, isSnowflake, isUrlOn } from "./src/shared/hosts";
            export { addSuspects, beginBoot, confirmBoot, readBootRecord } from "./src/shared/bootGuard";
            export { findLocaleTable, stripLocales } from "./src/shared/externalLocales";
        `,
        resolveDir: ROOT,
        loader: "ts"
    },
    bundle: true, platform: "node", format: "cjs", outfile: join(OUT, "bundle.cjs"), tsconfig: join(ROOT, "tsconfig.json"), logLevel: "error"
});
const m = require(join(OUT, "bundle.cjs"));

// The Russian table as the build packs it, next to the source as written
const { externalLocalesPlugin, packLocalesPlugin } = await import("../scripts/build/common.mjs");
const localeBundle = (name, plugins) => esbuild.build({
    stdin: { contents: "export { default } from \"./src/utils/i18n/locales/ru\";", resolveDir: ROOT, loader: "ts" },
    bundle: true, platform: "node", format: "cjs", outfile: join(OUT, name), tsconfig: join(ROOT, "tsconfig.json"), logLevel: "error", plugins
}).then(() => require(join(OUT, name)).default());
const [packedRu, plainRu] = await Promise.all([localeBundle("packed.cjs", [packLocalesPlugin]), localeBundle("plain.cjs", [])]);

// The same table as the desktop build leaves it: after the code, which the preload cuts off before running it
await esbuild.build({
    stdin: { contents: "export { default } from \"./src/utils/i18n/locales/ru\";", resolveDir: ROOT, loader: "ts" },
    bundle: true, platform: "node", format: "cjs", outfile: join(OUT, "external.cjs"), tsconfig: join(ROOT, "tsconfig.json"), logLevel: "error", plugins: [externalLocalesPlugin]
});
const externalRu = readFileSync(join(OUT, "external.cjs"), "utf-8");
rmSync(OUT, { recursive: true, force: true });

let failed = 0;
function check(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${JSON.stringify(detail)}`}`);
    if (!ok) failed++;
}

// ---- Which release gets announced --------------------------------------------------------------------------
check("versions compare as numbers", m.compareVersions("4.0.33", "4.0.9") > 0 && m.compareVersions("4.1.0", "4.0.33") > 0);
check("equal versions compare equal", m.compareVersions("4.1.0", "4.1") === 0);

const releases = [{ version: "4.3.0" }, { version: "4.1.0" }];
const pick = (...args) => m.pickUnseenRelease(releases, ...args)?.version;

check("a fresh install is told nothing", pick("4.3.0", undefined, false) === undefined);
check("the first update after the card shipped is announced", pick("4.1.0", undefined, true) === "4.1.0");
check("a release people already saw isn't announced again", pick("4.1.0", "4.1.0", false) === undefined);
check("a bug fix release isn't announced", pick("4.1.1", "4.1.0", true) === undefined);
check("a bug fix on top of an unseen release still announces it", pick("4.1.1", "4.0.33", true) === "4.1.0");
check("a skipped release shows the newest one", pick("4.3.0", "4.0.33", true) === "4.3.0");
check("a release newer than this client stays hidden", pick("4.2.0", "4.1.0", true) === undefined);

// ---- Plugins that became on by default -----------------------------------------------------------------------
const stored = { pluginDefaultsVersion: 0, plugins: { EndcordToolbox: { enabled: false }, ThemeLibrary: { enabled: false }, Other: { enabled: false } } };
m.applyNewPluginDefaults(stored);
check("a settings file that recorded them as off gets them turned on", stored.plugins.EndcordToolbox.enabled && stored.plugins.ThemeLibrary.enabled);
check("other plugins are left alone", !stored.plugins.Other.enabled);
stored.plugins.EndcordToolbox.enabled = false;
m.applyNewPluginDefaults(stored);
check("someone who turns one off afterwards keeps it off", !stored.plugins.EndcordToolbox.enabled);

// ---- Theme Studio -------------------------------------------------------------------------------------------
const scales = {
    neutrals: { "--neutral-1-hsl": 97, "--neutral-30-hsl": 60, "--neutral-69-hsl": 21, "--neutral-86-hsl": 11, "--neutral-100-hsl": 1 },
    blurples: { "--blurple-1-hsl": 98, "--blurple-30-hsl": 80, "--blurple-50-hsl": 65, "--blurple-90-hsl": 15 }
};
const css = design => m.generateThemeCss({ ...m.DISCORD_DESIGN, ...design }, scales);
const lightnessIn = (text, theme, variable) => Number(text.split(`${theme} {`)[1]?.split("}")[0].match(new RegExp(`${variable}: \\S+ \\S+ ([\\d.]+)%`))?.[1]);

check("Discord's look writes no CSS at all", css({}) === "");

const dark = css({ background: "#0d1424" });
const shade = theme => dark.split(`${theme} {`)[1]?.split("}")[0];
check("every dark theme gets its own scale", [".theme-dark", ".theme-darker", ".theme-midnight"].every(theme => shade(theme)));
check("the chosen color lands on the background of .theme-dark", Math.abs(lightnessIn(dark, ".theme-dark", "--neutral-69-hsl") - 9.6) < 0.2, dark.slice(0, 200));
check("the chosen color lands on the background of .theme-darker", Math.abs(lightnessIn(dark, ".theme-darker", "--neutral-86-hsl") - 9.6) < 0.2);
check("the chosen color lands on the background of .theme-midnight", Math.abs(lightnessIn(dark, ".theme-midnight", "--neutral-100-hsl") - 9.6) < 0.2);
check("light themes keep their own background", !dark.includes(".theme-light"));

const pale = css({ background: "#f0f0f0" });
check("a pale background can't bring text and background together", lightnessIn(pale, ".theme-dark", "--neutral-69-hsl") <= 30);
check("text stays nearly neutral on a saturated background", Number(css({ background: "#ff0000" }).split("--neutral-1-hsl: ")[1].split(" ")[1].replace("%", "")) <= 25);

const accent = css({ accent: "#ff3d9a" });
check("the accent recolors the scale Discord's buttons use", ["--blurple-1-hsl", "--blurple-50-hsl", "--blurple-90-hsl"].every(name => accent.includes(name)));
check("the chosen accent lands on the button step", accent.includes("--blurple-50-hsl: 331.2 100.0% 62.0%"), accent.slice(0, 300));
check("links follow the accent", accent.includes("--text-link:"));
check("a pale accent gets dark button text", css({ accent: "#74d49a" }).includes("--control-primary-text-default: #10182a"));
check("a dark accent keeps white button text", !css({ accent: "#3d3d9e" }).includes("--control-primary-text-default"));
check("Discord's own blurple would keep white text", !css({ accent: "#5865f2" }).includes("--control-primary-text-default"));
check("corners scale from Discord's own sizes", css({ radius: 0.5 }).includes("--radius-md: 6.0px"));
check("no blur is written unless asked for", !css({ accent: "#ff3d9a" }).includes("backdrop-filter"));
check("glass only touches menus", css({ glass: 8 }).includes("blur(8px)"));
check("every preset produces CSS or is Discord's own", m.PRESETS.every(({ name, design }) => name === "Discord" || m.generateThemeCss(design, scales).length > 0));
check("an exported theme carries its name", m.toThemeFile("a{}").includes("@name Endcord Studio Theme"));
check("a typeface reaches Discord's font variables", css({ font: "serif" }).includes("--font-primary: Georgia"));
check("flat takes the shadows off", css({ flat: true }).includes("--elevation-high: none"));
check("accent scrollbars follow the accent", css({ scrollbars: "accent" }).includes("--scrollbar-thin-thumb: var(--brand-500)"));
const ocean = m.PRESETS.find(preset => preset.name === "Ocean").design;
check("a share code brings back the same look", JSON.stringify(m.fromShareCode(m.toShareCode(ocean))) === JSON.stringify(m.normalizeDesign(ocean)));
check("anything else isn't a share code", m.fromShareCode("hello") === undefined && m.fromShareCode("ECS1:%%%") === undefined);
const sneaky = m.fromShareCode(`ECS1:${btoa(JSON.stringify({ accent: "red;}body{display:none", background: "#000000", radius: 99, glass: -5, font: "x}y", scrollbars: "evil" }))}`);
check("a share code can't carry CSS", sneaky.accent === "" && sneaky.radius === 2 && sneaky.glass === 0 && sneaky.font === "" && sneaky.scrollbars === "" && !css(sneaky).includes("display:none"));
check("an old saved look still works", m.normalizeDesign({ accent: "#ff3d9a", background: "", radius: 1, glass: 0 }).font === "");
const rolled = Array.from({ length: 50 }, () => m.randomDesign());
check("random looks are always valid and dark", rolled.every(design => /^#[0-9a-f]{6}$/.test(design.accent) && parseInt(design.background.slice(1, 3), 16) < 90));

// ---- Hosts ---------------------------------------------------------------------------------------------------
check("a domain matches itself and what's under it", m.isHostOf("tenor.com", "tenor.com") && m.isHostOf("media.tenor.com", "tenor.com"));
check("a lookalike domain doesn't match", !m.isHostOf("eviltenor.com", "tenor.com") && !m.isHostOf("tenor.com.evil.net", "tenor.com"));
check("a URL is judged by its host, not its text", m.isUrlOn("https://tmpfiles.org/123/a.png", "tmpfiles.org") && !m.isUrlOn("https://evil.com/tmpfiles.org/123", "tmpfiles.org"));
check("pictures and videos only", m.isSafeMediaUrl("https://a.com/b.png") && m.isSafeMediaUrl("data:image/png;base64,AA") && !m.isSafeMediaUrl("javascript:alert(1)") && !m.isSafeMediaUrl("data:text/html,<b>"));
check("only Discord ids pass as ids", m.isSnowflake("1390609041897554050") && !m.isSnowflake("__proto__") && !m.isSnowflake(5));

// ---- Packed translations -----------------------------------------------------------------------------------------
check("a packed translation table unpacks to exactly the source", Object.keys(plainRu).length > 1000 && JSON.stringify(packedRu) === JSON.stringify(plainRu));

const outsideRu = m.findLocaleTable(externalRu, "ru", "dict");
check("a table kept outside the script reads back as exactly the source", outsideRu != null && JSON.stringify(JSON.parse(outsideRu)) === JSON.stringify(plainRu));
const someRussian = Object.values(plainRu).find(text => /[а-я]{6}/.test(text));
check("the code that runs holds none of the translations", !m.stripLocales(externalRu).includes(someRussian) && externalRu.includes(someRussian));
check("the code that runs still ends in a newline", m.stripLocales(externalRu).endsWith("\n"));
check("only the tables the build wrote can be read", m.findLocaleTable(externalRu, "../x", "dict") === null && m.findLocaleTable(externalRu, "ru", "x") === null && m.findLocaleTable(externalRu, "tr", "dict") === null);
const sneakyTables = "code();\n/*endcord-locales\ntr.dict {\"a\":\"b *\\/ c\"}\n*/\n";
check("a translation can't end the comment it sits in", JSON.parse(m.findLocaleTable(sneakyTables, "tr", "dict")).a === "b */ c" && m.stripLocales(sneakyTables) === "code();\n");

// ---- Safe mode -----------------------------------------------------------------------------------------------
const startFrom = record => m.beginBoot(m.readBootRecord(record));
const failStarts = count => {
    let record = m.readBootRecord(null);
    for (let i = 0; i < count; i++) [record] = m.beginBoot(record);
    return record;
};

check("a first start is a normal one", !startFrom(null)[1].safeMode);
check("two failed starts aren't enough for safe mode", !m.beginBoot(failStarts(2))[1].safeMode);
check("the fourth start after three failed ones is safe", m.beginBoot(failStarts(3))[1].reason === "crashes");
check("a good start clears the count", !m.beginBoot(m.confirmBoot(failStarts(3), ["A"]))[1].safeMode);
check("a good start remembers what was on", m.confirmBoot(failStarts(1), ["A", "B"]).lastGood.join() === "A,B");
const safeDone = m.confirmBoot({ ...failStarts(4), lastGood: ["A"], suspects: ["B"] }, null);
check("a good safe start keeps what's known about the plugins", safeDone.pending === 0 && safeDone.lastGood.join() === "A" && safeDone.suspects.join() === "B");
const [afterAsk, asked] = startFrom({ safeNext: true });
check("asking for safe mode gets one safe start", asked.reason === "manual" && !afterAsk.safeNext);
check("suspects are kept once each, newest first", m.addSuspects({ suspects: ["A"] }, ["B", "A"]).suspects.join() === "B,A");
check("a damaged record reads as a clean one", startFrom({ pending: "x", lastGood: "A", suspects: [1, {}] })[1].failedStarts === 0 && m.readBootRecord({ suspects: [1, {}] }).suspects.length === 0);

// ---- Frame limiter --------------------------------------------------------------------------------------------
const makeHost = () => {
    let next = 1;
    const running = new Map();
    return {
        setTimeout: (callback, delay) => setTimeout(callback, delay),
        clearTimeout: id => clearTimeout(id),
        requestAnimationFrame(callback) {
            const id = next++;
            running.set(id, setTimeout(() => callback(performance.now()), 2));
            return id;
        },
        cancelAnimationFrame(id) {
            clearTimeout(running.get(id));
        }
    };
};
const countFrames = (host, milliseconds) => new Promise(resolve => {
    let frames = 0;
    let stopped = false;
    const tick = () => {
        frames++;
        if (!stopped) host.requestAnimationFrame(tick);
    };
    host.requestAnimationFrame(tick);
    setTimeout(() => {
        stopped = true;
        resolve(frames);
    }, milliseconds);
});

const host = makeHost();
const setFrameRate = m.createFrameLimiter(host);
const uncapped = await countFrames(host, 300);
setFrameRate(15);
const capped = await countFrames(host, 1000);
check("frames pass straight through with no limit", uncapped > capped * 0.3 + 5, uncapped);
check("the limit holds the frame rate to what was asked", capped >= 13 && capped <= 16, capped);

let ran = false;
const id = host.requestAnimationFrame(() => ran = true);
host.cancelAnimationFrame(id);
await new Promise(resolve => setTimeout(resolve, 150));
check("a cancelled frame doesn't run", !ran);

let released = false;
host.requestAnimationFrame(() => released = true);
setFrameRate(0);
await new Promise(resolve => setTimeout(resolve, 30));
check("lifting the limit runs what was held back right away", released);

setFrameRate(15);
let survivor = false;
host.requestAnimationFrame(() => { throw new Error("a failing animation"); });
host.requestAnimationFrame(() => survivor = true);
const realError = console.error;
console.error = () => { };
await new Promise(resolve => setTimeout(resolve, 150));
console.error = realError;
check("one failing animation doesn't stop the others", survivor);
setFrameRate(0);

// ---- Hidden key sequences -----------------------------------------------------------------------------------
const typed = keys => {
    let matches = 0;
    const press = m.createKeySequence([..."panda"], () => matches++);
    [...keys].forEach(press);
    return matches;
};

check("the word finds its match", typed("panda") === 1, typed("panda"));
check("keys before the word don't matter", typed("xxpanda") === 1 && typed("ppanda") === 1, typed("ppanda"));
check("a wrong key in the middle breaks it", typed("panxda") === 0, typed("panxda"));
check("it can match again", typed("pandapanda") === 2, typed("pandapanda"));

let arrowMatches = 0;
const pressArrow = m.createKeySequence(["ArrowUp", "ArrowUp", "ArrowDown"], () => arrowMatches++);
["ArrowUp", "ArrowUp", "ArrowUp", "ArrowDown"].forEach(pressArrow);
check("an extra key at the start of a repeating sequence still matches", arrowMatches === 1, arrowMatches);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
