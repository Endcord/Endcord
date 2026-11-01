/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MessageAttachment } from "@endcord/discord-types";
import { DISCORD_CDN_HOSTS, parseAllowedUrl, readBody } from "@main/utils/http";

const MAX_ATTACHMENT_BYTES = 512 * 1024 * 1024;
const ALLOWED_HOSTS = [...DISCORD_CDN_HOSTS, "images-ext-1.discordapp.net", "images-ext-2.discordapp.net"];

// Discord has very strict CORS rules for which types of assets can be fetched from where (CDN/Media proxy),
// and most binary file types are prohibited by both. This function serves as a simple bypass.
export async function fetchAttachment(_: unknown, attachment: MessageAttachment) {
    const { content_type, filename } = attachment;
    const res = await fetch(parseAllowedUrl(attachment.url, ALLOWED_HOSTS), { headers: { Accept: "*/*" } });
    if (!res.ok) throw new Error("Server error");

    const data = await readBody(res, MAX_ATTACHMENT_BYTES);
    if (!data) throw new Error("File is too large");

    const type = res.headers.get("content-type") || content_type || "application/octet-stream";

    return { type, data: data.buffer, filename };
}
