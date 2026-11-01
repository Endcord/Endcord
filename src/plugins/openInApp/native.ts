/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchPublicUrl } from "@main/utils/http";
import { IpcMainInvokeEvent } from "electron";

// These links don't support CORS, so this has to be native
const validRedirectUrls = /^https:\/\/(spotify\.link|s\.team)\/.+$/;

export async function resolveRedirect(_: IpcMainInvokeEvent, url: string) {
    if (!validRedirectUrls.test(url)) return url;

    const response = await fetchPublicUrl(url, { method: "HEAD" });
    await response.body?.cancel();
    return response.url;
}
