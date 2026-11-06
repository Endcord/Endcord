/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PlainSettings } from "@api/Settings";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import { Plugin, PluginSettingDefCommon } from "@utils/types";
import { chooseFile, saveFile } from "@utils/web";
import { moment, Toasts } from "@webpack/common";

import Plugins, { getPluginListInfo } from "~plugins";

const toast = (type: string, message: string) =>
    Toasts.show({
        type,
        message,
        id: Toasts.genId()
    });

const toastSuccess = () =>
    toast(Toasts.Type.SUCCESS, t("Settings successfully imported. Restart to apply changes!"));

const toastFailure = (err: any) =>
    toast(Toasts.Type.FAILURE, t("Couldn't import those settings :( {error}", { error: String(err) }));

const logger = new Logger("SettingsSync:Offline", "#39b7e0");

function isSafeObject(obj: any) {
    if (obj == null || typeof obj !== "object") return true;

    for (const key in obj) {
        if (["__proto__", "constructor", "prototype"].includes(key)) {
            return false;
        }
        if (!isSafeObject(obj[key])) {
            return false;
        }
    }

    return true;
}

function getSensitiveKeys(plugin: Plugin) {
    return Object.entries(plugin.settings?.def ?? {})
        .filter(([, setting]) => (setting as PluginSettingDefCommon).sensitive)
        .map(([key]) => key);
}

/**
 * A plugin's sensitive settings. For a lazy plugin whose code isn't loaded they come from what the build read from
 * its source, so a backup doesn't load the code of every plugin there is (that took a third of a second)
 */
function sensitiveKeysOf(name: string) {
    const known = getPluginListInfo(name);
    if (known && !known.k?.includes("*")) return known.k ?? [];
    return getSensitiveKeys(Plugins[name]);
}

// Whoever controls an import must not get to redirect this device's keys, choose who can act for the user, stop
// its updates or load a browser extension into Discord. A backup file may fill in a plugin that has nothing
// configured here; the cloud never touches these
function keepLocalSettings(imported: any, source: "file" | "cloud") {
    for (const pluginName of Object.keys(Plugins)) {
        const keys = sensitiveKeysOf(pluginName);
        if (!keys.length) continue;
        const plugin = Plugins[pluginName];
        const local = PlainSettings.plugins[pluginName] ?? {};
        const isConfigured = keys.some(key => local[key] && local[key] !== (plugin.settings!.def[key] as { default?: unknown; }).default);
        if (source === "file" && !isConfigured) continue;

        for (const key of keys) {
            if (key in local) ((imported.plugins ??= {})[pluginName] ??= {})[key] = local[key];
            else delete imported.plugins?.[pluginName]?.[key];
        }
    }

    for (const key of ["cloud", "autoUpdate", "autoUpdateNotification", "enableReactDevtools"]) imported[key] = PlainSettings[key];
}

export async function importSettings(data: string, source: "file" | "cloud" = "file") {
    try {
        var parsed = JSON.parse(data);
    } catch (err) {
        throw new Error(`Failed to parse JSON: ${String(err)}`);
    }

    if (!isSafeObject(parsed))
        throw new Error("Unsafe Settings");

    if ("settings" in parsed && "quickCss" in parsed) {
        keepLocalSettings(parsed.settings, source);
        Object.assign(PlainSettings, parsed.settings);
        await EndcordNative.settings.set(parsed.settings);
        await EndcordNative.quickCss.set(parsed.quickCss);
    } else
        throw new Error("Invalid Settings. Is this even a Endcord Settings file?");
}

export async function exportSettings({ minify }: { minify?: boolean; } = {}) {
    const settings = structuredClone(EndcordNative.settings.get());
    // Backups get shared for support and cloud sync leaves the device
    for (const pluginName of Object.keys(Plugins)) {
        for (const key of sensitiveKeysOf(pluginName)) delete settings.plugins[pluginName]?.[key];
    }

    const quickCss = await EndcordNative.quickCss.get();
    return JSON.stringify({ settings, quickCss }, null, minify ? undefined : 4);
}

export async function downloadSettingsBackup() {
    const filename = `endcord-settings-backup-${moment().format("YYYY-MM-DD")}.json`;
    const backup = await exportSettings();
    const data = new TextEncoder().encode(backup);

    if (IS_DISCORD_DESKTOP) {
        DiscordNative.fileManager.saveWithDialog(data, filename);
    } else {
        saveFile(new File([data], filename, { type: "application/json" }));
    }
}

export async function uploadSettingsBackup(showToast = true): Promise<void> {
    if (IS_DISCORD_DESKTOP) {
        const [file] = await DiscordNative.fileManager.openFiles({
            filters: [
                { name: t("Endcord Settings Backup"), extensions: ["json"] },
                { name: "all", extensions: ["*"] }
            ]
        });

        if (file) {
            try {
                await importSettings(new TextDecoder().decode(file.data));
                if (showToast) toastSuccess();
            } catch (err) {
                logger.error(err);
                if (showToast) toastFailure(err);
            }
        }
    } else {
        const file = await chooseFile("application/json");
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                await importSettings(reader.result as string);
                if (showToast) toastSuccess();
            } catch (err) {
                logger.error(err);
                if (showToast) toastFailure(err);
            }
        };
        reader.readAsText(file);
    }
}
