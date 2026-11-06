/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { LocaleKind } from "@shared/externalLocales";
import { Logger } from "@utils/Logger";

import type { LangTable } from "./types";

/** A translation table the build packed as base64 of its UTF-8 JSON (packLocalesPlugin in scripts/build/common.mjs) */
export function unpackTable(packed: string): LangTable {
    const bytes = Uint8Array.from(atob(packed), char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * A translation table the desktop build left out of the script (externalLocalesPlugin in scripts/build/common.mjs).
 * Without one, the text stays in English.
 */
export function loadExternalTable(lang: string, kind: LocaleKind): LangTable {
    try {
        const json = EndcordNative.i18n.readTable(lang, kind);
        if (json) return JSON.parse(json);
        new Logger("i18n").warn(`No ${lang} translations next to the script, showing English`);
    } catch (err) {
        new Logger("i18n").error(`Couldn't load the ${lang} translations`, err);
    }

    return {};
}
