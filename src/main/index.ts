/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./ipcMain";

import { app, type BrowserWindow, net, protocol } from "electron";
import { join } from "path";
import { pathToFileURL } from "url";

import { initCsp } from "./csp";
import { initMemoryTrim } from "./memoryTrim";
import { preOpenRenderer } from "./preOpenRenderer";
import { RendererSettings } from "./settings";
import { IS_VANILLA, THEMES_DIR } from "./utils/constants";
import { ensureSafePath } from "./utils/ensureSafePath";
import { installExt } from "./utils/extensions";

if (IS_VESKTOP) preOpenRenderer();

if (IS_VESKTOP || !IS_VANILLA) {
    app.whenReady().then(() => {
        protocol.handle("endcord", ({ url: unsafeUrl }) => {
            let url = decodeURI(unsafeUrl).slice("endcord://".length).replace(/\?v=\d+$/, "");

            if (url.endsWith("/")) url = url.slice(0, -1);

            if (url.startsWith("/themes/")) {
                const theme = url.slice("/themes/".length);

                const safeUrl = ensureSafePath(THEMES_DIR, theme);
                if (!safeUrl) {
                    return new Response(null, {
                        status: 404
                    });
                }

                return net.fetch(pathToFileURL(safeUrl).toString());
            }

            // Source Maps! Maybe there's a better way but since the renderer is executed
            // from a string I don't think any other form of sourcemaps would work

            switch (url) {
                case "renderer.js.map":
                case "endcordDesktopRenderer.js.map":
                case "preload.js.map":
                case "endcordDesktopPreload.js.map":
                case "patcher.js.map":
                case "endcordDesktopMain.js.map":
                    return net.fetch(pathToFileURL(join(__dirname, url)).toString());
                default:
                    return new Response(null, {
                        status: 404
                    });
            }
        });

        try {
            if (RendererSettings.store.enableReactDevtools)
                installExt("fmkadmapgofadopljbjfkapdkoienihi")
                    .then(() => console.info("[Endcord] Installed React Developer Tools"))
                    .catch(err => console.error("[Endcord] Failed to install React Developer Tools", err));
        } catch { }


        initCsp();
    });
}

if (IS_DISCORD_DESKTOP) {
    require("./patcher");
}

/**
 * Endcord Desktop hands its Discord window over once it's made (see desktop/src/main.ts), for what the patcher does to
 * Discord's own window that doesn't depend on the window's options
 */
export function setupMainWindow(win: BrowserWindow) {
    if (!RendererSettings.store.disableBackgroundMemoryTrim) initMemoryTrim(win);
}
