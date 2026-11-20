/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { filters, find, findByProps, findByPropsLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, React, UserStore, useStateFromStores } from "@webpack/common";

const StreamStore = findByPropsLazy("getActiveStreamForUser", "getAllActiveStreams");
const RTCConnectionStore = findByPropsLazy("getMediaSessionId");
const StreamerModeStore = findByPropsLazy("hidePersonalInformation");

const settings = definePluginSettings({
    hideGroups: {
        type: OptionType.BOOLEAN,
        description: "Hide Group DMs too while streaming",
        default: false
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Debug Mode - Shows detailed logs in the console",
        default: false
    }
});

let originalPlaySound: any = null;
const restoreExports: Array<() => void> = [];

function isHiddenChannel(channelId: unknown, channelType?: unknown): boolean {
    const type = typeof channelType === "number" ? channelType : ChannelStore?.getChannel?.(channelId as string)?.type;
    return type === 1 || (type === 3 && settings.store.hideGroups);
}

/**
 * Webpack exports are getter-only properties (configurable, see defineExports), so plain assignment throws in strict
 * code. Redefine the property instead; callers in other modules read it on every call
 */
function overrideExport(obj: any, key: string, make: (original: any) => any) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    const original = obj[key];
    if (typeof original !== "function") return;
    Object.defineProperty(obj, key, { configurable: true, enumerable: desc?.enumerable ?? true, writable: true, value: make(original) });
    restoreExports.push(() => {
        if (desc) Object.defineProperty(obj, key, desc);
        else delete obj[key];
    });
}

function isStreaming(): boolean {
    try {
        if (StreamerModeStore?.hidePersonalInformation) {
            return true;
        }

        const currentUser = UserStore?.getCurrentUser?.();
        if (!currentUser) return false;

        const userStream = StreamStore?.getActiveStreamForUser?.(currentUser.id);
        if (userStream) {
            if (settings.store.debugMode) console.debug("[NoDMWhileStreaming] [DEBUG] Stream detected via getActiveStreamForUser", userStream);
            return true;
        }

        const allStreams = StreamStore?.getAllActiveStreams?.();
        if (allStreams && allStreams.length > 0) {
            const myStream = allStreams.find((s: any) => s.ownerId === currentUser.id);
            if (myStream) return true;
        }

        const mediaSessionId = RTCConnectionStore?.getMediaSessionId?.();
        if (mediaSessionId) {
            const state = RTCConnectionStore?.getState?.();
            if (state && state.context === "stream") return true;
        }

        return false;
    } catch (e) {
        console.error("[NoDMWhileStreaming] Error during stream check:", e);
        return false;
    }
}

