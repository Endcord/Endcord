/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { ChannelStore } from "@webpack/common";

const SMALL_CAPS: Record<string, string> = {
    "ᴀ": "a", "ʙ": "b", "ᴄ": "c", "ᴅ": "d", "ᴇ": "e", "ꜰ": "f", "ɢ": "g", "ʜ": "h", "ɪ": "i", "ᴊ": "j",
    "ᴋ": "k", "ʟ": "l", "ᴍ": "m", "ɴ": "n", "ᴏ": "o", "ᴘ": "p", "ǫ": "q", "ʀ": "r", "ꜱ": "s", "ᴛ": "t",
    "ᴜ": "u", "ᴠ": "v", "ᴡ": "w", "x": "x", "ʏ": "y", "ᴢ": "z",
};

const ORIGINAL_NAME = Symbol("cleanChannelName.original");

let editingChannelId: string | null = null;

function computeClean(name: string, type: number): string {
    const separator = [2, 4].includes(type) ? " " : "-";
    const cleaned = name
        .normalize("NFKC")
        .replace(/[\u1D00\u0299\u1D04\u1D05\u1D07\uA730\u0262\u029C\u026A\u1D0A\u1D0B\u029F\u1D0D\u0274\u1D0F\u1D18\u01EB\u0280\uA731\u1D1B\u1D1C\u1D20\u1D21x\u028F\u1D22]/g, m => SMALL_CAPS[m])
        .replace(/[^ -~]?\p{Extended_Pictographic}[^ -~]?/ug, "")
        .replace(/-?\|-?/g, separator)
        .replace(/-?[^\p{Letter} -~]-?/ug, separator)
        .replace(/-+/g, "-")
        .replace(/(^-|-$)/g, "");
    return cleaned || name;
}

export default definePlugin({
    name: "CleanChannelName",
    authors: [Devs.ewlle, Devs.kraethis, Devs.Sharp],
    description: "Remove emoji and decoration from channel names. Reverts to the original while you're editing the channel.",
    tags: ["Appearance", "Customisation", "Chat", "Emotes", "Servers"],
    patches: [
        {
            find: "loadAllGuildAndPrivateChannelsFromDisk(){",
            replacement: {
                match: /(?<=getChannel\(\i\)\{if\(null!=\i\)return )\i\(\i\)/,
                replace: "$self.cleanChannelName($&)",
            },
        },
    ],

    flux: {
        CHANNEL_SETTINGS_INIT({ channelId }: { channelId: string; }) {
            editingChannelId = channelId;
            (ChannelStore as any).emitChange?.();
        },
        CHANNEL_SETTINGS_CLOSE() {
            editingChannelId = null;
            (ChannelStore as any).emitChange?.();
        },
    },

    cleanChannelName(channel?: Channel) {
        if (channel == null) return channel;
        const c = channel as any;

        if (c[ORIGINAL_NAME] !== undefined) return channel;

        c[ORIGINAL_NAME] = channel.name;

        Object.defineProperty(channel, "name", {
            configurable: true,
            enumerable: true,
            get() {
                if (editingChannelId === channel.id) return c[ORIGINAL_NAME];
                return computeClean(c[ORIGINAL_NAME], channel.type);
            },
            set(value: string) {
                c[ORIGINAL_NAME] = value;
            },
        });

        return channel;
    },
});
