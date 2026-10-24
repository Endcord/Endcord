/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";

import plugins, { isPluginLoaded } from "~plugins";

export type KnownPluginSettingsMap = Map<string, Set<string>>;

export const KNOWN_PLUGINS_LEGACY_DATA_KEY = "NewPluginsManager_KnownPlugins";
export const KNOWN_SETTINGS_DATA_KEY = "NewPluginsManager_KnownSettings";

// Reading plugins[name] evaluates a lazy plugin's module, so only plugins that are already loaded (the
// enabled ones) have their settings inspected. Unloaded plugins are tracked by name; their settings are
// recorded quietly the first time they load instead of being reported as new.
const UNINSPECTED = "\0uninspected";

function getSettingsSetForPlugin(plugin: string): Set<string> | null {
    if (!isPluginLoaded(plugin)) return null;
    const settings = plugins[plugin]?.settings?.def || {};
    return new Set(Object.keys(settings).filter(setting => setting !== "enabled"));
}

function getCurrentSettings(pluginList: string[]): Map<string, Set<string> | null> {
    return new Map(pluginList.map(name => [name, getSettingsSetForPlugin(name)]));
}

const toStored = (map: Map<string, Set<string> | null>) =>
    [...map.entries()].map(([plugin, settings]) => [plugin, settings ? [...settings] : [UNINSPECTED]]);

export async function getKnownSettings(): Promise<Map<string, Set<string>>> {
    const raw = await DataStore.get(KNOWN_SETTINGS_DATA_KEY);
    let map: Map<string, Set<string>>;

    if (!raw) {
        const knownPlugins = await DataStore.get(KNOWN_PLUGINS_LEGACY_DATA_KEY) ?? [] as string[];
        const current = getCurrentSettings([...Object.keys(plugins), ...knownPlugins]);
        await DataStore.set(KNOWN_SETTINGS_DATA_KEY, toStored(current));
        map = new Map([...current].map(([plugin, settings]) => [plugin, settings ?? new Set([UNINSPECTED])]));
    } else {
        map = raw instanceof Map
            ? raw
            : new Map(raw.map(([plugin, settings]: [string, string[]]) => [plugin, new Set(settings)]));
    }

    return map;
}

export async function getNewSettings(): Promise<KnownPluginSettingsMap> {
    const knownSettings = await getKnownSettings();
    const map: KnownPluginSettingsMap = new Map();
    for (const [plugin, settings] of getCurrentSettings(Object.keys(plugins))) {
        const known = knownSettings.get(plugin);
        // Not loaded now, or never inspected before: nothing to compare against
        if (!settings || !known || known.has(UNINSPECTED)) continue;
        const added = [...settings].filter(setting => !known.has(setting));
        if (added.length) map.set(plugin, new Set(added));
    }
    return map;
}

export async function getKnownPlugins(): Promise<Set<string>> {
    const knownSettings = await getKnownSettings();
    return new Set(knownSettings.keys());
}

export async function getNewPlugins(): Promise<Set<string>> {
    const currentPlugins = Object.keys(plugins);
    const knownPlugins = await getKnownPlugins();
    return new Set(currentPlugins.filter(p => !knownPlugins.has(p)));
}

export async function writeKnownSettings() {
    const currentSettings = getCurrentSettings(Object.keys(plugins));
    const knownSettings = await getKnownSettings();
    const allSettings = new Map<string, Set<string>>();
    new Set([...currentSettings.keys(), ...knownSettings.keys()]).forEach(plugin => {
        const current = currentSettings.get(plugin);
        const known = knownSettings.get(plugin);
        if (!current) {
            allSettings.set(plugin, known ?? new Set([UNINSPECTED]));
            return;
        }
        const merged = new Set([...current, ...(known ?? [])]);
        merged.delete(UNINSPECTED);
        allSettings.set(plugin, merged);
    });
    await DataStore.set(KNOWN_SETTINGS_DATA_KEY, allSettings);
}

export async function debugWipeSomeData() {
    const settings = await getKnownSettings();
    settings.forEach((value, key) => {
        if (Math.random() > 0.8) {
            if (Math.random() > 0.5) return settings.set(key, new Set([...value].filter(() => Math.random() > 0.5)));
            return settings.delete(key);
        }
    });
    await DataStore.set(KNOWN_SETTINGS_DATA_KEY, settings);
}

export async function editRawData(patcher: (data: KnownPluginSettingsMap) => (Promise<any> | any)) {
    if (!patcher) return;
    const map = await DataStore.get(KNOWN_SETTINGS_DATA_KEY) as KnownPluginSettingsMap;
    const newMap = new Map(map);
    await patcher(newMap);
    await DataStore.set(KNOWN_SETTINGS_DATA_KEY, newMap ?? map);
}
