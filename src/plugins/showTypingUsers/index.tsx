/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

const TypingStore = findByPropsLazy("getTypingUsers");
const UserStore = findByPropsLazy("getUser", "getCurrentUser");

interface TypingUser {
    id: string;
    username: string;
    globalName: string | null;
}

let currentChannelId: string | null = null;
let setUsersRef: ((users: TypingUser[]) => void) | null = null;

function onTypingStart({ channelId, userId }: any) {
    if (channelId !== currentChannelId) return;
    refresh(channelId);
}

function onTypingStop({ channelId }: any) {
    if (channelId !== currentChannelId) return;
    refresh(channelId);
}

function refresh(channelId: string) {
    const raw = TypingStore.getTypingUsers(channelId) ?? {};
    const me = UserStore.getCurrentUser();
    const users: TypingUser[] = Object.keys(raw)
        .filter(id => id !== me?.id)
        .map(id => {
            const u = UserStore.getUser(id);
            return { id, username: u?.username ?? id, globalName: u?.globalName ?? null };
        });
    setUsersRef?.(users);
}

export default definePlugin({
    name: "ShowTypingUsers",
    description: "Shows a badge in the channel header listing who is currently typing.",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    tags: ["Chat", "Utility"],

    start() {
        FluxDispatcher.subscribe("TYPING_START", onTypingStart);
        FluxDispatcher.subscribe("TYPING_STOP", onTypingStop);
    },

    stop() {
        FluxDispatcher.unsubscribe("TYPING_START", onTypingStart);
        FluxDispatcher.unsubscribe("TYPING_STOP", onTypingStop);
        setUsersRef = null;
        currentChannelId = null;
    },
});
