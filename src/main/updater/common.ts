/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const ENDCORD_FILES = [
    IS_DISCORD_DESKTOP ? "patcher.js" : "endcordDesktopMain.js",
    IS_DISCORD_DESKTOP ? "preload.js" : "endcordDesktopPreload.js",
    IS_DISCORD_DESKTOP ? "renderer.js" : "endcordDesktopRenderer.js",
    IS_DISCORD_DESKTOP ? "renderer.css" : "endcordDesktopRenderer.css",
    // Endcord Desktop's own two files update with Endcord (desktop/src)
    ...(IS_DISCORD_DESKTOP ? [] : ["main.js", "preload.js"]),
];

/** The release manifest this build reads: Endcord Desktop has its own, signed the same way */
export const MANIFEST_URL = `https://raw.githubusercontent.com/Endcord/Endcord/main/${IS_DISCORD_DESKTOP ? "" : "desktop/"}version.json`;

/** What the updater has actually checked, for the settings page. Nothing here is assumed */
export interface UpdateTrust {
    /** 0 until a release manifest has been fetched */
    checkedAt: number;
    signed: boolean;
    /** Files can only be compared while the release they were signed for is the one running */
    installedFiles: "match" | "changed" | "unknown";
    pending: boolean;
    hasPrevious: boolean;
    /** The release that was undone because it never started, until a later one starts */
    rejected: string | null;
}

export function serializeErrors(func: (...args: any[]) => any) {
    return async function () {
        try {
            return {
                ok: true,
                value: await func(...arguments)
            };
        } catch (e: any) {
            return {
                ok: false,
                error: e instanceof Error ? {
                    // prototypes get lost, so turn error into plain object
                    ...e,
                    message: e.message,
                    name: e.name,
                    stack: e.stack
                } : e
            };
        }
    };
}
