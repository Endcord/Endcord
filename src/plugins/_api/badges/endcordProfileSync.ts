/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const ENDCORD_API = "";

type ProfileListener = (userId: string, prof: any) => void;
const listeners = new Set<ProfileListener>();

export function onEndcordProfile(listener: ProfileListener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function markProfileFresh(_userId: string) {
    // Local-only mode: no remote profile directory sync
}

export async function fetchEndcordProfile(_userId: string, _force = false): Promise<any | null> {
    return null;
}

export function queueEndcordProfile(_userId: string) {
    // Local-only mode: no remote profile directory sync
}

export async function fetchAllEndcordProfiles(): Promise<Record<string, any> | null> {
    return null;
}
