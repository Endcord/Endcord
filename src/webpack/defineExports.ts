/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Endcord's stand-in for Webpack's defineExports (wreq.d), which Discord's modules call to fill in their exports. It does
 * what Webpack's does, except that every export stays configurable, so a specific one can later be left out of Webpack
 * searches by making it non-enumerable.
 *
 * Newer Webpack passes exports that never change as plain values, after the getters: d(exports, getters, values), as in
 * `n.d(t, {}, { A: l })`. Leaving those out once left Discord's Logger module empty, and Discord stopped at its splash
 * screen (test/webpack.mjs)
 */
export function defineExports(exports: Record<PropertyKey, any>, getters?: Record<PropertyKey, () => any>, values?: Record<PropertyKey, any>) {
    for (const key in getters) {
        if (Object.hasOwn(getters, key) && !Object.hasOwn(exports, key)) {
            Object.defineProperty(exports, key, {
                enumerable: true,
                configurable: true,
                get: getters[key],
            });
        }
    }
    for (const key in values) {
        if (Object.hasOwn(values, key) && !Object.hasOwn(exports, key)) {
            Object.defineProperty(exports, key, {
                enumerable: true,
                configurable: true,
                value: values[key],
            });
        }
    }
}
