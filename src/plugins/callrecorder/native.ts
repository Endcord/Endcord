/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { basename, isAbsolute, join, normalize } from "path";

// Only discord_voice's own recording in userData can be read or deleted through these
function recordingPath(filePath: string) {
    filePath = normalize(filePath);
    const discordBaseDir = normalize(`${app.getPath("userData")}/`);
    return /^\d*recording\.ogg$/.test(basename(filePath)) && filePath.startsWith(discordBaseDir) ? filePath : null;
}

export async function readRecording(_: any, filePath: string) {
    const path = recordingPath(filePath);
    if (!path) return null;

    try {
        const content = await readFile(path);
        return new Uint8Array(content.buffer);
    } catch {
        return null;
    }
}

// discord_voice leaves the raw recording in userData. Removed only once the copy is saved, so a failed save loses nothing
export async function discardRecording(_: any, filePath: string) {
    const path = recordingPath(filePath);
    if (path) await rm(path, { force: true }).catch(() => { });
}

// Windows opens these as devices whatever extension follows
const DEVICE_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

export async function saveRecording(_: any, fileBuffer: ArrayBuffer, folder: string, filename: string) {
    folder = normalize(folder || app.getPath("downloads"));
    filename = basename(normalize(filename));

    // The folder comes from the renderer, so never write anything Windows could run. A UNC path would also hand the login hash to that server
    if (!fileBuffer || !isAbsolute(folder) || folder.startsWith("\\\\") || !/^[\w.-]+\.ogg$/.test(filename) || DEVICE_NAME.test(filename)) {
        throw new Error("Invalid path");
    }

    const destPath = join(folder, filename);
    await mkdir(folder, { recursive: true });
    // "wx": a recording never replaces a file that's already there
    await writeFile(destPath, Buffer.from(fileBuffer), { flag: "wx" });
    return destPath;
}
