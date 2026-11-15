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

// Guilds we're resetting right now. Our own PATCH fires GUILD_MEMBER_UPDATE as well, this keeps it from
// sending a second one
const resettingGuilds = new Set<string>();

async function resetNick(guildId: string, forcedNick: string, currentUserId: string) {
    if (resettingGuilds.has(guildId)) return;
    resettingGuilds.add(guildId);

    try {
        // The server profile endpoint first, which needs no permission. It's what Discord's own
        // "Reset Nickname" button calls
        try {
            await RestAPI.patch({
                url: `/users/@me/guilds/${guildId}/profile`,
                body: { nick: null }
            });

            if (settings.store.showToast) {
                showToast({ text: `AntiNickname: nickname "${forcedNick}" removed`, variant: "success" });
            }
            return;
        } catch (e1: any) {
            // Fails on servers without server profiles
        }

        // Then a PATCH on the member, which needs the Change Nickname permission
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

            // Someone set a nickname on us, reset it
            setTimeout(() => resetNick(guildId, nick, currentUser.id), 300);
        }
    },

    start() {},
    stop() {
        resettingGuilds.clear();
    }
});
