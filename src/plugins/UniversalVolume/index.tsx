/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { SelectedChannelStore, UserStore, VoiceStateStore } from "@webpack/common";

const VoiceVolume: { setLocalVolume(userId: string, volume: number): void; } = findByPropsLazy("setLocalVolume", "toggleLocalMute");

const logger = new Logger("UniversalVolume");

const settings = definePluginSettings({
    targetVolume: {
        type: OptionType.SLIDER,
        description: "The volume everyone in your voice channel is set to.",
        markers: [0, 25, 50, 75, 100, 150, 200],
        default: 100,
        stickToMarkers: false,
        onChange: () => relevelAll()
    }
});

let currentChannel: string | null = null;
const leveled = new Set<string>();

function applyToUser(userId: string) {
    const me = UserStore.getCurrentUser();
    if (!me || userId === me.id) return;
    try {
        VoiceVolume.setLocalVolume(userId, settings.store.targetVolume);
    } catch (e) {
        logger.error("setLocalVolume failed", e);
    }
}

function levelChannel() {
    const channelId = SelectedChannelStore.getVoiceChannelId() ?? null;
    if (channelId !== currentChannel) {
        leveled.clear();
        currentChannel = channelId;
    }
    if (!channelId) return;

    const states = VoiceStateStore.getVoiceStatesForChannel(channelId) as Record<string, { userId: string; }> | null;
    if (!states) return;

    const meId = UserStore.getCurrentUser()?.id;
    for (const userId of Object.keys(states)) {
        if (userId === meId || leveled.has(userId)) continue;
        applyToUser(userId);
        leveled.add(userId);
    }
}

function relevelAll() {
    leveled.clear();
    levelChannel();
}

export default definePlugin({
    name: "UniversalVolume",
    description: "Sets everyone in your voice channel to the same volume, and keeps new people who join at that level too.",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    tags: ["Utility", "Voice"],
    settings,

    flux: {
        VOICE_STATE_UPDATES() {
            levelChannel();
        }
    },

    start() {
        levelChannel();
    },

    stop() {
        leveled.clear();
        currentChannel = null;
    }
});
