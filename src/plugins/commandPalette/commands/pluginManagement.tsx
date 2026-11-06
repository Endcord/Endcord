/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled, pluginRequiresRestart, plugins, startDependenciesRecursive, startPlugin, stopPlugin } from "@api/PluginManager";
import { isProfileActive } from "@api/PluginProfiles";
import { Settings } from "@api/Settings";
import { listItem, realPlugin } from "@components/settings/tabs/plugins/listItems";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { openSwitchProfileModal, promptRestart } from "@components/settings/tabs/plugins/Profiles";
import { searchSettings } from "@components/settings/tabs/plugins/settingsIndex";
import type { PaletteCommand, PaletteListItem } from "@plugins/commandPalette/api/types";
import { GearIcon, PlugIcon, SearchIcon } from "@plugins/commandPalette/ui/icons";
import type { Plugin } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

function togglePlugin(plugin: Plugin) {
    const wasEnabled = isPluginEnabled(plugin.name);
    const pluginSettings = Settings.plugins[plugin.name];

    if (!wasEnabled) {
        const { restartNeeded, failures } = startDependenciesRecursive(plugin);
        if (failures.length) {
            showToast(`Failed to start dependencies: ${failures.join(", ")}`, Toasts.Type.FAILURE);
            return;
        }
        if (restartNeeded) {
            pluginSettings.enabled = true;
            showToast(`${plugin.name} enabled. Restart to apply.`, Toasts.Type.MESSAGE);
            return;
        }
    }

    if (pluginRequiresRestart(plugin)) {
        pluginSettings.enabled = !wasEnabled;
        showToast(`${plugin.name} ${wasEnabled ? "disabled" : "enabled"}. Restart to apply.`, Toasts.Type.MESSAGE);
        return;
    }

    if (wasEnabled && !plugin.started) {
        pluginSettings.enabled = false;
        showToast(`${plugin.name} disabled.`, Toasts.Type.SUCCESS);
        return;
    }

    const result = wasEnabled ? stopPlugin(plugin) : startPlugin(plugin);
    if (!result) {
        pluginSettings.enabled = false;
        showToast(`Error while ${wasEnabled ? "stopping" : "starting"} ${plugin.name}.`, Toasts.Type.FAILURE);
        return;
    }

    pluginSettings.enabled = !wasEnabled;
    showToast(`${plugin.name} ${wasEnabled ? "disabled" : "enabled"}.`, Toasts.Type.SUCCESS);
}

function pluginItems(): PaletteListItem[] {
    // Listed without loading the code of every plugin (see listItems); choosing one loads it
    return Object.keys(plugins).map(listItem)
        .filter(plugin => !plugin.required && !plugin.hidden)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(plugin => {
            const enabled = isPluginEnabled(plugin.name);
            return {
                id: plugin.name,
                label: plugin.name,
                sublabel: enabled ? "Enabled" : "Disabled",
                icon: PlugIcon,
                actions: [
                    {
                        id: "toggle",
                        label: enabled ? "Disable Plugin" : "Enable Plugin",
                        keepOpen: true,
                        run: () => togglePlugin(realPlugin(plugin))
                    },
                    {
                        id: "settings",
                        label: "Open Plugin Settings",
                        icon: GearIcon,
                        run: () => openPluginModal(realPlugin(plugin))
                    }
                ]
            };
        });
}

function settingItems(query: string): PaletteListItem[] {
    return searchSettings(query).slice(0, 60).map(({ plugin, key, title, description }) => ({
        id: `${plugin.name}.${key}`,
        label: title,
        sublabel: description ? `${plugin.name} · ${description}` : plugin.name,
        icon: GearIcon,
        actions: [{
            id: "open",
            label: "Open Setting",
            run: () => openPluginModal(plugin, undefined, key)
        }]
    }));
}

function profileItems(): PaletteListItem[] {
    return Settings.pluginProfiles.map(profile => ({
        id: profile.id,
        label: profile.name,
        sublabel: isProfileActive(profile) ? "On now" : `${profile.plugins.length} plugins`,
        icon: PlugIcon,
        actions: [{
            id: "switch",
            label: "Switch to Profile",
            run: () => openSwitchProfileModal(profile, promptRestart)
        }]
    }));
}

export const pluginCommands: PaletteCommand[] = [
    {
        id: "plugins.searchSettings",
        title: "Search Plugin Settings",
        section: "Plugins",
        keywords: ["settings", "options", "find", "search", "setting"],
        icon: SearchIcon,
        page: () => ({
            title: "Search Plugin Settings",
            icon: SearchIcon,
            spec: { type: "list", placeholder: "Type a setting, like volume or color...", items: settingItems }
        })
    },
    {
        id: "plugins.profiles",
        title: "Switch Plugin Profile",
        section: "Plugins",
        keywords: ["profile", "profiles", "switch", "preset", "gaming", "work"],
        icon: PlugIcon,
        predicate: () => Settings.pluginProfiles.length > 0,
        page: () => ({
            title: "Switch Plugin Profile",
            icon: PlugIcon,
            spec: { type: "list", placeholder: "Search profiles...", items: profileItems }
        })
    },
    {
        id: "plugins.manage",
        title: "Manage Plugins",
        section: "Plugins",
        keywords: ["plugins", "enable", "disable", "toggle"],
        icon: PlugIcon,
        page: () => ({
            title: "Manage Plugins",
            icon: PlugIcon,
            spec: { type: "list", placeholder: "Search plugins...", items: pluginItems }
        })
    }
];
