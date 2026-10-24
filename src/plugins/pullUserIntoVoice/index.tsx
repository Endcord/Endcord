/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addGlobalContextMenuPatch, GlobalContextMenuPatchCallback, removeGlobalContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, User } from "@vencord/discord-types";
import { ChannelStore, Menu, React, RestAPI, showToast, UserStore, VoiceStateStore } from "@webpack/common";

interface UserContextProps {
    channel: Channel;
    user: User;
    guildId?: string;
}

const logger = new Logger("PullUserIntoVoice");
const FAILURE_COOLDOWN = 10_000;

let pulledUserId: string | null = null;
let lastFailureAt = 0;
let intervalId: any;

const settings = definePluginSettings({
    pullWhenUserLeaves: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Keep pulling the user even when they leave your voice channel entirely"
    }
});

function getMyVoiceChannel() {
    const myVoice = VoiceStateStore.getVoiceStateForUser(UserStore.getCurrentUser().id);
    if (!myVoice?.channelId) return null;

    const channel = ChannelStore.getChannel(myVoice.channelId) as Channel | undefined;
    if (!channel?.guild_id) return null;

    return { channelId: myVoice.channelId, guildId: channel.guild_id };
}

async function moveUserToChannel(userId: string, channelId: string, guildId: string) {
    try {
        await RestAPI.patch({
            url: `/guilds/${guildId}/members/${userId}`,
            body: { channel_id: channelId }
        });
        lastFailureAt = 0;
        return true;
    } catch (e) {
        logger.error(`Failed to move ${userId}`, e);
        lastFailureAt = Date.now();
        return false;
    }
}

async function pullUser() {
    const userId = pulledUserId;
    if (!userId) return;

    const myVoice = getMyVoiceChannel();
    if (!myVoice) return;

    const target = VoiceStateStore.getVoiceStateForUser(userId);
    if (target?.channelId === myVoice.channelId) return;

    if (!target?.channelId && !settings.store.pullWhenUserLeaves) return;

    if (Date.now() - lastFailureAt < FAILURE_COOLDOWN) return;

    // can't move someone from another guild
    if (target?.channelId) {
        const targetChannel = ChannelStore.getChannel(target.channelId) as Channel | undefined;
        if (targetChannel && targetChannel.guild_id !== myVoice.guildId) return;
    }

    await moveUserToChannel(userId, myVoice.channelId, myVoice.guildId);
}

// "Follow User" can come from FollowUser (id: follow-user, inside a MenuGroup)
// or from FollowVoiceUser (id: fvu-follow-user, at root)
const FOLLOW_ITEM_IDS = ["follow-user", "fvu-follow-user"];

// Returns the container array and the index of the top level element that
// contains a follow item, so we can insert right after the whole group
function findFollowAnchor(children: Array<any>): { array: Array<any>; index: number } | null {
    for (let index = 0; index < children.length; index++) {
        const child = children[index];
        const props = child?.props;
        if (props?.id && FOLLOW_ITEM_IDS.includes(props.id)) return { array: children, index };

        const nested = props?.children;
        if (!nested) continue;

        const nestedArray = Array.isArray(nested) ? nested : [nested];
        if (findFollowAnchor(nestedArray)) return { array: children, index };
    }

    return null;
}

// Registered as a global patch so it always runs after every other plugin's
// "user-context" patch, guaranteeing the Follow User item is already present
const UserContextMenuPatch: GlobalContextMenuPatchCallback = (navId, children, { user }: UserContextProps) => {
    if (navId !== "user-context") return;
    if (!user || UserStore.getCurrentUser().id === user.id) return;

    const item = (
        <Menu.MenuCheckboxItem
            id="pull-user-into-voice"
            label={t("Pull into my Voice")}
            checked={pulledUserId === user.id}
            action={async () => {
                if (pulledUserId === user.id) {
                    pulledUserId = null;
                    return;
                }

                pulledUserId = user.id;

                const myVoice = getMyVoiceChannel();
                if (!myVoice) return;

                const ok = await moveUserToChannel(user.id, myVoice.channelId, myVoice.guildId);
                showToast({
                    text: ok
                        ? "User moved into your voice channel."
                        : "Could not move the user (missing permission or incompatible channel).",
                    variant: ok ? "success" : "critical"
                });
            }}
        ></Menu.MenuCheckboxItem>
    );

    const followAnchor = findFollowAnchor(children);
    if (followAnchor) {
        followAnchor.array.splice(followAnchor.index + 1, 0, item, <Menu.MenuSeparator />);
    } else {
        // same convention as FollowUser/AutoDisconnect: right before the last entry
        children.splice(Math.max(0, children.length - 1), 0, item, <Menu.MenuSeparator />);
    }
};

export default definePlugin({
    name: "PullUserIntoVoice",
    description: "Continuously pulls the selected user into the voice channel you are currently in.",
    tags: ["Voice"],
    authors: [Devs.vpg],
    settings,
    flux: {
        VOICE_STATE_UPDATES() {
            pullUser();
        }
    },
    start() {
        addGlobalContextMenuPatch(UserContextMenuPatch);
        intervalId = setInterval(pullUser, 2000);
    },
    stop() {
        removeGlobalContextMenuPatch(UserContextMenuPatch);
        clearInterval(intervalId);
    }
});
