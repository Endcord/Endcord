/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, isAbsolute, join, normalize } from "path";

export async function readRecording(_: any, filePath: string) {
    filePath = normalize(filePath);
    const filename = basename(filePath);
    const discordBaseDir = normalize(`${app.getPath("userData")}/`);

    if (!/^\d*recording\.ogg$/.test(filename) || !filePath.startsWith(discordBaseDir)) {
        return null;
    }

    try {
        const content = await readFile(filePath);
        return new Uint8Array(content.buffer);
    } catch {
        return null;
    }
}

export async function saveRecording(_: any, fileBuffer: ArrayBuffer, folder: string, filename: string) {
    folder = normalize(folder || app.getPath("downloads"));
    filename = basename(normalize(filename));

    // The folder comes from the renderer, so never write anything Windows could run. A UNC path would also hand the login hash to that server
    if (!fileBuffer || !isAbsolute(folder) || folder.startsWith("\\\\") || !/^[\w.-]+\.ogg$/.test(filename)) {
        throw new Error("Invalid path");
    }

    const destPath = join(folder, filename);
    await mkdir(folder, { recursive: true });
    await writeFile(destPath, Buffer.from(fileBuffer));
    return destPath;
}
