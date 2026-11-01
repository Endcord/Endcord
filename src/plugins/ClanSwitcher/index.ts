/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, migratePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { RestAPI } from "@webpack/common";

// Switching every few seconds is what automation looks like to Discord
const MIN_INTERVAL_SECONDS = 30;

const settings = definePluginSettings({
    clans: {
        type: OptionType.STRING,
        default: "",
        description: "Clan IDs (comma-separated)"
    },
    intervalSeconds: {
        type: OptionType.NUMBER,
        default: 60,
        description: "Interval between clan join attempts (in seconds)"
    }
});

let loop: ReturnType<typeof setInterval> | null = null;

migratePluginSettings("ClanSwitcher", "Clan Switcher");
export default definePlugin({
    name: "ClanSwitcher",
    description: "Automatically switches your Discord server tag",
    tags: ["Servers", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,

    start() {
        const clanList = settings.store.clans
            .split(",")
            .map(c => c.trim())
            .filter(Boolean);

        const interval = Math.max(MIN_INTERVAL_SECONDS, settings.store.intervalSeconds || 60) * 1000;

        if (clanList.length === 0) {
            console.warn("[Clan Switcher] Clans not configured.");
            return;
        }

        let index = 0;

        loop = setInterval(() => {
            const clanId = clanList[index % clanList.length];
            index++;

            RestAPI.put({
                url: "/users/@me/clan",
                body: {
                    identity_enabled: true,
                    identity_guild_id: clanId
                }
            }).catch(err => console.error("[Clan Switcher] Error:", err));
        }, interval);
    },

    stop() {
        if (loop) {
            clearInterval(loop);
            loop = null;
            console.debug("[Clan Switcher] Stopped.");
        }
    }
});
