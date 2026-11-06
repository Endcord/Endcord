/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isSettingHidden } from "@api/PluginManager";
import { getCurrentLang, t } from "@utils/i18n";
import { wordsFromCamel, wordsToTitle } from "@utils/text";
import { OptionType, Plugin } from "@utils/types";

import Plugins from "~plugins";

export interface SettingEntry {
    plugin: Plugin;
    key: string;
    title: string;
    description: string;
    /** English and translated text together, so a search in either finds it */
    haystack: string;
}

let index: { lang: string; entries: SettingEntry[]; } | undefined;

/** Every plugin's settings by name and description. Builds once per language, and loads every plugin to do it */
export function getSettingEntries() {
    const lang = getCurrentLang();
    if (index?.lang === lang) return index.entries;

    const entries: SettingEntry[] = [];
    for (const plugin of Object.values(Plugins)) {
        const { settings } = plugin;
        if (!settings?.def || plugin.hidden) continue;

        for (const [key, setting] of Object.entries(settings.def)) {
            if (setting.type === OptionType.CUSTOM || setting.type === OptionType.COMPONENT) continue;

            try {
                if (isSettingHidden(settings, setting)) continue;
            } catch {
                // Some decide from the plugin's live state, which isn't there while it's off
            }

            const name = setting.displayName ?? wordsToTitle(wordsFromCamel(key));
            const description = setting.description ?? "";
            const title = t(name);
            const translated = description && t(description);

            entries.push({
                plugin,
                key,
                title,
                description: translated,
                haystack: `${name}\n${title}\n${description}\n${translated}`.toLowerCase()
            });
        }
    }

    index = { lang, entries };
    return entries;
}

export function searchSettings(query: string) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];

    return getSettingEntries().filter(entry => words.every(word => entry.haystack.includes(word)));
}
