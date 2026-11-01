/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DISCORD_CDN_HOSTS, parseAllowedUrl, readBody } from "@main/utils/http";
import { IpcMainInvokeEvent } from "electron";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
const FETCH_TIMEOUT_MS = 30000;
const MAX_PDF_BYTES = 100 * 1024 * 1024;

function checkUrl(rawUrl: string) {
    const url = parseAllowedUrl(rawUrl, DISCORD_CDN_HOSTS);

    const path = decodeURIComponent(url.pathname).toLowerCase();
    if (!path.startsWith("/attachments/") && !path.startsWith("/ephemeral-attachments/"))
        throw new Error("Not an attachment path");
    if (!path.endsWith(".pdf")) throw new Error("Not a PDF");

    return url;
}

export async function fetchPdf(_: IpcMainInvokeEvent, rawUrl: string, maxBytes: number) {
    const url = checkUrl(rawUrl);
    const limit = Math.min(Number(maxBytes) || 0, MAX_PDF_BYTES);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            redirect: "manual",
            signal: controller.signal,
            headers: { Accept: "application/pdf,*/*;q=0.1" },
        });

        if (res.status >= 300 && res.status < 400) throw new Error("CDN tried to redirect, refusing");
        if (!res.ok) throw new Error(`CDN returned ${res.status}`);

        const out = await readBody(res, limit);
        if (!out) throw new Error("PDF exceeded the size limit");

        for (let i = 0; i < PDF_MAGIC.length; i++) {
            if (out[i] !== PDF_MAGIC[i]) throw new Error("Downloaded data is not a valid PDF");
        }

        return out;
    } finally {
        clearTimeout(timeout);
    }
}
