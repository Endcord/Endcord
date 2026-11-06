/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RENDERER_FILE, STARTUP_HEADER, startupFileOf, startupKey } from "@shared/pluginChunks";
import { close, open, read, stat } from "fs";
import { join } from "path";

/**
 * Windows Defender scans a script file the first time it's opened after it changes or its signatures update, and the
 * window's preload would wait for that before Discord's page can load. Opening the file the preload will read now, in
 * the background of the main process, lets the scan run while the app is still starting up. That's the startup file
 * when it was made from this renderer file, and the renderer file itself otherwise (see src/pluginChunkLoader.ts)
 */
export function preOpenRenderer() {
    const preOpen = (path: string) => open(path, "r", (err, fd) => {
        if (!err) close(fd, () => { });
    });
    const renderer = join(__dirname, RENDERER_FILE);
    open(startupFileOf(renderer), "r", (err, fd) => {
        if (err) return preOpen(renderer);
        const head = Buffer.alloc(160);
        read(fd, head, 0, head.length, 0, (readErr, bytes) => {
            close(fd, () => { });
            stat(renderer, (statErr, stats) => {
                const key = STARTUP_HEADER.exec(head.toString("latin1", 0, readErr ? 0 : bytes))?.[5];
                if (statErr || key !== startupKey(stats)) return preOpen(renderer);
                // The start doesn't need the renderer file, but the plugin list or a plugin turned on later reads it.
                // Have it scanned once the app is up, so that first read doesn't wait for the scan
                setTimeout(() => preOpen(renderer), 45_000).unref();
            });
        });
    });
}
