/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, type BrowserWindow } from "electron";

// Most people leave Discord running in the tray all day. Once the window has been out of sight for a while,
// ask Chromium to behave as if the system were low on memory: it drops decoded images and Blink caches and
// runs a full V8 garbage collection in every process. Nothing visible changes; the memory is simply returned
// to the OS until the window is shown again.
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

/** Returns the megabytes this trim gave back */
export async function trimAndMeasure(win: BrowserWindow) {
    const before = usedKilobytes();

    await trim(win);
    await new Promise(resolve => setTimeout(resolve, SETTLE_TIME));

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
            await trimAndMeasure(win);
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
