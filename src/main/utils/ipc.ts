/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { isDiscordOrigin } from "@shared/trustedOrigins";
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";

// The QuickCSS editor is a data: page running code from a CDN, so it gets only what it needs to edit the file
const EDITOR_CHANNELS = new Set<string>([IpcEvents.GET_QUICK_CSS, IpcEvents.SET_QUICK_CSS]);

function getOrigin(url: string, origin?: string) {
    if (origin) return origin;

    try {
        return new URL(url).origin;
    } catch {
        return "null";
    }
}

export function isTrustedSender({ senderFrame }: IpcMainEvent | IpcMainInvokeEvent, channel: string) {
    if (!senderFrame) return false;
    if (senderFrame.url.startsWith("data:")) return EDITOR_CHANNELS.has(channel);

    return isDiscordOrigin(getOrigin(senderFrame.url, senderFrame.origin));
}

/** Every invoke channel goes through here, so a page that reached the preload still can't use what's behind it */
export function handleIpc(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) {
    // eslint-disable-next-line no-restricted-syntax -- this is the one place that registers them
    ipcMain.handle(channel, (event, ...args) => {
        if (!isTrustedSender(event, channel)) throw new Error(`Refused ${channel}`);

        return listener(event, ...args);
    });
}
