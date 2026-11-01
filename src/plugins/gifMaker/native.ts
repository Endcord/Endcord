/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DISCORD_CDN_HOSTS, parseAllowedUrl, readBody } from "@main/utils/http";

const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const ALLOWED_MEDIA_HOSTS = [
    ...DISCORD_CDN_HOSTS,
    "images-ext-1.discordapp.net",
    "images-ext-2.discordapp.net",
    "media.tenor.com",
    "tenor.com",
    "media.giphy.com",
    "media0.giphy.com",
    "media1.giphy.com",
    "media2.giphy.com",
    "media3.giphy.com",
    "media4.giphy.com",
];

export async function fetchMedia(_: unknown, url: string) {
    const res = await fetch(parseAllowedUrl(url, ALLOWED_MEDIA_HOSTS), { headers: { Accept: "*/*" } });
    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const data = await readBody(res, MAX_MEDIA_BYTES);
    if (!data) throw new Error("File is too large");
    if (data.length === 0) throw new Error(`Empty body (${res.status}) from ${url}`);

    return {
        data: data.buffer,
        type: res.headers.get("content-type") || "application/octet-stream"
    };
}
