/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";

const backupOf = (path: string) => `${path}.bak`;

/**
 * Replaces a file in one step, so a crash or power cut leaves the old contents or the new ones, never half of each.
 * A rename alone isn't enough: without the fsync the name can reach the disk before the data does.
 */
export function writeFileDurably(path: string, contents: string) {
    const temp = `${path}.${process.pid}.tmp`;

    try {
        const fd = openSync(temp, "w");
        try {
            writeFileSync(fd, contents);
            fsyncSync(fd);
        } finally {
            closeSync(fd);
        }

        if (existsSync(path)) copyFileSync(path, backupOf(path));
        renameSync(temp, path);
    } catch {
        // Antivirus can hold the file for a moment on Windows. Losing the save would be worse than a plain write
        rmSync(temp, { force: true });
        writeFileSync(path, contents);
    }
}

/** Reads JSON written by {@link writeFileDurably}. A damaged file is set aside and the last good copy used instead */
export function readJsonDurably<T>(path: string): T | null {
    let text: string;
    try {
        text = readFileSync(path, "utf-8");
    } catch (err: any) {
        if (err?.code === "ENOENT") return null;
        throw err;
    }

    try {
        return JSON.parse(text);
    } catch (err) {
        console.error(`[Endcord] ${path} is damaged, trying its backup`, err);
    }

    try {
        copyFileSync(path, `${path}.damaged`);
        return JSON.parse(readFileSync(backupOf(path), "utf-8"));
    } catch {
        return null;
    }
}
