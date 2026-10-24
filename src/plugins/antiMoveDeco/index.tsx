/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserAreaButton } from "@api/UserArea";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, React, UserStore } from "@webpack/common";
// Modules Webpack
const ChannelActions = findByPropsLazy("selectVoiceChannel", "disconnect");
const SelectedChannelStore = findByPropsLazy("getVoiceChannelId", "getChannelId");
let enabled = false;
let targetChannelId: string | null = null;
function onVoiceStateUpdate({ voiceStates }: { voiceStates: any[]; }) {
    if (!enabled || !targetChannelId) return;
    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) return;
    const myId = currentUser.id;
    const myState = voiceStates.find(s => s.userId === myId);
    if (myState) {
        if (myState.channelId !== targetChannelId) {
            console.log(`[AntiMoveDeco] Movement or disconnect detected! Returning to channel ${targetChannelId}...`);
            setTimeout(() => {
                if (enabled && targetChannelId) {
                    try {
                        ChannelActions?.selectVoiceChannel?.(targetChannelId);
                    } catch (e) {
                        console.error("[AntiMoveDeco] Error while reconnecting:", e);
                    }
                }
            }, 500);
        }
    }
}
function AntiMoveDecoIcon({ enabled }: { enabled: boolean; }) {
    const color = enabled ? "#39FF14" : "currentColor";
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
        </svg>
    );
}
function AntiMoveDecoButton() {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    const toggle = () => {
        if (!enabled) {
            const channelId = SelectedChannelStore?.getVoiceChannelId?.();
            if (!channelId) return;
            targetChannelId = channelId;
            enabled = true;
            console.log(`[AntiMoveDeco] Enabled. Protected channel: ${targetChannelId}`);
        } else {
            enabled = false;
            targetChannelId = null;
            console.log("[AntiMoveDeco] Disabled.");
        }
        forceUpdate();
    };
    return (
        <UserAreaButton
            onClick={toggle}
            tooltipText={enabled ? "Disable AntiMove&Deco" : "Enable AntiMove&Deco"}
            icon={<AntiMoveDecoIcon enabled={enabled} />}
        />
    );
}
export default definePlugin({
    name: "AntiMoveDeco",
    description: "Adds a button to prevent being moved or disconnected from a voice channel.",
    authors: [Devs.vpg],
    enabledByDefault: false,
    userAreaButton: {
        icon: () => <AntiMoveDecoIcon enabled={enabled} />,
        render: AntiMoveDecoButton
    },
    start() {
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
    },
    stop() {
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
        enabled = false;
        targetChannelId = null;
    }
});
