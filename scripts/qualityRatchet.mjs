/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// A ratchet: these numbers may only go down. Nobody has to fix old debt to get a change in, but nothing can add to it.
// Run with --update after paying some off, so the gain can't be lost again.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join, relative, sep } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "quality-baseline.json");
const MAX_LINES = 1000;

// Generated tables and translations, not code anyone maintains by hand
const SKIPPED = /[\\/]i18n[\\/](?:locales|pluginDescriptions)[\\/]|\.json\.ts$/;

function sourceFiles(dir, found = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) sourceFiles(path, found);
        else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") && !SKIPPED.test(path)) found.push(path);
    }
    return found;
}

function measure() {
    const metrics = { asAny: 0, typeSuppressions: 0, lintSuppressions: 0, consoleLog: 0, todos: 0, filesOverLimit: 0, longestFile: 0 };

    for (const file of sourceFiles(join(ROOT, "src"))) {
        const text = readFileSync(file, "utf8");
        const count = pattern => text.match(pattern)?.length ?? 0;
        const lines = count(/\n/g) + 1;

        metrics.asAny += count(/\bas any\b/g);
        metrics.typeSuppressions += count(/@ts-(?:ignore|expect-error|nocheck)/g);
        metrics.lintSuppressions += count(/eslint-disable/g);
        metrics.consoleLog += count(/console\.log\(/g);
        metrics.todos += count(/\b(?:TODO|FIXME)\b/g);
        if (lines > MAX_LINES) metrics.filesOverLimit++;
        metrics.longestFile = Math.max(metrics.longestFile, lines);
    }

    // Only asked for right after a release build: dist can hold a dev or reporter build at any other time
    if (process.argv.includes("--bundle")) metrics.rendererKilobytes = Math.ceil(statSync(join(ROOT, "dist", "renderer.js")).size / 1024);

    return metrics;
}

const current = measure();

if (process.argv.includes("--update") || !existsSync(BASELINE)) {
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 4)}\n`);
    console.log(`Baseline written to ${relative(ROOT, BASELINE).split(sep).join("/")}`);
    process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
// The bundle may grow a little between releases, the rest may not grow at all
const allowance = { rendererKilobytes: 1.02 };

let failed = false;
for (const [name, limit] of Object.entries(baseline)) {
    if (current[name] == null) continue;

    const allowed = Math.ceil(limit * (allowance[name] ?? 1));
    const worse = current[name] > allowed;
    if (worse) failed = true;
    console.log(`${worse ? "WORSE" : "ok   "}  ${name}: ${current[name]} (limit ${allowed})`);
}

if (failed) {
    console.error("\nThese numbers may only go down. Fix what you added rather than updating the baseline.");
    process.exit(1);
}

const improved = Object.entries(baseline).filter(([name, limit]) => current[name] != null && current[name] < limit);
if (improved.length) console.log(`\nImproved: ${improved.map(([name]) => name).join(", ")}. Run with --update to lock that in.`);
