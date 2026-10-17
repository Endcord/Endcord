/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const _mergeCache = new WeakMap<object, Map<string, any>>();

export function safeRecordMerge<T extends object>(base: T, overlay: Record<string, any> | null | undefined, cacheKey?: string): T {
    if (!base || typeof base !== "object") return base;
    if (!overlay) return base;

    if (cacheKey) {
        const byKey = _mergeCache.get(base);
        if (byKey && byKey.has(cacheKey)) {
            return byKey.get(cacheKey);
        }
    }

    const clone = Object.create(Object.getPrototypeOf(base));
    for (const key of Reflect.ownKeys(base)) {
        const desc = Object.getOwnPropertyDescriptor(base, key);
        if (!desc) continue;
        try {
            if ("value" in desc) {
                Object.defineProperty(clone, key, {
                    value: desc.value,
                    writable: true,
                    configurable: true,
                    enumerable: !!desc.enumerable
                });
            } else {
                Object.defineProperty(clone, key, {
                    get: desc.get,
                    set: desc.set || (() => { }),
                    configurable: true,
                    enumerable: !!desc.enumerable
                });
            }
        } catch { }
    }
    for (const key of Object.keys(overlay)) {
        if (overlay[key] === undefined) continue;
        try {
            Object.defineProperty(clone, key, {
                configurable: true,
                enumerable: true,
                writable: true,
                value: overlay[key]
            });
        } catch { }
    }

    if (cacheKey) {
        let byKey = _mergeCache.get(base);
        if (!byKey) {
            byKey = new Map<string, any>();
            _mergeCache.set(base, byKey);
        }
        if (byKey.size > 16) byKey.clear();
        byKey.set(cacheKey, clone);
    }

    return clone;
}
