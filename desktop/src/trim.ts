/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Discord's page leaves a lot of garbage behind while it loads, and V8 takes its time collecting it: measured, the window
// held about 100 MB more a minute after the start than after one full collection. One collection once the page has
// settled hands that back right away. Hidden windows are trimmed further by Endcord (src/main/memoryTrim.ts)

import type { BrowserWindow } from "electron";

/** When after a load the page counts as settled */
export const SETTLE_DELAY = 45_000;

export async function collectGarbage(win: BrowserWindow) {
    const { webContents } = win;
    // DevTools, or Endcord's own trim, may be using the debugger: this is never worth getting in their way
    if (win.isDestroyed() || webContents.isDevToolsOpened() || webContents.debugger.isAttached()) return false;
    try {
        webContents.debugger.attach("1.3");
        await webContents.debugger.sendCommand("HeapProfiler.collectGarbage");
        // Caches that are cheap to fill again, such as fonts and parsed styles. Decoded images stay, since the window is
        // in view and would decode them again right away
        await webContents.debugger.sendCommand("Memory.simulatePressureNotification", { level: "moderate" });
        return true;
    } catch {
        return false;
    } finally {
        try {
            webContents.debugger.detach();
        } catch { }
    }
}

/** A collection after every load of Discord's page, once it has settled */
export function collectAfterLoads(win: BrowserWindow) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    win.webContents.on("did-finish-load", () => {
        clearTimeout(timer);
        timer = setTimeout(() => collectGarbage(win), SETTLE_DELAY);
    });
    win.on("closed", () => clearTimeout(timer));
}
