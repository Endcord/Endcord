/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DISCORD_CDN_HOSTS, parseAllowedUrl } from "@main/utils/http";
import { IpcMainInvokeEvent } from "electron";

export async function saveAttachment(e: IpcMainInvokeEvent, url: string) {
    e.sender.downloadURL(parseAllowedUrl(url, DISCORD_CDN_HOSTS).href);
}
