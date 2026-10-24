/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { localStorage } from "@utils/localStorage";

/*
 * Remembers which module each webpack find resolved to, keyed by Discord's build id. The next start checks that
 * module first instead of walking every loaded module. If it no longer matches, the normal full search runs.
 */

const STORAGE_KEY = "EndcordFindCache";
const SAVE_DELAY = 10_000;

export const SYM_FIND_CACHE_KEY = Symbol("Endcord.findCacheKey");

let loaded = false;
let buildId: string | undefined;
let map: Record<string, string> = {};
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function load() {
    loaded = true;
    if (IS_REPORTER) return;

    try {
        buildId = window.GLOBAL_ENV?.SENTRY_TAGS?.buildId;
        if (!buildId || !localStorage) return;

        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if (stored?.buildId === buildId && stored.map) map = stored.map;
    } catch {
        buildId = undefined;
        map = {};
    }
}

/** The module id `filter` resolved to last time, if any. */
export function getCachedModuleId(filter: any): string | undefined {
    if (!loaded) load();
    const key = filter?.[SYM_FIND_CACHE_KEY];
    return key != null && buildId ? map[key] : undefined;
}

export function rememberModuleId(filter: any, moduleId: PropertyKey) {
    const key = filter?.[SYM_FIND_CACHE_KEY];
    if (key == null || !buildId) return;

    const id = String(moduleId);
    if (map[key] === id) return;
    map[key] = id;

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ buildId, map }));
        } catch { }
    }, SAVE_DELAY);
}

/** Tags a filter with a stable key so its result can be cached. */
export function withCacheKey<T extends object>(filter: T, kind: string, args: readonly unknown[]): T {
    filter[SYM_FIND_CACHE_KEY] = `${kind}\u0001${args.map(String).join("\u0001")}`;
    return filter;
}
