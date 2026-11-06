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
/** The patch list as it was when the cache loaded, so a recorded index still finds its patch after others are used up */
let patchByIndex: Patch[] = [];
const NO_PATCHES: Patch[] = [];

/**
 * Patch indices that matched each module, for every module that was scanned. Skipping only ever reads `previous`,
 * what earlier starts recorded: reading this start's own records would skip the rest of a module's patches as soon
 * as its first patch matched.
 */
/** What modules that matched no patch hold, instead of an empty set each: they are most of Discord's tens of thousands */
const NONE: ReadonlySet<number> = new Set();
let previous = new Map<string, ReadonlySet<number>>();
const current = new Map<string, ReadonlySet<number>>();
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

        patchByIndex = [...patches];
        const signature = patches.map((p, i) => {
            patchIndex.set(p, i);
            return `${p.plugin}\u0001${String(p.find)}\u0001${p.all ? 1 : 0}`;
        }).join("\u0002");
        // Bump CACHE_VERSION whenever what the cache records changes, so old records are rebuilt instead of trusted
        cacheKey = `${CACHE_VERSION}:${buildId}:${hash(signature)}`;

        const stored: StoredCache | null = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if (stored?.key !== cacheKey) return;

        for (const id of stored.scanned) previous.set(id, NONE);
        for (const id in stored.matches) previous.set(id, new Set(stored.matches[id]));
    } catch (err) {
        logger.error("Couldn't load the patch cache, scanning everything instead", err);
        enabled = false;
        previous = new Map();
    }
}

/**
 * The patches that matched `moduleId` on earlier starts, in their original order, or undefined if the module was
 * never scanned and has to be checked against every patch. Most modules match none, so they skip patching entirely.
 */
export function cachedPatchesFor(moduleId: PropertyKey): Patch[] | undefined {
    if (!enabled) return undefined;

    const matched = previous.get(String(moduleId));
    if (matched == null) return undefined;
    if (!matched.size) return NO_PATCHES;

    return [...matched].sort((a, b) => a - b).map(index => patchByIndex[index]).filter(Boolean);
}

/** Records that `patch` matched `moduleId`. */
export function recordMatch(moduleId: PropertyKey, patch: Patch) {
    if (!enabled) return;

    const index = patchIndex.get(patch);
    if (index == null) return;

    const id = String(moduleId);
    const matched = current.get(id);
    if (matched == null || matched === NONE) current.set(id, new Set([index]));
    else if (!matched.has(index)) (matched as Set<number>).add(index);
    else return;

    scheduleSave();
}

/** Records that `moduleId` was scanned against every patch. */
export function recordScanned(moduleId: PropertyKey) {
    if (!enabled) return;

    const id = String(moduleId);
    if (current.has(id)) return;

    current.set(id, NONE);
    scheduleSave();
}

// Thousands of modules record themselves at startup, so this sets one timer instead of resetting it for each
function scheduleSave() {
    dirty = true;
    saveTimer ??= setTimeout(save, SAVE_DELAY);
}

function save() {
    saveTimer = undefined;
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
