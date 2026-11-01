/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { parseAllowedUrl, readBody } from "@main/utils/http";
import { IpcMainInvokeEvent } from "electron";

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

// we love CORS
export async function fetchAudio(_: IpcMainInvokeEvent, url: string): Promise<Uint8Array> {
    const res = await fetch(parseAllowedUrl(url, ["cdn.discordapp.com"]));
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    if (!res.headers.get("Content-Type")?.startsWith("audio/")) throw new Error(`${url} is not an audio file`);
    const data = await readBody(res, MAX_AUDIO_BYTES);
    if (!data) throw new Error(`${url} is too large`);
    return data;
}
