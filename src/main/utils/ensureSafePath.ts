/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { join, normalize } from "path";

// Windows opens a device for these whatever the extension, so reading CON.css never returns. It also drops a trailing
// dot or space and reads "a.css:b" as a hidden stream, so the file that gets opened isn't the one that was checked
const UNSAFE_FILE_NAME = /^(?:con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(?:\..*)?$|[<>:"|?*\0-\x1f]|[. ]$/i;

export function isSafeFileName(name: string) {
    return !UNSAFE_FILE_NAME.test(name);
}

export function ensureSafePath(basePath: string, path: string) {
    const names = path.split(/[\\/]/).filter(name => name && name !== "." && name !== "..");
    if (!names.every(isSafeFileName)) return null;

    const normalizedBasePath = normalize(`${basePath}/`);
    const newPath = join(basePath, path);
    const normalizedPath = normalize(newPath);
    return normalizedPath === normalize(basePath) || normalizedPath.startsWith(normalizedBasePath)
        ? normalizedPath
        : null;
}
