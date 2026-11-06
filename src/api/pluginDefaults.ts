/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// A settings file records every plugin as on or off, so turning a plugin on by default never reaches anyone who already
// has one. These get turned on once instead, which leaves them off for good if the person turns them off afterwards.
// Add a plugin here and bump the version whenever an existing plugin becomes on by default.
const DEFAULTS_VERSION = 1;
const NOW_ON_BY_DEFAULT = ["EndcordToolbox", "ThemeLibrary"];

interface StoredSettings {
    pluginDefaultsVersion: number;
    plugins: Record<string, { enabled: boolean; }>;
}

export function applyNewPluginDefaults(settings: StoredSettings) {
    if (settings.pluginDefaultsVersion >= DEFAULTS_VERSION) return;

    for (const name of NOW_ON_BY_DEFAULT) settings.plugins[name].enabled = true;

    settings.pluginDefaultsVersion = DEFAULTS_VERSION;
}
