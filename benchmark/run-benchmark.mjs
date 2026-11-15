/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Head-to-head benchmark of Discord client mods on ONE Discord Stable install (Windows).
//
// Every mod is loaded into the same Discord build by swapping resources\app\index.js, so the only
// thing that changes between runs is the mod itself. Mods run with their default settings (each
// mod's settings folder is moved aside for the run and restored afterwards). Variants are
// interleaved round by round so background noise hits all of them equally.
//
// Usage: node benchmark/run-benchmark.mjs [--rounds 5] [--duration 120] [--mods endcord,vencord,equicord,vanilla] [--out benchmark/results]
//
// Requirements: Discord Stable logged in, Node 22+ (global fetch/WebSocket), the mods installed in
// their usual %APPDATA% folders. Close Discord before starting. Do not use the PC while it runs.
//
// Endcord Desktop is measured the same way, on its own: --mods desktop --desktop <app folder> --profile <data folder>.
// The profile is an ENDCORD_DESKTOP_DATA_DIR you have signed in to once and started a few times, as in daily use. Only
// processes of that app folder are started, counted and stopped; Discord and the mods' settings are left alone.

import { execSync, spawn } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { cpus, totalmem } from "os";
import { dirname, join } from "path";

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith("--")) args[process.argv[i].slice(2)] = process.argv[++i];
const ROUNDS = Number(args.rounds ?? 5);
const DURATION_S = Number(args.duration ?? 120);
const MODS = (args.mods ?? "endcord,vencord,equicord,vanilla").split(",");
const OUT = args.out ?? join(dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "results");
const PORT = 9333;
const DESKTOP = args.desktop;
const PROFILE = args.profile;
const DISCORD_MODS = MODS.filter(m => m !== "desktop");

const APPDATA = process.env.APPDATA;
const DISCORD_ROOT = join(process.env.LOCALAPPDATA, "Discord");
const APP_DIR = DISCORD_MODS.length ? join(DISCORD_ROOT, readdirSync(DISCORD_ROOT).filter(d => d.startsWith("app-")).sort().pop()) : null;
const RES = APP_DIR && join(APP_DIR, "resources");
const LOADER = RES && join(RES, "app", "index.js");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ps = cmd => execSync(`powershell -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`, { encoding: "utf8", maxBuffer: 1 << 26, windowsHide: true }).trim();
const killDiscord = () => { try { ps("Get-Process Discord -ErrorAction SilentlyContinue | Stop-Process -Force"); } catch { } };
const killDesktop = () => { try { ps(`Get-Process EndcordDesktop -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${DESKTOP}\\*' } | Stop-Process -Force`); } catch { } };
const kill = mod => mod === "desktop" ? killDesktop() : killDiscord();

// Vencord and Equicord only pick _app.asar when they believe they were loaded from app.asar
// (Endcord finds it on its own, so it gets the exact loader its installer writes)
const asarHint = 'require.main.path = __dirname + ".asar"; ';
const MOD_INFO = {
    endcord: { name: "Endcord", settings: join(APPDATA, "Endcord", "settings"), bundle: join(APPDATA, "Endcord", "dist"), loader: () => `require(${JSON.stringify(join(APPDATA, "Endcord", "dist", "patcher.js"))});` },
    vencord: { name: "Vencord", settings: join(APPDATA, "Vencord", "settings"), bundle: join(APPDATA, "Vencord", "dist"), loader: () => `${asarHint}require(${JSON.stringify(join(APPDATA, "Vencord", "dist", "patcher.js"))});` },
    equicord: { name: "Equicord", settings: join(APPDATA, "Equicord", "settings"), bundle: join(APPDATA, "Equicord", "equicord.asar"), loader: () => `${asarHint}require(${JSON.stringify(join(APPDATA, "Equicord", "equicord.asar"))});` },
    vanilla: { name: "Vanilla Discord", loader: () => 'require(require("path").join(__dirname, "..", "_app.asar"));' },
    desktop: {
        name: "Endcord Desktop", bundle: DESKTOP && join(DESKTOP, "resources", "app"),
        files: { "renderer.js": "endcordDesktopRenderer.js", "renderer.css": "endcordDesktopRenderer.css", "patcher.js": "endcordDesktopMain.js", "preload.js": "endcordDesktopPreload.js" }
    }
};

