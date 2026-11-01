/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DISCORD_CDN_HOSTS, parseAllowedUrl, readBody } from "@main/utils/http";
import { IpcMainInvokeEvent } from "electron";

const MAX_FILE_SIZE = 12e6;

// The visualizer needs the raw audio, and Discord's CDN doesn't send CORS headers
export async function fetchAudio(_: IpcMainInvokeEvent, src: string) {
    const res = await fetch(parseAllowedUrl(src, DISCORD_CDN_HOSTS));
    if (!res.ok) throw new Error(`CDN returned ${res.status}`);

    const data = await readBody(res, MAX_FILE_SIZE);
    return data && { data, type: res.headers.get("content-type") ?? "" };
}
