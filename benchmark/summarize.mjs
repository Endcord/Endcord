/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Turns the raw runs in benchmark/results into summary.json, a Markdown table and SVG charts.
// Usage: node benchmark/summarize.mjs [resultsDir]

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const DIR = process.argv[2] ?? join(HERE, "results");
const ORDER = ["endcord", "vencord", "equicord", "vanilla"];
const NAMES = { endcord: "Endcord", vencord: "Vencord", equicord: "Equicord", vanilla: "Vanilla Discord" };
const COLORS = { endcord: "#3d74e0", vencord: "#8d9bb5", equicord: "#b3bfd4", vanilla: "#5a6985" };

const runs = {};
for (const f of readdirSync(DIR).filter(f => /^[a-z]+_\d+\.json$/.test(f))) {
    const r = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    (runs[r.mod] ??= []).push(r);
}
const mods = ORDER.filter(m => runs[m]?.length);

const median = xs => {
    const s = xs.filter(x => typeof x === "number" && !Number.isNaN(x)).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const METRICS = [
    { key: "ramMB", label: "Total RAM", unit: "MB", lower: true, chart: true },
    { key: "rendererRamMB", label: "Renderer RAM", unit: "MB", lower: true },
    { key: "jsHeapMB", label: "JS heap (after GC)", unit: "MB", lower: true, chart: true },
    { key: "idleCpuPct", label: "Idle CPU", unit: "%", lower: true, chart: true, digits: 2 },
    { key: "readyMs", label: "Launch to usable", unit: "ms", lower: true, chart: true },
    { key: "cpuFirst30sMs", label: "CPU time, first 30 s", unit: "ms", lower: true },
    { key: "domNodes", label: "DOM nodes", unit: "", lower: true },
    { key: "cssRules", label: "CSS rules", unit: "", lower: true },
];

const summary = {};
for (const mod of mods) {
    summary[mod] = { runs: runs[mod].length };
    for (const m of METRICS) {
        const xs = runs[mod].map(r => r[m.key]).filter(x => typeof x === "number");
        summary[mod][m.key] = { median: median(xs), min: Math.min(...xs), max: Math.max(...xs) };
    }
}
writeFileSync(join(DIR, "summary.json"), JSON.stringify(summary, null, 2));

const fmt = (v, digits = 0) => v == null ? "n/a" : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Markdown table: median with the observed range underneath
let md = `| Metric | ${mods.map(m => NAMES[m]).join(" | ")} |\n|---|${mods.map(() => "---:").join("|")}|\n`;
for (const m of METRICS) {
    const best = Math.min(...mods.filter(x => x !== "vanilla").map(x => summary[x][m.key].median ?? Infinity));
    md += `| ${m.label}${m.unit ? ` (${m.unit})` : ""} | ` + mods.map(mod => {
        const s = summary[mod][m.key];
        const v = fmt(s.median, m.digits);
        return mod !== "vanilla" && s.median === best ? `**${v}**` : v;
    }).join(" | ") + " |\n";
}
writeFileSync(join(DIR, "summary.md"), md);
console.log(md);

// One horizontal bar chart per headline metric
function chart(m) {
    const W = 640, rowH = 34, top = 44, left = 150, right = 90;
    const H = top + mods.length * rowH + 16;
    const values = mods.map(mod => summary[mod][m.key].median ?? 0);
    const max = Math.max(...values) * 1.08;
    const bar = v => (W - left - right) * v / max;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Helvetica, Arial, sans-serif">`;
    s += `<rect width="${W}" height="${H}" rx="12" fill="#10182a"/>`;
    s += `<text x="20" y="28" font-size="15" font-weight="600" fill="#f3f6fb">${m.label}</text>`;
    s += `<text x="${W - 20}" y="28" font-size="12" fill="#8d9bb5" text-anchor="end">${m.unit ? m.unit + ", " : ""}median of ${summary[mods[0]].runs} runs, lower is better</text>`;
    mods.forEach((mod, i) => {
        const y = top + i * rowH;
        const v = values[i];
        s += `<text x="${left - 12}" y="${y + 17}" font-size="13" fill="${mod === "endcord" ? "#f3f6fb" : "#b3bfd4"}" text-anchor="end"${mod === "endcord" ? ' font-weight="600"' : ""}>${NAMES[mod]}</text>`;
        s += `<rect x="${left}" y="${y + 4}" width="${Math.max(2, bar(v))}" height="18" rx="4" fill="${COLORS[mod]}"/>`;
        s += `<text x="${left + bar(v) + 8}" y="${y + 17}" font-size="13" fill="#f3f6fb">${fmt(v, m.digits)}</text>`;
    });
    return s + "</svg>";
}
for (const m of METRICS.filter(m => m.chart)) writeFileSync(join(HERE, "charts", `${m.key}.svg`), chart(m));