// ---- bundle sizes (renderer.js is what the mod adds to Discord's page) ----
function readAsarFile(asarPath, file) {
    const buf = readFileSync(asarPath);
    const headerSize = buf.readUInt32LE(12);
    const header = JSON.parse(buf.subarray(16, 16 + headerSize).toString("utf8"));
    const entry = header.files[file];
    const base = 8 + buf.readUInt32LE(4);
    return buf.subarray(base + Number(entry.offset), base + Number(entry.offset) + entry.size);
}
function bundleInfo(mod) {
    const info = MOD_INFO[mod];
    if (!info.bundle || !existsSync(info.bundle)) return null;
    const read = f => info.bundle.endsWith(".asar") ? readAsarFile(info.bundle, f) : readFileSync(join(info.bundle, info.files?.[f] ?? f));
    const out = {};
    for (const f of ["renderer.js", "renderer.css", "patcher.js", "preload.js"]) {
        try { const b = read(f); out[f] = { bytes: b.length, sha256: createHash("sha256").update(b).digest("hex").slice(0, 16) }; } catch { }
    }
    return out;
}

// ---- system description ----
function systemInfo() {
    const q = c => { try { return ps(c); } catch { return null; } };
    const buildInfo = RES && JSON.parse(readFileSync(join(RES, "build_info.json"), "utf8"));
    return {
        date: new Date().toISOString(),
        os: q("(Get-CimInstance Win32_OperatingSystem | ForEach-Object { $_.Caption + ' ' + $_.Version })"),
        cpu: cpus()[0].model.trim(),
        cpuCores: q("(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum"),
        cpuThreads: cpus().length,
        ramGB: Math.round(totalmem() / 2 ** 30),
        gpu: q("(Get-CimInstance Win32_VideoController | Where-Object { $_.AdapterRAM -gt 0 -or $_.Name } | Select-Object -ExpandProperty Name) -join ' / '"),
        storage: q("(Get-PhysicalDisk | Select-Object -ExpandProperty MediaType) -join ' / '"),
        powerPlan: q("(powercfg /getactivescheme) -replace '^.*\\((.*)\\).*$','$1'"),
        discord: buildInfo && { channel: buildInfo.releaseChannel, version: buildInfo.version, appDir: APP_DIR.split(/[\\/]/).pop() },
        desktop: DESKTOP ? { electron: readFileSync(join(DESKTOP, "version"), "utf8").trim(), app: JSON.parse(readFileSync(join(DESKTOP, "resources", "app", "package.json"), "utf8")).version } : undefined,
        node: process.version
    };
}

// ---- one measured launch ----
function snap(mod) {
    const filter = mod === "desktop" ? `-Filter \"Name='EndcordDesktop.exe'\" | Where-Object { $_.ExecutablePath -like '${DESKTOP}\\*' }` : "-Filter \"Name='Discord.exe'\"";
    const j = ps(`Get-CimInstance Win32_Process ${filter} | ForEach-Object { [pscustomobject]@{ c=$_.CommandLine; cpu=($_.KernelModeTime+$_.UserModeTime)/10000; mem=$_.PrivatePageCount } } | ConvertTo-Json -Compress`);
    const by = {};
    for (const p of [].concat(JSON.parse(j || "[]"))) {
        const m = /--type=([\w-]+)/.exec(p.c || "");
        let t = m ? m[1] : "browser";
        if (t === "utility") t = /--utility-sub-type=([\w.]+)/.exec(p.c)?.[1]?.split(".").pop() ?? "utility";
        by[t] ??= { cpu: 0, mem: 0, n: 0 };
        by[t].cpu += p.cpu; by[t].mem += p.mem; by[t].n++;
    }
    return by;
}
const total = (s, k) => Object.values(s).reduce((a, b) => a + b[k], 0);

async function connect() {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(3000) })).json();
    const page = list.find(t => t.type === "page" && /discord\.com\/(channels|app)/.test(t.url));
    if (!page) throw new Error("no page");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0; const pending = {};
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) pending[m.id](m.result ?? m.error); };
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    // Times out, so a page that dies mid-run fails that run instead of hanging the benchmark
    const send = (method, params = {}) => new Promise((r, j) => {
        const timer = setTimeout(() => j(new Error(`${method} timed out`)), 20000);
        pending[++id] = result => { clearTimeout(timer); r(result); };
        ws.send(JSON.stringify({ id, method, params }));
    });
    const ev = async e => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
    return { ws, send, ev };
}

