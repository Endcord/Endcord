/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function compareVersions(a: string, b: string) {
    const [left, right] = [a, b].map(version => version.split(".").map(Number));

    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const difference = (left[i] ?? 0) - (right[i] ?? 0);
        if (difference) return difference;
    }

    return 0;
}

/** `releases` is newest first, and holds only the releases worth announcing */
export function pickUnseenRelease<T extends { version: string; }>(releases: T[], current: string, lastSeen: string | undefined, justUpdated: boolean) {
    // A fresh install has nothing to compare with, and nothing is new to it
    if (!lastSeen && !justUpdated) return undefined;

    return releases.find(({ version }) => compareVersions(version, current) <= 0 && (!lastSeen || compareVersions(version, lastSeen) > 0));
}
