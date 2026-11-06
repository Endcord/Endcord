/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Settings } from "@api/Settings";
import { BOOT_AND_SETTINGS_REQUEST, BOOT_REQUEST } from "@shared/bootGuard";
import { IpcEvents } from "@shared/IpcEvents";
import { SettingsStore } from "@shared/SettingsStore";
import { mergeDefaults } from "@utils/mergeDefaults";
import { ipcMain } from "electron";
import { mkdirSync, readFileSync } from "fs";
import { join } from "path";

import { beginBootFor } from "./bootGuard";
import { DATA_DIR, NATIVE_SETTINGS_FILE, SETTINGS_DIR, SETTINGS_FILE } from "./utils/constants";
import { readJsonDurably, writeFileDurably } from "./utils/durableFile";
import { handleIpc, isTrustedSender } from "./utils/ipc";

mkdirSync(SETTINGS_DIR, { recursive: true });

function readSettings<T = object>(name: string, file: string): Partial<T> {
    try {
        return readJsonDurably<Partial<T>>(file) ?? {};
    } catch (err) {
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
        writeFileDurably(SETTINGS_FILE, JSON.stringify(RendererSettings.plain, null, 4));
    } catch (e) {
        console.error("Failed to write renderer settings", e);
    }
});

ipcMain.on(IpcEvents.GET_SETTINGS, (e, request?: unknown) => {
    if (!isTrustedSender(e, IpcEvents.GET_SETTINGS)) {
        e.returnValue = null;
        return;
    }

    // The start record rides on this channel because the page needs it synchronously, and a synchronous call on a
    // channel nobody listens to hangs the page. A new renderer can be loaded by a main process from before it,
    // after an update and a reload, and that one answers this with plain settings, which reads as a normal start
    e.returnValue = request === BOOT_REQUEST ? { bootState: beginBootFor(e) }
        : request === BOOT_AND_SETTINGS_REQUEST ? { bootState: beginBootFor(e), settings: RendererSettings.plain }
            : RendererSettings.plain;
});

handleIpc(IpcEvents.SET_SETTINGS, (_, data: Settings, pathToNotify?: string) => {
    // This replaces the whole store and goes straight to disk
    if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid settings");

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
        writeFileDurably(NATIVE_SETTINGS_FILE, JSON.stringify(NativeSettings.plain, null, 4));
    } catch (e) {
        console.error("Failed to write native settings", e);
    }
});
