/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { useStateFromStores, VoiceStateStore } from "@webpack/common";

const cl = classNameFactory("vc-voicecount-");
const SETTING_KEYS: ("showUserLimit" | "hideEmpty")[] = ["showUserLimit", "hideEmpty"];

const settings = definePluginSettings({
    showUserLimit: {
        type: OptionType.BOOLEAN,
        description: "Show the user limit as well, for channels that have one.",
        default: true
    },
    hideEmpty: {
        type: OptionType.BOOLEAN,
        description: "Hide the number on empty channels.",
        default: true
    }
});

function VoiceCount({ channel }: { channel: Channel; }) {
    const { showUserLimit, hideEmpty } = settings.use(SETTING_KEYS);

    const count = useStateFromStores(
        [VoiceStateStore],
        () => Object.keys(VoiceStateStore.getVoiceStatesForChannel(channel.id)).length,
        [channel.id]
    );

    if (count === 0 && hideEmpty) return null;

    const limit = showUserLimit && channel.userLimit > 0 ? channel.userLimit : 0;

    return (
        <div className={cl("count", { full: limit > 0 && count >= limit })}>
            {limit > 0 ? `${count}/${limit}` : count}
        </div>
    );
}

const VoiceCountBoundary = ErrorBoundary.wrap(VoiceCount, { noop: true });

export default definePlugin({
    name: "VoiceCount",
    description: "Shows how many people are sitting in each voice channel, right next to it in the channel list.",
    authors: [Devs.ewlle, Devs.kraethis, Devs.Sharp],
    tags: ["Voice", "Servers"],
    settings,

    patches: [
        {
            find: "UNREAD_IMPORTANT:",
            replacement: {
                match: /\.Children\.count.+?:null(?<=,channel:(\i).+?)/,
                replace: "$&,$self.renderVoiceCount($1)"
            }
        }
    ],

    renderVoiceCount(channel: Channel) {
        if (channel?.type !== ChannelType.GUILD_VOICE && channel?.type !== ChannelType.GUILD_STAGE_VOICE) return null;

        return <VoiceCountBoundary channel={channel} />;
    }
});
