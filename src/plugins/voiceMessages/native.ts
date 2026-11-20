/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { readFile, rm } from "fs/promises";
import { basename, normalize } from "path";

function isRecordingPath(filePath: string) {
    const discordBaseDirWithTrailingSlash = normalize(`${app.getPath("userData")}/`);
    return /^\d*recording\.ogg$/.test(basename(filePath)) && filePath.startsWith(discordBaseDirWithTrailingSlash);
}

export async function readRecording(_, filePath: string) {
    filePath = normalize(filePath);
    if (!isRecordingPath(filePath)) return null;

    try {
        const buf = await readFile(filePath);
        rm(filePath).catch(() => { });
        return new Uint8Array(buf.buffer);
    } catch {
        return null;
    }
}

export async function discardRecording(_, filePath: string) {
    filePath = normalize(filePath);
    if (isRecordingPath(filePath)) await rm(filePath, { force: true }).catch(() => { });
}
