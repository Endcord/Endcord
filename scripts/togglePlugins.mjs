/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Turns every plugin off and on again in Discord's web app, the way the switch in the Plugins tab does, and lists
// each plugin whose stop or second start throws, fails or logs an error.
//
// The patch report can't see this: it runs on the login page, which never connects, so most plugins never start
// there at all. This starts them anyway, so expect a few errors from there being no signed-in user.
//
//   pnpm buildReporter
//   CHROMIUM_BIN=<path to Chrome or Edge> node scripts/togglePlugins.mjs [--canary] [out.json]
import { readFileSync, writeFileSync } from "fs";
import pup from "puppeteer-core";

const canary = process.argv.includes("--canary");
const out = process.argv.slice(2).find(a => !a.startsWith("--"));

const browser = await pup.launch({ headless: true, executablePath: process.env.CHROMIUM_BIN, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36");
await page.setBypassCSP(true);

let finished;
const testDone = new Promise(r => finished = r);
let phase = "load";
const logged = [];
const text = args => args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ").replace(/%c/g, "").slice(0, 600);

page.on("console", async e => {
    try {
        const args = await Promise.all(e.args().map(a => a.jsonValue().catch(() => null)));
        if (args[0] === "[Endcord]" && args[1] === "Reporter:" && args[2] === "Finished test") finished();
        if (phase !== "load" && e.type() === "error") logged.push({ phase, text: text(args) });
    } catch { }
});
page.on("pageerror", e => { if (phase !== "load") logged.push({ phase, text: String(e?.stack ?? e).slice(0, 600) }); });

await page.evaluateOnNewDocument(`if (location.host.endsWith("discord.com")) { ${readFileSync("./dist/browser.js", "utf-8")}; }`);
await page.goto(canary ? "https://canary.discord.com/login" : "https://discord.com/login");
await Promise.race([testDone, new Promise(r => setTimeout(r, 300_000))]);

// Plugins normally start once Discord has connected, which the login page never does
phase = "start";
await page.evaluate(() => Endcord.Webpack._resolveReady());
await new Promise(r => setTimeout(r, 8000));
const startErrors = logged.filter(l => l.phase === "start").map(l => l.text);

const names = await page.evaluate(() => {
    const { plugins } = Endcord.Plugins;
    return Object.keys(plugins).filter(n => {
        const p = plugins[n];
        return p.started && !p.required && !p.isDependency && !n.endsWith("API");
    });
});

const problems = [];
for (const [step, fn] of [["off", "stopPlugin"], ["on again", "startPlugin"]]) {
    phase = step;
    for (const name of names) {
        const before = logged.length;
        const result = await page.evaluate((name, fn) => {
            const PM = Endcord.Plugins;
            try { return { ok: PM[fn](PM.plugins[name]) !== false }; } catch (e) { return { ok: false, threw: String(e?.stack ?? e).slice(0, 600) }; }
        }, name, fn);
        await new Promise(r => setTimeout(r, 30));
        // Discord logs errors of its own at random moments, often with nothing in them
        const errors = logged.slice(before).map(l => l.text).filter(t => t.trim());
        if (!result.ok || errors.length) problems.push({ plugin: name, step, ...result, errors });
    }
    await new Promise(r => setTimeout(r, 1500));
}

await browser.close();

for (const p of problems) {
    console.log(`${p.plugin} (${p.step})${p.ok ? "" : ": failed"}`);
    for (const e of [p.threw, ...p.errors].filter(Boolean)) console.log(`    ${e.split("\n").slice(0, 3).join("\n    ")}`);
}
console.log(`\n${names.length} plugins turned off and on, ${problems.length} with problems, ${startErrors.length} errors while starting signed out`);
if (out) writeFileSync(out, JSON.stringify({ toggled: names.length, startErrors, problems }, null, 1));
process.exit(problems.some(p => !p.ok) ? 1 : 0);
