/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchPublicUrl, readBody } from "@main/utils/http";
import { IpcMainInvokeEvent } from "electron";

const MAX_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

// The LINE store and sticker hosts send no CORS headers, so the renderer can't read them itself. The address comes
// from a sticker pack or a setting, so it gets the same address checks as every other native fetch
export async function fetchResource(_: IpcMainInvokeEvent, url: string, headers?: Record<string, string>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetchPublicUrl(url, { headers: { ...headers }, signal: controller.signal });
        const data = await readBody(res, MAX_BYTES);
        if (!data) throw new Error("Response is too large");

        return { status: res.status, contentType: res.headers.get("content-type") ?? "", data };
    } finally {
        clearTimeout(timeout);
    }
}
