/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { debounce } from "@shared/debounce";
import { IpcEvents } from "@shared/IpcEvents";
import { contextBridge, webFrame } from "electron/renderer";
import { readFileSync } from "fs";
import { join } from "path";

import EndcordNative, { invoke, sendSync } from "./EndcordNative";

contextBridge.exposeInMainWorld("EndcordNative", EndcordNative);

// Discord
if (location.protocol !== "data:") {
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
        // Not supported in sandboxed preload scripts but Discord doesn't support it either so who cares
        require(process.env.DISCORD_PRELOAD!);
    }
} // Monaco popout
else {
    contextBridge.exposeInMainWorld("setCss", debounce(EndcordNative.quickCss.set));
    contextBridge.exposeInMainWorld("getCurrentCss", EndcordNative.quickCss.get);
    contextBridge.exposeInMainWorld("getTheme", EndcordNative.quickCss.getEditorTheme);
}
