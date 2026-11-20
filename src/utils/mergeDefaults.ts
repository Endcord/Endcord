/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Recursively merges defaults into an object and returns the same object
 * @param obj Object
 * @param defaults Defaults
 * @returns obj
 */
export function mergeDefaults<T>(obj: T, defaults: T): T {
    for (const key in defaults) {
        const v = defaults[key];
        if (typeof v === "object" && !Array.isArray(v)) {
            obj[key] ??= {} as any;
            // An imported or hand-edited file can hold a primitive here; writing into it throws in strict mode
            if (v && typeof obj[key] !== "object") obj[key] = {} as any;
            mergeDefaults(obj[key], v);
        } else {
            obj[key] ??= v;
        }
    }
    return obj;
}
