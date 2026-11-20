/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import type { Channel } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { insertTextIntoChatInputBox } from "@utils/discord";
import { t } from "@utils/i18n";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import { GuildChannelStore, Menu, React, RestAPI, UserStore, VoiceStateStore } from "@webpack/common";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runSequential<T>(tasks: (() => Promise<T>)[]): Promise<void> {
    for (let i = 0; i < tasks.length; i++) {
        for (let attempt = 0; ; attempt++) {
            try {
                await tasks[i]();
                break;
            } catch (error: any) {
                if (error?.status === 429 && attempt < 3) {
                    const retryAfter = Number(error.body?.retry_after);
                    await sleep((retryAfter > 0 ? retryAfter : 5) * 1000);
                    continue;
                }
                if (error?.status === 401 || error?.status === 403) throw error;
                console.error("VoiceChatUtilities request failed", error);
                break;
            }
        }

        if ((i + 1) % settings.store.waitAfter === 0 && i + 1 < tasks.length) {
            await sleep(settings.store.waitSeconds * 1000);
        }
    }
}

function sendPatch(channel: Channel, body: Record<string, any>, bypass = false) {
    const usersVoice = VoiceStateStore.getVoiceStatesForChannel(channel.id);
    const myId = UserStore.getCurrentUser().id;

    const tasks: (() => Promise<any>)[] = [];
    Object.keys(usersVoice).forEach(key => {
        const { userId } = usersVoice[key];

        if (bypass || userId !== myId) {
            tasks.push(async () => {
                // The batch can take a while; skip members who left the channel meanwhile.
                const stillHere = Object.values(VoiceStateStore.getVoiceStatesForChannel(channel.id)).some(s => s.userId === userId);
                if (!stillHere) return;
                return RestAPI.patch({
                    url: `/guilds/${channel.guild_id}/members/${userId}`,
                    body
                });
            });
        }
    });

    runSequential(tasks).catch(error => {
        console.error("VoiceChatUtilities failed to run", error);
    });
}

function mentionVoiceUsers(channel: Channel) {
    const currentUserId = UserStore.getCurrentUser()?.id;
    const mentions = Object.values(VoiceStateStore.getVoiceStatesForChannel(channel.id))
        .map(state => state.userId)
        .filter((userId, index, arr) => userId && userId !== currentUserId && arr.indexOf(userId) === index)
        .map(userId => `<@${userId}>`);

    if (mentions.length === 0) return;
    insertTextIntoChatInputBox(`${mentions.join(" ")} `);
}

interface VoiceChannelContextProps {
    channel: Channel;
}

const VoiceChannelContext: NavContextMenuPatchCallback = (children, { channel }: VoiceChannelContextProps) => {
    // only for voice and stage channels
    if (!channel || (channel.type !== 2 && channel.type !== 13)) return;
    const userCount = Object.keys(VoiceStateStore.getVoiceStatesForChannel(channel.id)).length;
    if (userCount === 0) return;

    const guildChannels: { VOCAL: { channel: Channel, comparator: number; }[]; } = GuildChannelStore.getChannels(channel.guild_id);
    const voiceChannels = guildChannels.VOCAL.map(({ channel }) => channel).filter(({ id }) => id !== channel.id);

    children.splice(
        -1,
        0,
        <Menu.MenuItem
            label={t("Voice Tools")}
            key="voice-tools"
            id="voice-tools"
        >
            <Menu.MenuItem
                key="voice-tools-mention-all"
                id="voice-tools-mention-all"
                label={t("Mention all Users")}
                action={() => mentionVoiceUsers(channel)}
            />

            <Menu.MenuItem
                key="voice-tools-disconnect-all"
                id="voice-tools-disconnect-all"
                label={t("Disconnect all")}
                action={() => sendPatch(channel, {
                    channel_id: null,
                })}
            />

            <Menu.MenuItem
                key="voice-tools-mute-all"
                id="voice-tools-mute-all"
                label={t("Mute all")}
                action={() => sendPatch(channel, {
                    mute: true,
                })}
            />

            <Menu.MenuItem
                key="voice-tools-unmute-all"
                id="voice-tools-unmute-all"
                label={t("Unmute all")}
                action={() => sendPatch(channel, {
                    mute: false,
                })}
            />

            <Menu.MenuItem
                key="voice-tools-deafen-all"
                id="voice-tools-deafen-all"
                label={t("Deafen all")}
                action={() => sendPatch(channel, {
                    deaf: true,
                })}
            />

            <Menu.MenuItem
                key="voice-tools-undeafen-all"
                id="voice-tools-undeafen-all"
                label={t("Undeafen all")}
                action={() => sendPatch(channel, {
                    deaf: false,
                })}
            />

            <Menu.MenuItem
                label={t("Move all")}
                key="voice-tools-move-all"
                id="voice-tools-move-all"
            >
                {voiceChannels.map(voiceChannel => {
                    return (
                        <Menu.MenuItem
                            key={voiceChannel.id}
                            id={voiceChannel.id}
                            label={voiceChannel.name}
                            action={() => sendPatch(channel, {
                                channel_id: voiceChannel.id,
                            }, true)}
                        />
                    );
                })}

            </Menu.MenuItem>
        </Menu.MenuItem>
    );
};

const settings = definePluginSettings({
    waitAfter: {
        type: OptionType.SLIDER,
        description: "Amount of API actions to perform before waiting (to avoid rate limits)",
        default: 5,
        markers: makeRange(1, 20),
    },
    waitSeconds: {
        type: OptionType.SLIDER,
        description: "Time to wait between each action (in seconds)",
        default: 2,
        markers: makeRange(1, 10, .5),
    }
});

export default definePlugin({
    name: "VoiceChatUtilities",
    description: "This plugin allows you to perform multiple actions on an entire channel (move, mute, disconnect, etc.) (originally by dutake)",
    tags: ["Chat", "Servers", "Voice"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    settings,

    contextMenus: {
        "channel-context": VoiceChannelContext
    },
});
