/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isSafeExternalUrl } from "@shared/externalLinks";
import { type BrowserWindow, shell } from "electron";

export function makeLinksOpenExternally(win: BrowserWindow) {
    win.webContents.setWindowOpenHandler(({ url }) => {
        switch (url) {
            case "about:blank":
            case "https://discord.com/popout":
            case "https://ptb.discord.com/popout":
            case "https://canary.discord.com/popout":
                return { action: "allow" };
        }

        openExternally(url);

        return { action: "deny" };
    });
}

/** Opens a link in the browser, or an app's own link in that app, if it's one that's safe to hand over */
export function openExternally(url: string) {
    // eslint-disable-next-line no-restricted-syntax -- this is the check
    if (isSafeExternalUrl(url)) shell.openExternal(url);
}