export default definePlugin({
    name: "NoDMWhileStreaming",
    description: "Hides DM and Group DM notifications and sidebar items while you are streaming",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    tags: ["Appearance", "Utility", "Privacy"],
    enabledByDefault: false,
    settings,
    patches: [
        // Filters DMs (type 1) and Group DMs (type 3) from the private channel list
        {
            find: '"dm-quick-launcher"===',
            replacement: {
                match: /privateChannelIds:([^,]+)(?=,listRef:)/,
                replace: "privateChannelIds:$self.filterChannels($1)"
            }
        },
        // Reactive hook to force re-render when stream status changes
        {
            find: ".FRIENDS},\"friends\"",
            replacement: {
                match: /let{showLibrary:\i,/,
                replace: "$self.useStreamStatus();$&"
            }
        }
    ],

    // While streaming, DMs and group DMs are acked as their messages arrive
    flux: {
        MESSAGE_CREATE(event: any) {
            if (!isStreaming()) return;

            const message = event?.message;
            if (!message) return;

            const channel = ChannelStore?.getChannel?.(message.channel_id);
            if (!channel) return;

            // Type 1 = Private DM, Type 3 = Group DM
            const isDM = channel.type === 1;
            const isGroup = channel.type === 3 && settings.store.hideGroups;

            if (!isDM && !isGroup) return;

            // Do not ack own messages
            const currentUser = UserStore?.getCurrentUser?.();
            if (currentUser && message.author?.id === currentUser.id) return;

            if (settings.store.debugMode) {
                console.debug(`[NoDMWhileStreaming] [ACK] Auto-ack message from ${message.author?.username} in channel ${message.channel_id}`);
            }

            // Ack in a microtask: dispatching synchronously would collide with the dispatch in progress, and a microtask
            // still runs before the next paint
            queueMicrotask(() => {
                try {
                    FluxDispatcher.dispatch({
                        type: "BULK_ACK",
                        context: "APP",
                        channels: [{
                            channelId: channel.id,
                            messageId: message.id, // Ack up to the new message right away
                            readStateType: 0
                        }]
                    });
                } catch (e) {
                    if (settings.store.debugMode) {
                        console.error("[NoDMWhileStreaming] Error during ack:", e);
                    }
                }
            });
        }
    },

    useStreamStatus() {
        const streaming = useStateFromStores([StreamerModeStore, StreamStore], () => isStreaming());
        React.useEffect(() => {
            if (streaming) {
                document.body.classList.add("no-dm-while-streaming-active");
            } else {
                document.body.classList.remove("no-dm-while-streaming-active");
            }
        }, [streaming]);
    },

    filterChannels(ids: string[]) {
        const streaming = isStreaming();
        if (settings.store.debugMode) {
            console.debug(`[NoDMWhileStreaming] filterChannels called. IDs count: ${ids?.length}, Streaming: ${streaming}`);
        }
        if (!streaming) return ids;

        const filtered = ids.filter((id: string) => {
            const type = ChannelStore?.getChannel?.(id)?.type;
            if (type === 1) return false;
            if (type === 3 && settings.store.hideGroups) return false;
            return true;
        });

        if (settings.store.debugMode) {
            console.debug(`[NoDMWhileStreaming] filterChannels filtered. Remaining: ${filtered.length}`);
        }

        // If streaming and filtered is empty, but we had original DMs,
        // return [ids[0]] so that privateChannelIds is non-empty.
        // That keeps the "Direct Messages" header rendering; the CSS hides the one item
        if (filtered.length === 0 && ids.length > 0) {
            return [ids[0]];
        }

        return filtered;
    },

    start() {
        if (settings.store.debugMode) console.debug("[NoDMWhileStreaming] Plugin started");

        // Patch playSound to block message sounds while streaming
        try {
            // Discord no longer exposes this helper object; look it up quietly and skip sound blocking when missing
            const soundModule = find(filters.byProps("playSound", "createSound"), { isIndirect: true });
            if (soundModule) {
                originalPlaySound = soundModule.playSound;
                soundModule.playSound = function (soundName: string, ...args: any[]) {
                    if (isStreaming() && soundName === "message") {
                        if (settings.store.debugMode) {
                            console.debug("[NoDMWhileStreaming] [Sound] Blocked message notification sound");
                        }
                        return;
                    }
                    return originalPlaySound.call(soundModule, soundName, ...args);
                };
            }
        } catch (e) {
            console.error("[NoDMWhileStreaming] Failed to patch soundModule:", e);
        }

        // Discord's message notifications, desktop and in-app, and their sound go through showNotification.
        // Its arguments are (icon, title, body, analytics, options); analytics carries channel_id and channel_type
        try {
            const notificationActions = findByProps("showNotification");
            if (notificationActions) {
                overrideExport(notificationActions, "showNotification", original => function (this: any, ...args: any[]) {
                    const info = args[3];
                    if (isStreaming() && isHiddenChannel(info?.channel_id ?? args[0], info?.channel_type)) {
                        if (settings.store.debugMode) {
                            console.debug("[NoDMWhileStreaming] [Notification] Blocked native showNotification for channel:", info?.channel_id);
                        }
                        return;
                    }
                    return original.apply(this, args);
                });

                overrideExport(notificationActions, "makeTextNotification", original => function (this: any, channel: any, ...args: any[]) {
                    if (isStreaming() && isHiddenChannel(channel?.id, channel?.type)) {
                        if (settings.store.debugMode) {
                            console.debug("[NoDMWhileStreaming] [Notification] Blocked native makeTextNotification");
                        }
                        return;
                    }
                    return original.call(this, channel, ...args);
                });
            }
        } catch (e) {
            console.error("[NoDMWhileStreaming] Failed to patch native notificationActions:", e);
        }
    },

    stop() {
        if (settings.store.debugMode) console.debug("[NoDMWhileStreaming] Plugin stopped");

        // Restore playSound
        if (originalPlaySound) {
            try {
                // Discord no longer exposes this helper object; look it up quietly and skip sound blocking when missing
            const soundModule = find(filters.byProps("playSound", "createSound"), { isIndirect: true });
                if (soundModule) {
                    soundModule.playSound = originalPlaySound;
                }
            } catch (e) {
                console.error("[NoDMWhileStreaming] Failed to restore soundModule:", e);
            }
            originalPlaySound = null;
        }

        for (const restore of restoreExports.splice(0)) {
            try { restore(); } catch (e) {
                console.error("[NoDMWhileStreaming] Failed to restore notificationActions:", e);
            }
        }
    }
});
