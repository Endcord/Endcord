/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Unread mentions on the taskbar. Discord's web app puts their count in the page title ("(3) Discord | ..."), so the
// title is all this watches: no polling, nothing in the page

import { app, type BrowserWindow, type NativeImage, nativeImage, type Tray } from "electron";

import { strings } from "./strings";

export const mentionsInTitle = (title: string) => Number(/^\((\d+)\)/.exec(title)?.[1] ?? 0);

let dot: NativeImage | undefined;

/** A red dot for the corner of the taskbar button, drawn here rather than shipped as a file */
function redDot() {
    if (dot) return dot;
    const size = 32;
    const pixels = Buffer.alloc(size * size * 4);
    const center = (size - 1) / 2;
    const radius = size / 2 - 1;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // Smooth edge: how much of the pixel the circle covers
            const alpha = Math.min(1, Math.max(0, radius - Math.hypot(x - center, y - center) + 0.5));
            const at = (y * size + x) * 4;
            // BGRA with premultiplied alpha: #e5484d
            pixels[at] = Math.round(0x4d * alpha);
            pixels[at + 1] = Math.round(0x48 * alpha);
            pixels[at + 2] = Math.round(0xe5 * alpha);
            pixels[at + 3] = Math.round(255 * alpha);
        }
    }
    return dot = nativeImage.createFromBitmap(pixels, { width: size, height: size });
}

export function trackMentions(win: BrowserWindow, tray: Tray | null) {
    let mentions = 0;
    win.on("page-title-updated", (_event, title) => {
        const count = mentionsInTitle(title);
        if (count === mentions) return;
        // A new one while the window is away gets the taskbar button's attention, as in Discord's app
        if (count > mentions && !win.isFocused()) win.flashFrame(true);
        mentions = count;

        const label = count ? strings().mentions(count) : "";
        if (process.platform === "win32") win.setOverlayIcon(count ? redDot() : null, label);
        else app.setBadgeCount(count);
        tray?.setToolTip(count ? `Endcord · ${label}` : "Endcord");
    });
    win.on("focus", () => win.flashFrame(false));
}
