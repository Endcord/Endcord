/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { localStorage } from "@utils/localStorage";
import { Logger } from "@utils/Logger";
import { Patch } from "@utils/types";

/*
 * Remembers which patches matched which Discord modules, so the next start only tests those instead of searching
 * every module for every patch's `find` (the biggest cost Endcord adds to startup).
 *
 * The cache is keyed by Discord's build id and by the exact list of patches. Updating Discord, updating Endcord or
 * turning a patching plugin on or off changes the key, and that start scans everything again and rebuilds it.
 * A module the cache has never seen is always scanned in full.
 */

const STORAGE_KEY = "EndcordPatchCache";
// 2: the first version skipped a module's later patches after its first match, so its records are incomplete
const CACHE_VERSION = 2;
const SAVE_DELAY = 10_000;

const logger = new Logger("PatchCache", "#a6d189");

interface StoredCache {
    key: string;
    scanned: string[];
    matches: Record<string, number[]>;
}

let enabled = !IS_REPORTER;
let initialised = false;
let cacheKey = "";
const patchIndex = new WeakMap<Patch, number>();

/**
 * Patch indices that matched each module, for every module that was scanned. Skipping only ever reads `previous`,
 * what earlier starts recorded: reading this start's own records would skip the rest of a module's patches as soon
 * as its first patch matched.
 */
let previous = new Map<string, Set<number>>();
const current = new Map<string, Set<number>>();
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function hash(str: string) {
    // FNV-1a, enough to tell patch lists apart
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36) + str.length.toString(36);
}

/** Loads the cache for the current patch list. Call before patching a module, while `patches` is still complete. */
export function ensurePatchCache(patches: Patch[]) {
    if (initialised) return;
    initialised = true;
    if (!enabled) return;

    try {
        const buildId = window.GLOBAL_ENV?.SENTRY_TAGS?.buildId;
        if (!buildId || !localStorage) {
            enabled = false;
            return;
        }

        const signature = patches.map((p, i) => {
            patchIndex.set(p, i);
            return `${p.plugin}\u0001${String(p.find)}\u0001${p.all ? 1 : 0}`;
        }).join("\u0002");
        // Bump CACHE_VERSION whenever what the cache records changes, so old records are rebuilt instead of trusted
        cacheKey = `${CACHE_VERSION}:${buildId}:${hash(signature)}`;

        const stored: StoredCache | null = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if (stored?.key !== cacheKey) return;

        for (const id of stored.scanned) previous.set(id, new Set());
        for (const id in stored.matches) previous.set(id, new Set(stored.matches[id]));
    } catch (err) {
        logger.error("Couldn't load the patch cache, scanning everything instead", err);
        enabled = false;
        previous = new Map();
    }
}

/**
 * Whether `patch` can be skipped for `moduleId` because the module was scanned before and the patch didn't match it.
 * Call once per patch while patching a module.
 */
export function canSkipPatch(moduleId: PropertyKey, patch: Patch) {
    if (!enabled) return false;

    const matched = previous.get(String(moduleId));
    const index = patchIndex.get(patch);
    return matched != null && index != null && !matched.has(index);
}

/** Records that `patch` matched `moduleId`. */
export function recordMatch(moduleId: PropertyKey, patch: Patch) {
    if (!enabled) return;

    const index = patchIndex.get(patch);
    if (index == null) return;

    const id = String(moduleId);
    const matched = current.get(id);
    if (matched == null) current.set(id, new Set([index]));
    else if (!matched.has(index)) matched.add(index);
    else return;

    scheduleSave();
}

/** Records that `moduleId` was scanned against every patch. */
export function recordScanned(moduleId: PropertyKey) {
    if (!enabled) return;

    const id = String(moduleId);
    if (current.has(id)) return;

    current.set(id, new Set());
    scheduleSave();
}

function scheduleSave() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY);
}

function save() {
    if (!dirty || !enabled) return;
    dirty = false;

    try {
        const stored: StoredCache = { key: cacheKey, scanned: [], matches: {} };
        // Keep what earlier starts saw for modules that didn't load this time
        const merged = new Map([...previous, ...current]);
        for (const [id, matched] of merged) {
            if (matched.size) stored.matches[id] = [...matched];
            else stored.scanned.push(id);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (err) {
        logger.error("Couldn't save the patch cache", err);
    }
}
