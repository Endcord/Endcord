/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Lives here rather than in the HideEndcord plugin so the header bar and settings keep working with that plugin removed

let isHidden = false;
const listeners = new Set<() => void>();

export function getIsEndcordHidden() {
    return isHidden;
}

export function setEndcordHidden(hidden: boolean) {
    if (isHidden === hidden) return;

    isHidden = hidden;
    listeners.forEach(cb => cb());
}

export function onHiddenChange(cb: () => void) {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}
