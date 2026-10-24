/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Settings } from "@api/Settings";
import { IpcEvents } from "@shared/IpcEvents";
import { SettingsStore } from "@shared/SettingsStore";
import { mergeDefaults } from "@utils/mergeDefaults";
import { ipcMain } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { DATA_DIR, NATIVE_SETTINGS_FILE, SETTINGS_DIR, SETTINGS_FILE } from "./utils/constants";

mkdirSync(SETTINGS_DIR, { recursive: true });

function readSettings<T = object>(name: string, file: string): Partial<T> {
    try {
        return JSON.parse(readFileSync(file, "utf-8"));
    } catch (err: any) {
        if (err?.code !== "ENOENT")
            console.error(`Failed to read ${name} settings`, err);

        return {};
    }
}

const initialRendererSettings = readSettings<Settings>("renderer", SETTINGS_FILE);
try {
    if (!initialRendererSettings.language) {
        const installerStateFile = join(DATA_DIR, "installer-state.json");
        try {
            const installerState = JSON.parse(readFileSync(installerStateFile, "utf-8"));
            if (installerState?.language && typeof installerState.language === "string") {
                const lang = installerState.language.toLowerCase().trim();
                if (["en", "tr", "ru", "es", "fr"].includes(lang)) {
                    initialRendererSettings.language = lang as Settings["language"];
                }
            }
        } catch { }
    }
    if (!initialRendererSettings.language) {
        const prefsIniFile = join(DATA_DIR, "installer", "prefs.ini");
        try {
            const iniText = readFileSync(prefsIniFile, "utf-8");
            const match = iniText.match(/^\s*language\s*=\s*([a-zA-Z-]+)/m);
            if (match?.[1]) {
                const lang = match[1].toLowerCase().trim().slice(0, 2);
                if (["en", "tr", "ru", "es", "fr"].includes(lang)) {
                    initialRendererSettings.language = lang as Settings["language"];
                }
            }
        } catch { }
    }
} catch { }

export const RendererSettings = new SettingsStore(initialRendererSettings);

RendererSettings.addGlobalChangeListener(() => {
    try {
        writeFileSync(SETTINGS_FILE, JSON.stringify(RendererSettings.plain, null, 4));
    } catch (e) {
        console.error("Failed to write renderer settings", e);
    }
});

ipcMain.on(IpcEvents.GET_SETTINGS, e => e.returnValue = RendererSettings.plain);

ipcMain.handle(IpcEvents.SET_SETTINGS, (_, data: Settings, pathToNotify?: string) => {
    RendererSettings.setData(data, pathToNotify);
});

export interface NativeSettings {
    plugins: {
        [plugin: string]: {
            [setting: string]: any;
        };
    };
    customCspRules: Record<string, string[]>;
}

const DefaultNativeSettings: NativeSettings = {
    plugins: {},
    customCspRules: {}
};

const nativeSettings = readSettings<NativeSettings>("native", NATIVE_SETTINGS_FILE);
mergeDefaults(nativeSettings, DefaultNativeSettings);

export const NativeSettings = new SettingsStore(nativeSettings as NativeSettings);

NativeSettings.addGlobalChangeListener(() => {
    try {
        writeFileSync(NATIVE_SETTINGS_FILE, JSON.stringify(NativeSettings.plain, null, 4));
    } catch (e) {
        console.error("Failed to write native settings", e);
    }
});
