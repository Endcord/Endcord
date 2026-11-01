/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchPublicUrl, readBody } from "@main/utils/http";
import { IpcMainInvokeEvent } from "electron";

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

export async function fetchMedia(_event: IpcMainInvokeEvent, url: string) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        if (!url) return null;

        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const response = await fetchPublicUrl(url, { signal: controller.signal });
        if (!response.ok) return null;

        const data = await readBody(response, MAX_MEDIA_BYTES);
        if (!data?.length) return null;

        return {
            data,
            contentType: response.headers.get("content-type") ?? ""
        };
    } catch {
        return null;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}
