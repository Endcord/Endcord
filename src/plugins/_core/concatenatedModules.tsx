/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { IconsDef } from "@plugins/iconViewer/types";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { cache, moduleListeners, search, wreq } from "@webpack";

/**
 * Every icon component Discord has loaded, by name. Discord used to keep them all in one module; newer Discord keeps
 * each one in a module of its own and loads many only when they're first shown, so this fills up as modules load.
 * The places that list every icon call loadAllIcons first
 */
export const iconsModule: IconsDef = {};

// Components are named like "AngleBracketsIcon"; helpers like "getChannelIcon" aren't icons
const ICON_NAME = /^[A-Z]\w*Icon$/;

function takeIcons(exports: any) {
    if (exports == null || typeof exports !== "object") return;
    try {
        for (const key in exports) {
            if (key in iconsModule || !ICON_NAME.test(key)) continue;
            const value = exports[key];
            if (typeof value === "function") iconsModule[key] = value;
        }
    } catch { }
}

// The table Discord loads icons by name from: "./AngleBracketsIcon.web.tsx" and the rest
const ICON_TABLE_KEY = "./AngleBracketsIcon.web.tsx";

function findIconTable(): any {
    const isTable = (exports: any) => {
        try {
            return typeof exports === "function" && typeof exports.keys === "function" && exports.keys().includes(ICON_TABLE_KEY);
        } catch {
            return false;
        }
    };

    for (const id in cache) {
        if (isTable(cache[id]?.exports)) return cache[id].exports;
    }
    // Not loaded yet: find it by its code, once
    const id = Object.keys(search(`"${ICON_TABLE_KEY}"`))[0];
    if (id == null) return null;
    const exports = wreq(id as any);
    return isTable(exports) ? exports : null;
}

let loadingAll: Promise<IconsDef> | undefined;

/** Loads every icon Discord has, fetching the ones it hasn't needed yet the way Discord would */
export function loadAllIcons() {
    return loadingAll ??= (async () => {
        const table = findIconTable();
        // Older Discord kept every icon in one module, already read
        if (!table) return iconsModule;

        await Promise.all(table.keys().map((key: string) => Promise.resolve(table(key)).then(takeIcons, () => { })));
        return iconsModule;
    })();
}

export default definePlugin({
    name: "ConcatenatedModules",
    description: "Extract modules that have been concatenated by the bundler",
    authors: [Devs.Ven],

    // Endcord.Plugins.plugins.ConcatenatedModules.iconsModule works too, without IconViewer
    iconsModule,
    loadAllIcons,

    start() {
        for (const id in cache) takeIcons(cache[id]?.exports);
        moduleListeners.add(takeIcons);
    },

    stop() {
        moduleListeners.delete(takeIcons);
    }
});
