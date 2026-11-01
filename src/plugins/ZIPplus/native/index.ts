/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchPublicUrl, readBody } from "@main/utils/http";
import { IpcMainInvokeEvent } from "electron";

const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30000;

export async function fetchAttachment(_event: IpcMainInvokeEvent, url: string): Promise<Uint8Array | null> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        if (!url) return null;

        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetchPublicUrl(url, { signal: controller.signal });
        if (!res.ok) return null;

        return await readBody(res, MAX_ATTACHMENT_BYTES);
    } catch {
        return null;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}
