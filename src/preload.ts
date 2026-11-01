/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { debounce } from "@shared/debounce";
import { IpcEvents } from "@shared/IpcEvents";
import { isDiscordOrigin } from "@shared/trustedOrigins";
import { contextBridge, webFrame } from "electron/renderer";
import { readFileSync } from "fs";
import { join } from "path";

import EndcordNative, { invoke, sendSync } from "./EndcordNative";

// Monaco popout: its code comes from a CDN, so it only gets the three calls it needs
if (location.protocol === "data:") {
    contextBridge.exposeInMainWorld("setCss", debounce(EndcordNative.quickCss.set));
    contextBridge.exposeInMainWorld("getCurrentCss", EndcordNative.quickCss.get);
    contextBridge.exposeInMainWorld("getTheme", EndcordNative.quickCss.getEditorTheme);
} else {
    if (!IS_DISCORD_DESKTOP || isDiscordOrigin(window.origin)) {
        contextBridge.exposeInMainWorld("EndcordNative", EndcordNative);
        invoke(IpcEvents.INIT_FILE_WATCHERS);

        if (IS_DISCORD_DESKTOP) {
            // renderer.js sits next to this preload. Reading it here skips a multi-megabyte synchronous IPC
            // round trip that blocks both the main process and this renderer during startup.
            let rendererJs: string;
            try {
                rendererJs = readFileSync(join(__dirname, "renderer.js"), "utf-8");
            } catch {
                rendererJs = sendSync<string>(IpcEvents.PRELOAD_GET_RENDERER_JS);
            }
            webFrame.executeJavaScript(rendererJs);
        }
    }

    // Not supported in sandboxed preload scripts but Discord doesn't support it either so who cares
    if (IS_DISCORD_DESKTOP) require(process.env.DISCORD_PRELOAD!);
}
