/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFile } from "child_process";
import { app, type BrowserWindow } from "electron";
import { existsSync } from "fs";
import { dirname, join } from "path";

// Most people leave Discord running in the tray all day. Once the window has been out of sight for a while,
// ask Chromium to behave as if the system were low on memory: it drops decoded images and Blink caches and
// runs a full V8 garbage collection in every process. Nothing visible changes; the memory is simply returned
// to the OS until the window is shown again.
// Endcord Desktop on Windows then hands what its processes still hold back to Windows as well, through the app's own
// small helper (desktop/trim/Trim.cs): Windows gives those pages to other programs that need memory and brings them back
// as the window is used again. Hidden in the tray, the app then shows a few tens of MB in Task Manager
const WORKING_SET_HELPER = IS_ENDCORD_DESKTOP && process.platform === "win32" ? join(dirname(process.execPath), "EndcordDesktopTrim.exe") : null;
const FIRST_TRIM_DELAY = 60_000;
const REPEAT_TRIM_INTERVAL = 10 * 60_000;
// The system takes a moment to reclaim pages after Chromium lets go of them
const SETTLE_TIME = 3_000;

export interface MemoryStats {
    usedMb: number;
    /** Measured before and after each trim, so it can stay at zero */
    freedMb: number;
    trims: number;
}

let freedKilobytes = 0;
let trims = 0;

const usedKilobytes = () => app.getAppMetrics().reduce((total, { memory }) => total + memory.workingSetSize, 0);
const toMegabytes = (kilobytes: number) => Math.round(kilobytes / 1024);

async function trim(win: BrowserWindow) {
    if (win.isDestroyed()) return;

    const { debugger: dbg } = win.webContents;
    const wasAttached = dbg.isAttached();
    try {
        if (!wasAttached) dbg.attach("1.3");
        await dbg.sendCommand("Memory.simulatePressureNotification", { level: "critical" });
        await dbg.sendCommand("HeapProfiler.collectGarbage");
    } catch {
        // DevTools or another client may own the debugger; trimming is best effort
    } finally {
        if (!wasAttached && dbg.isAttached()) {
            try { dbg.detach(); } catch { }
        }
    }
}

/** The app's processes, the ids Chromium reports, through the helper; skipped where there's no helper */
function emptyWorkingSets() {
    if (!WORKING_SET_HELPER || !existsSync(WORKING_SET_HELPER)) return Promise.resolve();
    const ids = app.getAppMetrics().map(({ pid }) => String(pid));
    return new Promise<void>(resolve => execFile(WORKING_SET_HELPER, ids, { windowsHide: true, timeout: 10_000 }, () => resolve()));
}

/**
 * Returns the megabytes this trim gave back. workingSets: also hand the pages to Windows, only for a window that's out of
 * sight, since a window in use would only take them straight back
 */
export async function trimAndMeasure(win: BrowserWindow, { workingSets = false } = {}) {
    const before = usedKilobytes();

    await trim(win);
    await new Promise(resolve => setTimeout(resolve, SETTLE_TIME));
    if (workingSets && !win.isDestroyed() && (!win.isVisible() || win.isMinimized())) await emptyWorkingSets();

    const freed = Math.max(0, before - usedKilobytes());
    freedKilobytes += freed;
    trims++;

    return toMegabytes(freed);
}

export function getMemoryStats(): MemoryStats {
    return { usedMb: toMegabytes(usedKilobytes()), freedMb: toMegabytes(freedKilobytes), trims };
}

export function initMemoryTrim(win: BrowserWindow) {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const isOutOfSight = () => !win.isDestroyed() && (!win.isVisible() || win.isMinimized());

    const schedule = (delay: number) => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            if (!isOutOfSight()) return;
            await trimAndMeasure(win, { workingSets: true });
            if (isOutOfSight()) schedule(REPEAT_TRIM_INTERVAL);
        }, delay);
    };

    const onHidden = () => schedule(FIRST_TRIM_DELAY);
    const onShown = () => clearTimeout(timer);

    win.on("hide", onHidden);
    win.on("minimize", onHidden);
    win.on("show", onShown);
    win.on("restore", onShown);
    win.on("closed", onShown);
}
