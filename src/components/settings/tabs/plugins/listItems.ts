/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { hasAnyVisibleSettings, plugins } from "@api/PluginManager";
import { Plugin } from "@utils/types";

import { getPluginFlag, getPluginListInfo } from "~plugins";

// The desktop build keeps the code of most plugins outside its script and runs it only when needed. Listing every
// plugin would load all of it, so the list shows plugins whose code isn't loaded from what the build read of their
// source instead, and only gets the real plugin to turn it on or off or open its settings.

const IS_LIST_ITEM = Symbol("Endcord.PluginListItem");

/** A plugin as the list shows it: the plugin itself if its code is loaded, else what was read of it when building */
export function listItem(name: string): Plugin {
    const info = getPluginListInfo(name);
    if (!info) return plugins[name];

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

/** The plugin behind a list item, loading its code if it isn't yet */
export const realPlugin = (plugin: Plugin) => IS_LIST_ITEM in plugin ? plugins[plugin.name] : plugin;

/** Whether the plugin's card shows the settings wheel rather than the info button */
export const hasSettingsToShow = (plugin: Plugin) => IS_LIST_ITEM in plugin ? !!plugin.settings : hasAnyVisibleSettings(plugin);
