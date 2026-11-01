/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RendererSettings } from "@main/settings";
import { app } from "electron";
import adguard from "file://adguard.js?minify";

function isYoutubeEmbed(url?: string) {
    try {
        const { hostname, pathname } = new URL(url!);
        return (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) && pathname.startsWith("/embed/");
    } catch {
        return false;
    }
}

app.on("browser-window-created", (_, win) => {
    win.webContents.on("frame-created", (_, { frame }) => {
        frame?.once("dom-ready", () => {
            if (!RendererSettings.store.plugins?.YoutubeAdblock?.enabled) return;

            if (isYoutubeEmbed(frame.url)) {
                frame.executeJavaScript(adguard);
            } else if (isYoutubeEmbed(frame.parent?.url)) {
                frame.parent!.executeJavaScript(adguard);
            }
        });
    });
});
