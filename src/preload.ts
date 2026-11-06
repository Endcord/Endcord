/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Settings } from "@api/Settings";
import { debounce } from "@shared/debounce";
import { IpcEvents } from "@shared/IpcEvents";
import { RENDERER_FILE } from "@shared/pluginChunks";
import { isDiscordOrigin } from "@shared/trustedOrigins";
import { contextBridge, webFrame } from "electron/renderer";
import { join } from "path";

import EndcordNative, { invoke, primeSettings, sendSync } from "./EndcordNative";
import { loadRenderer, splitRenderer } from "./pluginChunkLoader";

// Monaco popout: its code comes from a CDN, so it only gets the three calls it needs
if (location.protocol === "data:") {
    contextBridge.exposeInMainWorld("setCss", debounce(EndcordNative.quickCss.set));
    contextBridge.exposeInMainWorld("getCurrentCss", EndcordNative.quickCss.get);
    contextBridge.exposeInMainWorld("getTheme", EndcordNative.quickCss.getEditorTheme);
} else {
    // Endcord Desktop's window can only stay on Discord (see desktop/src/main.ts), but its blank popouts, which
    // Discord's page fills itself, start this preload too and must not get a second Endcord
    if (isDiscordOrigin(window.origin) && (IS_DISCORD_DESKTOP || location.protocol === "https:")) {
        contextBridge.exposeInMainWorld("EndcordNative", EndcordNative);
        invoke(IpcEvents.INIT_FILE_WATCHERS);

        // The renderer file sits next to this preload. Reading it here skips a multi-megabyte synchronous IPC
        // round trip that blocks both the main process and this renderer during startup.
        // Only the script is read and run, with the code of the plugins that are on before it. The translation
        // tables and the other plugins' code after it never run (see @shared/externalLocales, @shared/pluginChunks)
        let settings: Settings | null = null;
        try {
            settings = primeSettings();
        } catch { }

        const rendererPath = join(__dirname, RENDERER_FILE);
        let rendererJs: string;
        try {
            rendererJs = loadRenderer(rendererPath, settings);
        } catch {
            rendererJs = splitRenderer(Buffer.from(sendSync<string>(IpcEvents.PRELOAD_GET_RENDERER_JS), "utf-8"), rendererPath, settings);
        }
        webFrame.executeJavaScript(rendererJs);
    }

    // Not supported in sandboxed preload scripts but Discord doesn't support it either so who cares
    if (IS_DISCORD_DESKTOP) require(process.env.DISCORD_PRELOAD!);
}
