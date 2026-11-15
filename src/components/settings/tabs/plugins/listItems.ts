/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { hasAnyVisibleSettings, plugins } from "@api/PluginManager";
import { t } from "@utils/i18n";
import { Plugin } from "@utils/types";

import { getPluginFlag, getPluginListInfo } from "~plugins";

// On desktop most plugin code lives outside the main script and only runs when needed. Rendering the list shouldn't
// load all of it, so plugins that aren't loaded are listed from the metadata the build extracted, and the real
// plugin is only loaded to toggle it or open its settings.

const IS_LIST_ITEM = Symbol("Endcord.PluginListItem");

/** The loaded plugin, or its build-time metadata if its code isn't loaded */
export function listItem(name: string): Plugin {
    const info = getPluginListInfo(name);
    if (!info) {
        try {
            return plugins[name];
        } catch (e) {
            if (!(e as { needsRestart?: boolean; } | null)?.needsRestart) throw e;
            // Its code is gone with a renderer.js replaced while Discord runs. Listed with that instead of breaking
            // the list; switching it on asks for the restart (see PluginCard)
            return {
                name,
                description: t("Endcord was updated. Restart Discord to load {name}.", { name }),
                hidden: false,
                required: !!getPluginFlag(name, "required"),
                [IS_LIST_ITEM]: true
            } as unknown as Plugin;
        }
    }

    return {
        name,
        description: info.d,
        tags: info.t,
        searchTerms: info.q,
        dependencies: info.p,
        hidden: !!info.h,
        required: !!getPluginFlag(name, "required"),
        // Only read as "has settings" by isListedPlugin; hasSettingsToShow answers the rest
        settings: info.s ? {} : undefined,
        [IS_LIST_ITEM]: true
    } as unknown as Plugin;
}

/** Resolves a list item to the real plugin, loading its code if needed */
export const realPlugin = (plugin: Plugin) => IS_LIST_ITEM in plugin ? plugins[plugin.name] : plugin;

/** Whether the plugin's card shows the settings wheel rather than the info button */
export const hasSettingsToShow = (plugin: Plugin) => IS_LIST_ITEM in plugin ? !!plugin.settings : hasAnyVisibleSettings(plugin);
