/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Message } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { RelationshipStore, SelectedChannelStore } from "@webpack/common";

interface IMessageCreate {
    type: "MESSAGE_CREATE";
    optimistic: boolean;
    channelId: string;
    message: Message;
}

// Anyone in the channel can set this off, so spamming the phrase must not keep opening the URL
const COOLDOWN_MS = 60_000;
let lastOpened = 0;

/** The trigger, built once per setting rather than once per message. Null while the setting isn't a valid regex */
let trigger: { source: string; regex: RegExp | null; } | undefined;
function getTrigger(source: string) {
    if (trigger?.source !== source) {
        let regex: RegExp | null = null;
        try {
            regex = new RegExp(source, "i");
        } catch { }
        trigger = { source, regex };
    }
    return trigger.regex;
}

const settings = definePluginSettings({
    regex: {
        type: OptionType.STRING,
        description: "Regex to trigger on",
        default: "hop on (?:fortnite|fn)"
    },
    url: {
        // Opened on other people's messages, so a synced or shared settings file must not get to choose it
        sensitive: true,
        type: OptionType.STRING,
        description: "URL to open",
        default: "com.epicgames.launcher://apps/fn%3A4fe75bbc5a674f4f9b356b5c90567da5%3AFortnite?action=launch&silent=true"
    }
});
export default definePlugin({
    name: "HopOn",
    description: "Hop on! Opens a configurable URL when a message matches a custom regex in the current channel.",
    tags: ["Fun"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,
    flux: {
        async MESSAGE_CREATE({ optimistic, type, message, channelId }: IMessageCreate) {
            if (optimistic || type !== "MESSAGE_CREATE") return;
            if (message.state === "SENDING") return;
            if (RelationshipStore.isBlocked(message.author?.id)) return;
            if (channelId !== SelectedChannelStore.getChannelId()) return;
            const regex = getTrigger(settings.store.regex);
            if (!regex || !message.content || !regex.test(message.content)) return;
            if (Date.now() - lastOpened < COOLDOWN_MS) return;

            lastOpened = Date.now();
            EndcordNative.native.openExternal(settings.store.url);
        }
    }
});
