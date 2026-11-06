/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * The desktop renderer keeps its translation tables outside its code: the build appends them to renderer.js inside
 * one block comment, a line per table holding its JSON. The preload cuts that block off before it runs the script,
 * and reads a table only when its language is used. V8 keeps a script's whole source in memory, so tables nobody
 * uses no longer cost memory or parsing.
 */

export const LOCALES_MARKER = "\n/*endcord-locales\n";

export type LocaleKind = "dict" | "desc";

const LANG = /^[a-z]{2}$/;

/** The renderer code without the tables, which is all that should ever run */
export function stripLocales(rendererSource: string) {
    const at = rendererSource.lastIndexOf(LOCALES_MARKER);
    return at === -1 ? rendererSource : rendererSource.slice(0, at + 1);
}

/** One table's JSON, or null if this file has none for it */
export function findLocaleTable(rendererSource: string, lang: string, kind: LocaleKind): string | null {
    if (!LANG.test(lang) || (kind !== "dict" && kind !== "desc")) return null;

    const start = rendererSource.lastIndexOf(LOCALES_MARKER);
    if (start === -1) return null;

    // The marker's last newline starts the first line
    const key = `\n${lang}.${kind} `;
    const at = rendererSource.indexOf(key, start + LOCALES_MARKER.length - 1);
    if (at === -1) return null;

    const from = at + key.length;
    const end = rendererSource.indexOf("\n", from);
    return rendererSource.slice(from, end === -1 ? undefined : end);
}
