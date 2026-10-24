/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { ENDCORD_USER_AGENT } from "@shared/endcordUserAgent";
import { IpcEvents } from "@shared/IpcEvents";
import { createHash } from "crypto";
import { ipcMain } from "electron";
import { rename, writeFile } from "fs/promises";
import { join } from "path";

import gitHash from "~git-hash";

import { ENDCORD_FILES,serializeErrors } from "./common";

const API_BASE = "https://api.github.com/repos/rootpoii/endcord";

interface PendingAsset {
    name: string;
    url: string;
    sha256: string;
}
let PendingUpdates = [] as PendingAsset[];

async function githubGet<T = any>(endpoint: string) {
    return fetchJson<T>(API_BASE + endpoint, {
        headers: {
            Accept: "application/vnd.github+json",
            // "All API requests MUST include a valid User-Agent header.
            // Requests with no User-Agent header will be rejected."
            "User-Agent": ENDCORD_USER_AGENT
        }
    });
}

async function calculateGitChanges() {
    const isOutdated = await fetchUpdates();
    if (!isOutdated) return [];

    try {
        const data = await githubGet(`/compare/${gitHash}...HEAD`);

        return data.commits.map((c: any) => ({
            // github api only sends the long sha
            hash: c.sha.slice(0, 7),
            author: c.author?.login ?? c.commit?.author?.name ?? "Unknown Author",
            message: c.commit.message.split("\n")[0]
        }));
    } catch {
        return [{
            hash: "new",
            author: "GitHub",
            message: "New update available on GitHub"
        }];
    }
}

async function fetchUpdates() {
    try {
        const cacheBust = `?t=${Date.now()}`;
        const apiData = await fetchJson<any>(`https://raw.githubusercontent.com/rootpoii/endcord/main/version.json${cacheBust}`);
        if (apiData && apiData.assets && Array.isArray(apiData.assets) && apiData.assets.length > 0) {
            const remoteTs = Number(apiData.updatedAt || 0);
            const localTs = typeof BUILD_TIMESTAMP === "number" ? BUILD_TIMESTAMP : 0;

            // Only consider it an update if the remote release timestamp is strictly greater than our build timestamp!
            if (remoteTs > localTs && apiData.hash !== gitHash) {
                // Only the four Endcord files, each with a checksum; anything else means the manifest is bad.
                const assets = (apiData.assets as any[]).filter(a =>
                    ENDCORD_FILES.includes(a?.name) && typeof a.url === "string" && /^[a-f0-9]{64}$/i.test(a.sha256 ?? ""));
                if (assets.length !== apiData.assets.length) return false;
                PendingUpdates = assets.map(a => ({ name: a.name, url: a.url, sha256: a.sha256.toLowerCase() }));
                return true;
            }
        }
    } catch { }

    return false;
}

async function applyUpdates() {
    // Download and verify everything before touching the installed files.
    const files = await Promise.all(PendingUpdates.map(async ({ name, url, sha256 }) => {
        const contents = await fetchBuffer(url);
        const actual = createHash("sha256").update(contents).digest("hex");
        if (actual !== sha256)
            throw new Error(`Update rejected: ${name} does not match its checksum`);
        return { target: join(__dirname, name), contents };
    }));

    // Stage next to the real files, then swap them in, so a failed write never leaves a half-written Endcord.
    await Promise.all(files.map(f => writeFile(f.target + ".update", f.contents)));
    for (const f of files)
        await rename(f.target + ".update", f.target);

    PendingUpdates = [];
    return true;
}

ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => "https://github.com/rootpoii/Endcord"));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(calculateGitChanges));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
ipcMain.handle(IpcEvents.BUILD, serializeErrors(applyUpdates));
