/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Settings } from "@api/Settings";
import type { CspRequestResult } from "@main/csp/manager";
import type { MemoryStats } from "@main/memoryTrim";
import type { UserThemeHeader } from "@main/themes";
import type { UpdateTrust } from "@main/updater/common";
import { BOOT_AND_SETTINGS_REQUEST, BOOT_REQUEST, type BootState } from "@shared/bootGuard";
import type { LocaleKind } from "@shared/externalLocales";
import { IpcEvents } from "@shared/IpcEvents";
import { RENDERER_FILE } from "@shared/pluginChunks";
import type { IpcRes } from "@utils/types";
import { ipcRenderer } from "electron/renderer";
import { join } from "path";

import PluginNativeMethods from "~pluginNativeMethods";

import { loadPluginChunks, readLocaleTable } from "./pluginChunkLoader";

export function invoke<T = any>(event: IpcEvents, ...args: any[]) {
    return ipcRenderer.invoke(event, ...args) as Promise<T>;
}

export function sendSync<T = any>(event: IpcEvents, ...args: any[]) {
    return ipcRenderer.sendSync(event, ...args) as T;
}

let primedSettings: Settings | undefined;
/** undefined until primed, and again once taken or when the main process didn't begin the start (an older one) */
let primedBoot: BootState | null | undefined;

/**
 * The preload reads the settings to pick which plugin code to run, and begins the start in the same call. The
 * renderer's first read of each gets that answer instead of asking again
 */
export function primeSettings() {
    if (primedSettings) return primedSettings;

    const reply = sendSync<{ bootState: BootState | null; settings: Settings; } | Settings>(IpcEvents.GET_SETTINGS, BOOT_AND_SETTINGS_REQUEST);
    if (reply && "bootState" in reply && "settings" in reply) {
        primedBoot = reply.bootState;
        return primedSettings = reply.settings;
    }
    return primedSettings = reply as Settings;
}

function takeSettings() {
    const settings = primedSettings;
    primedSettings = undefined;
    return settings ?? sendSync<Settings>(IpcEvents.GET_SETTINGS);
}

function beginBoot() {
    if (primedBoot !== undefined) {
        const state = primedBoot;
        primedBoot = undefined;
        return state;
    }
    return sendSync<{ bootState?: BootState; } | null>(IpcEvents.GET_SETTINGS, BOOT_REQUEST)?.bootState ?? null;
}

const PluginHelpers = {} as Record<string, Record<string, (...args: any[]) => Promise<any>>>;

// The channel names follow from the plugin and method names (src/main/ipcPlugins.ts), and the build lists the methods,
// so this needs no synchronous call to the main process while Discord is starting
for (const [plugin, methods] of Object.entries(PluginNativeMethods)) {
    const map = PluginHelpers[plugin] = {};
    for (const methodName of methods) {
        const channel = `EndcordPluginNative_${plugin}_${methodName}`;
        map[methodName] = (...args: any[]) => invoke(channel as IpcEvents, ...args);
    }
}

