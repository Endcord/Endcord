/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { RestAPI, showToast,UserStore } from "@webpack/common";

const settings = definePluginSettings({
    showToast: {
        type: OptionType.BOOLEAN,
        description: "Show a notification when a forced nickname is removed",
        default: true,
    }
});

// Anti-loop: track guilds we're currently resetting to avoid infinite loops
// (our own PATCH will trigger GUILD_MEMBER_UPDATE with nick null, which is fine, but we avoid duplicates)
const resettingGuilds = new Set<string>();

async function resetNick(guildId: string, forcedNick: string, currentUserId: string) {
    if (resettingGuilds.has(guildId)) return;
    resettingGuilds.add(guildId);

    try {
        // Method 1: "Edit Server Profile" endpoint (no permission required)
        // This is exactly what Discord calls when you click "Reset Nickname" in settings
        try {
            await RestAPI.patch({
                url: `/users/@me/guilds/${guildId}/profile`,
                body: { nick: null }
            });

            if (settings.store.showToast) {
                showToast({ text: `AntiNickname: nickname "${forcedNick}" removed`, variant: "success" });
            }
            return; // success, no need for fallback
        } catch (e1: any) {
            // If it fails (e.g. server without server profiles), try method 2
        }

        // Method 2: direct PATCH on the member (works if you have "Change Nickname" permission)
        await RestAPI.patch({
            url: `/guilds/${guildId}/members/@me`,
            body: { nick: "" }
        });

        if (settings.store.showToast) {
            showToast({ text: `AntiNickname: nickname "${forcedNick}" removed`, variant: "success" });
        }
    } catch (err: any) {
        console.warn(`[AntiNickname] Failed to reset nickname on ${guildId}:`, err);
        if (settings.store.showToast) {
            showToast({ text: `AntiNickname: failed to reset nickname (${err?.status ?? "?"})`, variant: "critical" });
        }
    } finally {
        // Release the lock after 2s to allow a future reset if re-nicknamed
        setTimeout(() => resettingGuilds.delete(guildId), 2000);
    }
}

export default definePlugin({
    name: "AntiNickname",
    description: "Automatically resets any nickname forcefully assigned to you in a server. Works even without admin permissions.",
    authors: [Devs.vpg],
    enabledByDefault: false,
    settings,

    flux: {
        GUILD_MEMBER_UPDATE({ guildId, user, nick }: {
            guildId: string;
            user: { id: string; };
            nick: string | null;
        }) {
            const currentUser = UserStore.getCurrentUser();
            if (!currentUser || user.id !== currentUser.id) return;

            // nick null or empty = already reset (by us or the admin), nothing to do
            if (!nick) return;

            // Someone forced a nick on us — reset immediately
            setTimeout(() => resetNick(guildId, nick, currentUser.id), 300);
        }
    },

    start() {},
    stop() {
        resettingGuilds.clear();
    }
});