// A window started from a background process can open behind others, where Chromium stops drawing it. The window is
// kept on top without taking the focus, so keys typed elsewhere never reach Discord. Runs alongside, so the launch
// timing doesn't wait for it
function keepInView(mod) {
    const name = mod === "desktop" ? "EndcordDesktop" : "Discord";
    const where = mod === "desktop" ? `$_.Path -like '${DESKTOP}\\*' -and ` : "";
    const script = "Add-Type -Namespace B -Name W -MemberDefinition '"
        + "[DllImport(\"user32.dll\")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);'; "
        + `$h = (Get-Process ${name} -ErrorAction SilentlyContinue | Where-Object { ${where}$_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle; `
        // HWND_TOPMOST; SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE
        + "if ($h) { [B.W]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x13) | Out-Null }";
    spawn("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore", windowsHide: true });
}

async function measure(mod) {
    kill(mod);
    await sleep(4000);
    if (mod !== "desktop") writeFileSync(LOADER, MOD_INFO[mod].loader());
    const t0 = Date.now();
    if (mod === "desktop") spawn(join(DESKTOP, "EndcordDesktop.exe"), [`--remote-debugging-port=${PORT}`], { detached: true, stdio: "ignore", env: { ...process.env, ENDCORD_DESKTOP_DATA_DIR: PROFILE } }).unref();
    else spawn(join(APP_DIR, "Discord.exe"), [`--remote-debugging-port=${PORT}`], { detached: true, stdio: "ignore" }).unref();

    let c, readyMs = null;
    while (Date.now() - t0 < 90000) {
        try {
            if (!c) {
                c = await connect();
                keepInView(mod);
            }
            if (await c.ev("!!document.querySelector('nav[class*=guilds]') && !!document.querySelector('[class*=sidebar]')")) { readyMs = Date.now() - t0; break; }
        } catch { c = undefined; }
        await sleep(100);
    }
    if (readyMs == null) throw new Error(`${mod}: Discord did not become ready`);
    keepInView(mod);

    let pageStartMs = null, dcl = null;
    try {
        const n = await c.ev("(() => { const n = performance.getEntriesByType('navigation')[0]; return { origin: performance.timeOrigin, dcl: Math.round(n.domContentLoadedEventEnd) }; })()");
        pageStartMs = Math.round(n.origin - t0); dcl = n.dcl;
    } catch { }

    const marks = {};
    for (const at of [30, 60, 90, 120, 180, 240, 300].filter(s => s <= DURATION_S)) {
        await sleep(Math.max(0, t0 + at * 1000 - Date.now()));
        marks[at] = snap(mod);
    }
    const last = Math.max(...Object.keys(marks).map(Number));

    await c.send("HeapProfiler.collectGarbage");
    await sleep(1000);
    await c.send("Performance.enable");
    const m = Object.fromEntries((await c.send("Performance.getMetrics")).metrics.map(x => [x.name, x.value]));
    const page = await c.ev(`(() => ({
        // Equicord exposes itself as window.Vencord too; its own core plugin gives it away
        mod: window.Endcord ? "Endcord" : window.Vencord ? (Object.keys(Vencord.Plugins.plugins).some(n => n.includes("Equicord")) ? "Equicord" : "Vencord") : "none",
        styleEls: document.querySelectorAll("style").length,
        // Hidden means covered or minimized, where Chromium stops drawing and the run is not comparable
        visibility: document.visibilityState,
        focused: document.hasFocus(),
        viewport: innerWidth + "x" + innerHeight,
        discordBuild: window.GLOBAL_ENV?.BUILD_NUMBER ?? null,
        cssRules: [...document.styleSheets].reduce((a, s) => { try { return a + s.cssRules.length; } catch { return a; } }, 0)
    }))()`);

    // What was on screen when the numbers were taken, so a stray dialog cannot skew a run unnoticed
    try {
        const shot = await c.send("Page.captureScreenshot", { format: "jpeg", quality: 60 });
        mkdirSync(join(OUT, "screens"), { recursive: true });
        writeFileSync(join(OUT, "screens", `${mod}_${Date.now()}.jpg`), Buffer.from(shot.data, "base64"));
    } catch { }

    const proc = {};
    for (const t of Object.keys(marks[last])) proc[t] = { count: marks[last][t].n, memMB: Math.round(marks[last][t].mem / 2 ** 20) };

    const result = {
        mod, detected: page.mod, readyMs, pageStartMs, inPageReadyMs: pageStartMs == null ? null : readyMs - pageStartMs, domContentLoadedMs: dcl,
        cpuFirst30sMs: Math.round(total(marks[30], "cpu")),
        cpuFirst60sMs: Math.round(total(marks[60], "cpu")),
        idleCpuPct: +((total(marks[last], "cpu") - total(marks[60], "cpu")) / ((last - 60) * 1000) * 100).toFixed(2),
        ramMB: Math.round(total(marks[last], "mem") / 2 ** 20),
        rendererRamMB: proc.renderer?.memMB ?? null,
        jsHeapMB: +(m.JSHeapUsedSize / 2 ** 20).toFixed(1),
        domNodes: m.Nodes, eventListeners: m.JSEventListeners,
        cssRules: page.cssRules, styleElements: page.styleEls,
        visibility: page.visibility, focused: page.focused, viewport: page.viewport, discordBuild: page.discordBuild,
        processes: proc
    };
    c.ws.close();
    kill(mod);
    await sleep(2000);
    return result;
}

