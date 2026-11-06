/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";
import type { PropsWithChildren } from "react";

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

/** Whether Endcord is hidden, re-rendering the component when that changes */
export function useEndcordHidden() {
    return React.useSyncExternalStore(onHiddenChange, getIsEndcordHidden);
}

/**
 * Leaves out what a plugin draws while Endcord is hidden. Only the drawing goes: the plugin keeps running, so a
 * fake mute stays a fake mute. The APIs plugins draw through wrap their output in this, so every plugin follows it
 */
export function EndcordOnly({ children }: PropsWithChildren) {
    return useEndcordHidden() ? null : <>{children}</>;
}
