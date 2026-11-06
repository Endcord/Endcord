/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isSafeExternalUrl } from "@shared/externalLinks";
import { isDiscordOrigin } from "@shared/trustedOrigins";
import { type IpcMainEvent, type IpcMainInvokeEvent, shell } from "electron";
import { join } from "path";

export const DISCORD_URL = "https://discord.com/app";
export const APP_ID = "com.endcord.desktop";
// Endcord's night blue, so the window never flashes white while Discord loads
export const BACKGROUND = "#10182a";
// Plain Discord web, no Endcord: for comparing the two
export const VANILLA = process.argv.includes("--vanilla");
/** A test or second profile (ENDCORD_DESKTOP_DATA_DIR): nothing outside its folder changes, no shortcut, no autostart */
export const TEST_PROFILE = !!process.env.ENDCORD_DESKTOP_DATA_DIR;

const ICON_FILE = ({ win32: "icon.ico", linux: "icon.png" } as Record<string, string>)[process.platform];
export const ICON = ICON_FILE && join(__dirname, ICON_FILE);

export function isDiscordUrl(url: string) {
    try {
        const { protocol, origin } = new URL(url);
        return protocol === "https:" && isDiscordOrigin(origin);
    } catch {
        return false;
    }
}

/** Whether an IPC message comes from Discord's own page, the only one that gets the app's API */
export const fromDiscord = (event: IpcMainEvent | IpcMainInvokeEvent) => !!event.senderFrame && isDiscordUrl(event.senderFrame.url);

export function openExternally(url: string) {
    if (isSafeExternalUrl(url)) shell.openExternal(url);
}
