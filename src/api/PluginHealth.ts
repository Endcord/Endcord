/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { isPluginEnabled } from "@api/PluginManager";
import { t } from "@utils/i18n";
import { SettingsRouter } from "@webpack/common";
import { patchProblems } from "@webpack/patcher";

const NOTIFIED_KEY = "Endcord_notifiedBrokenPlugins";
// Most of Discord's code has loaded by then, and with it most of what plugins change
const CHECK_AFTER = 30_000;

/** How many of a plugin's changes to Discord found their spot but didn't apply, so far this session */
export const getPatchProblemCount = (name: string) => patchProblems.get(name)?.size ?? 0;

/** Plugins that are on and partly not working on this version of Discord */
export function getBrokenPlugins() {
    return [...patchProblems.keys()].filter(name => isPluginEnabled(name)).sort();
}

/** Once per new set of broken plugins, usually right after Discord updates, so it's news and not a nag */
export function watchPluginHealth() {
    setTimeout(async () => {
        const broken = getBrokenPlugins();
        if (!broken.length) return;

        const key = broken.join(",");
        if (await DataStore.get(NOTIFIED_KEY) === key) return;
        await DataStore.set(NOTIFIED_KEY, key);

        showNotification({
            title: broken.length === 1
                ? t("{name} needs a fix for this Discord version", { name: broken[0] })
                : t("{count} plugins need a fix for this Discord version", { count: broken.length }),
            body: t("Discord changed code they rely on, so part of what they do may not work until Endcord updates them. Click to see which."),
            noPersist: true,
            onClick: () => SettingsRouter.openUserSettings("endcord_diagnostics_panel")
        });
    }, CHECK_AFTER);
}
