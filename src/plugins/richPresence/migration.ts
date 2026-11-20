/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { migratePluginSettings, PlainSettings, Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";

import { settings, SettingsStore } from "./settings";

type SettingsKey = keyof SettingsStore;

const logger = new Logger("RichPresence:Migration");

interface MigrationMapping {
    oldPlugin: string;
    enableKey: SettingsKey;
    keys: Record<string, SettingsKey>;
}

const migrations: MigrationMapping[] = [
    {
        oldPlugin: "AudioBookShelfRichPresence",
        enableKey: "abs_enabled",
        keys: {
            serverUrl: "abs_serverUrl",
            username: "abs_username",
            password: "abs_password",
        },
    },
    {
        oldPlugin: "StatsfmPresence",
        enableKey: "sfm_enabled",
        keys: {
            username: "sfm_username",
            shareUsername: "sfm_shareUsername",
            shareSong: "sfm_shareSong",
            hideWithSpotify: "sfm_hideWithSpotify",
            hideWithExternalRPC: "sfm_hideWithExternalRPC",
            statusName: "sfm_statusName",
            nameFormat: "sfm_nameFormat",
            useListeningStatus: "sfm_useListeningStatus",
            missingArt: "sfm_missingArt",
            showStatsFmLogo: "sfm_showLogo",
            alwaysHideArt: "sfm_alwaysHideArt",
        },
    },
    {
        oldPlugin: "JellyfinRichPresence",
        enableKey: "jf_enabled",
        keys: {
            serverUrl: "jf_serverUrl",
            apiKey: "jf_apiKey",
            userId: "jf_userId",
            nameDisplay: "jf_nameDisplay",
            customName: "jf_customName",
            coverType: "jf_coverType",
            episodeFormat: "jf_episodeFormat",
            showEpisodeName: "jf_showEpisodeName",
            overrideRichPresenceType: "jf_overrideType",
            showPausedState: "jf_showPausedState",
            privacyMode: "jf_privacyMode",
        },
    },
    {
        oldPlugin: "GensokyoRadioRPC",
        enableKey: "gr_enabled",
        keys: {
            refreshInterval: "gr_refreshInterval",
        },
    },
];

function setStoreValue(key: SettingsKey, value: boolean | string | number) {
    (settings.store[key] as boolean | string | number) = value;
}

export function migrateOldSettings() {
    if (Settings.plugins.RichPresence._migrated) return;

    migratePluginSettings("RichPresence", "AudioBookShelfRichPresence", "GensokyoRadioRPC", "JellyfinRichPresence", "StatsfmPresence", "TosuRPC");

    for (const migration of migrations) {
        const oldSettings = Settings.plugins[migration.oldPlugin];
        if (!oldSettings) continue;

        if (oldSettings.enabled) {
            setStoreValue(migration.enableKey, true);
        }

        // An imported settings file can bring an old entry back (and drop _migrated). Its server and key must not
        // replace the ones this device already has, or the local key would go to the file's server
        const isSensitive = (key: SettingsKey) => (settings.def[key] as { sensitive?: boolean; }).sensitive;
        const keepLocal = Object.values(migration.keys).some(key => isSensitive(key) && settings.store[key]);

        // With a local server and key, the whole group stays local: a user name or id from the file paired with the
        // local server would still point this device's key at someone else's data
        for (const [oldKey, newKey] of Object.entries(migration.keys)) {
            if (keepLocal) break;
            if (oldSettings[oldKey] != null) {
                setStoreValue(newKey, oldSettings[oldKey]);
            }
        }

        logger.info(`Migrated settings from ${migration.oldPlugin}`);
    }

    const tosuSettings = Settings.plugins.TosuRPC;
    if (tosuSettings?.enabled) {
        setStoreValue("tosu_enabled", true);
    }

    // The old entries hold passwords and API keys that backups would otherwise keep carrying (exports only strip
    // the secrets of plugins that still exist)
    for (const name of [...migrations.map(m => m.oldPlugin), "TosuRPC"]) delete PlainSettings.plugins[name];
    Settings.plugins.RichPresence._migrated = true;
}