// ---- settings isolation: every mod starts from its defaults ----
const BAK = ".benchmark-backup";
function isolateSettings() {
    for (const info of Object.values(MOD_INFO)) {
        if (!info.settings) continue;
        const bak = info.settings + BAK;
        if (existsSync(bak)) continue; // left over from an interrupted run: keep the real backup
        if (existsSync(info.settings)) renameSync(info.settings, bak);
    }
}
function restoreSettings() {
    for (const info of Object.values(MOD_INFO)) {
        if (!info.settings) continue;
        const bak = info.settings + BAK;
        if (!existsSync(bak)) continue;
        rmSync(info.settings, { recursive: true, force: true });
        renameSync(bak, info.settings);
    }
}

// ---- main ----
for (const mod of MODS) if (!MOD_INFO[mod]) throw new Error(`Unknown mod ${mod}`);
if (MODS.includes("desktop") && !(DESKTOP && existsSync(join(DESKTOP, "EndcordDesktop.exe")) && PROFILE && existsSync(PROFILE)))
    throw new Error("desktop needs --desktop <folder with EndcordDesktop.exe> and --profile <signed-in data folder>");
mkdirSync(OUT, { recursive: true });
const originalLoader = DISCORD_MODS.length ? readFileSync(LOADER, "utf8") : null;
const system = systemInfo();
system.bundles = Object.fromEntries(MODS.map(m => [m, bundleInfo(m)]));
system.method = {
    rounds: ROUNDS, durationSec: DURATION_S, idleWindowSec: [60, DURATION_S],
    settings: DISCORD_MODS.length ? "defaults (fresh settings folder per mod)" : "defaults (a profile with nothing but the sign-in)"
};
writeFileSync(join(OUT, "system.json"), JSON.stringify(system, null, 2));
console.log(JSON.stringify(system, null, 2));

for (const mod of MODS) kill(mod);
if (DISCORD_MODS.length) isolateSettings();
try {
    for (let round = 1; round <= ROUNDS; round++) {
        // Rotate the start so no mod always runs first after a cold boot
        const order = MODS.map((_, i) => MODS[(i + round - 1) % MODS.length]);
        for (const mod of order) {
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    const r = await measure(mod);
                    r.round = round;
                    writeFileSync(join(OUT, `${mod}_${round}.json`), JSON.stringify(r, null, 2));
                    console.log(`round ${round} ${mod}: ready ${r.readyMs} ms, RAM ${r.ramMB} MB, heap ${r.jsHeapMB} MB, idle CPU ${r.idleCpuPct}%`);
                    break;
                } catch (e) {
                    console.log(`round ${round} ${mod}: attempt ${attempt} failed (${e.message})`);
                    kill(mod);
                    await sleep(3000);
                }
            }
        }
    }
} finally {
    for (const mod of MODS) kill(mod);
    await sleep(2000);
    if (DISCORD_MODS.length) {
        writeFileSync(LOADER, originalLoader);
        restoreSettings();
    }
}
console.log("done");