export default {
    themes: {
        uploadTheme: async (fileName: string, fileData: string): Promise<void> => {
            throw new Error("uploadTheme is WEB only");
        },
        deleteTheme: async (fileName: string): Promise<void> => {
            throw new Error("deleteTheme is WEB only");
        },
        getThemesList: () => invoke<Array<UserThemeHeader>>(IpcEvents.GET_THEMES_LIST),
        getThemeData: (fileName: string) => invoke<string | undefined>(IpcEvents.GET_THEME_DATA, fileName),
        getSystemValues: () => invoke<Record<string, string>>(IpcEvents.GET_THEME_SYSTEM_VALUES),

        openFolder: () => invoke<void>(IpcEvents.OPEN_THEMES_FOLDER),
    },

    updater: {
        getUpdates: () => invoke<IpcRes<Record<"hash" | "author" | "message", string>[]>>(IpcEvents.GET_UPDATES),
        update: () => invoke<IpcRes<boolean>>(IpcEvents.UPDATE),
        rebuild: () => invoke<IpcRes<boolean>>(IpcEvents.BUILD),
        confirmUpdate: () => invoke<boolean>(IpcEvents.CONFIRM_UPDATE),
        getTrust: () => invoke<UpdateTrust>(IpcEvents.GET_UPDATE_TRUST),
        takeRollbackNotice: () => invoke<{ hash: string; } | null>(IpcEvents.TAKE_ROLLBACK_NOTICE),
        getRepo: () => invoke<IpcRes<string>>(IpcEvents.GET_REPO),
    },

    boot: {
        // See GET_SETTINGS in @main/settings for why this asks the settings channel
        begin: beginBoot,
        confirm: (enabledPlugins: string[]) => invoke<void>(IpcEvents.BOOT_CONFIRM, enabledPlugins),
        reportCrash: (plugins: string[]) => invoke<void>(IpcEvents.BOOT_REPORT_CRASH, plugins),
        requestSafeMode: () => invoke<void>(IpcEvents.BOOT_REQUEST_SAFE_MODE),
    },

    pluginChunks: {
        /** Defines the code of plugins kept outside the renderer's script, read from renderer.js (see @shared/pluginChunks) */
        load: (ids: string[]) => loadPluginChunks(ids),
    },

    i18n: {
        /** One of the translation tables the desktop build keeps outside the script (see @shared/externalLocales), as JSON */
        readTable(lang: string, kind: LocaleKind): string | null {
            try {
                // Only the tables at the end are read, not the code before them
                return readLocaleTable(join(__dirname, RENDERER_FILE), lang, kind);
            } catch {
                return null;
            }
        }
    },

    settings: {
        get: takeSettings,
        set: (settings: Settings, pathToNotify?: string) => invoke<void>(IpcEvents.SET_SETTINGS, settings, pathToNotify),

        openFolder: () => invoke<void>(IpcEvents.OPEN_SETTINGS_FOLDER),
    },

    quickCss: {
        get: () => invoke<string>(IpcEvents.GET_QUICK_CSS),
        set: (css: string) => invoke<void>(IpcEvents.SET_QUICK_CSS, css),

        addChangeListener(cb: (newCss: string) => void) {
            ipcRenderer.on(IpcEvents.QUICK_CSS_UPDATE, (_, css) => cb(css));
        },

        addThemeChangeListener(cb: () => void) {
            ipcRenderer.on(IpcEvents.THEME_UPDATE, () => cb());
        },

        openFile: () => invoke<void>(IpcEvents.OPEN_QUICKCSS),
        openEditor: () => invoke<void>(IpcEvents.OPEN_MONACO_EDITOR),
        getEditorTheme: () => sendSync<string>(IpcEvents.GET_MONACO_THEME),
    },

    native: {
        getVersions: () => process.versions as Partial<NodeJS.ProcessVersions>,
        supportsWindowsMaterial: () => sendSync<boolean>(IpcEvents.SUPPORTS_WINDOWS_MATERIAL),
        openExternal: (url: string) => invoke<void>(IpcEvents.OPEN_EXTERNAL, url),
        getMemoryStats: () => invoke<MemoryStats>(IpcEvents.GET_MEMORY_STATS),
        trimMemory: () => invoke<number>(IpcEvents.TRIM_MEMORY),
        getRendererCss: () => invoke<string>(IpcEvents.GET_RENDERER_CSS),
        onRendererCssUpdate: (cb: (newCss: string) => void) => {
            if (!IS_DEV) return;

            ipcRenderer.on(IpcEvents.RENDERER_CSS_UPDATE, (_e, newCss: string) => cb(newCss));
        }
    },

    csp: {
        /**
         * Note: Only supports full explicit matches, not wildcards.
         *
         * If `*.example.com` is allowed, `isDomainAllowed("https://sub.example.com")` will return false.
         */
        isDomainAllowed: (url: string, directives: string[]) => invoke<boolean>(IpcEvents.CSP_IS_DOMAIN_ALLOWED, url, directives),
        removeOverride: (url: string) => invoke<boolean>(IpcEvents.CSP_REMOVE_OVERRIDE, url),
        requestAddOverride: (url: string, directives: string[], callerName: string) =>
            invoke<CspRequestResult>(IpcEvents.CSP_REQUEST_ADD_OVERRIDE, url, directives, callerName),
    },

    pluginHelpers: PluginHelpers,
};
