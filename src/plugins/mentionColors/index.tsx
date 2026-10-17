/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import definePlugin from "@utils/types";
import { ChannelStore, FluxDispatcher, GuildMemberStore, MessageStore, ReadStateStore, UserStore } from "@webpack/common";

import { settings } from "./settings";

const directMentionChannels = new Set<string>();
const directMentionGuilds = new Set<string>();

let observer: MutationObserver | null = null;
let rafId: number | null = null;

function updateGuildSets() {
    directMentionGuilds.clear();
    for (const channelId of directMentionChannels) {
        try {
            const channel = ChannelStore.getChannel(channelId);
            const guildId = channel?.guild_id ?? (channel?.parent_id ? ChannelStore.getChannel(channel.parent_id)?.guild_id : null);
            if (guildId) {
                directMentionGuilds.add(String(guildId));
            }
        } catch { }
    }
}

function isChannelOrThreadDirectlyMentioned(channelId: string): boolean {
    if (directMentionChannels.has(channelId)) return true;
    try {
        for (const dId of directMentionChannels) {
            const ch = ChannelStore.getChannel(dId);
            if (ch?.parent_id === channelId) return true;
        }
    } catch { }
    return false;
}

function inspectChannelMessages(channelId: string) {
    try {
        const count = ReadStateStore.getMentionCount?.(channelId) ?? 0;
        if (count <= 0) {
            directMentionChannels.delete(channelId);
            return;
        }

        const channel = ChannelStore.getChannel(channelId);
        if (channel && (channel.isDM?.() || channel.isGroupDM?.())) {
            directMentionChannels.add(channelId);
            return;
        }

        const myId = UserStore.getCurrentUser()?.id;
        if (!myId) return;

        const guildId = channel?.guild_id;
        const myRoles = guildId ? (GuildMemberStore.getMember(guildId, myId)?.roles ?? []) : [];

        const channelMsgs = MessageStore.getMessages?.(channelId);
        const msgs = channelMsgs?._array;

        if (Array.isArray(msgs) && msgs.length > 0) {
            const ackId = ReadStateStore.ackMessageId?.(channelId);
            let foundDirect = false;

            for (let i = msgs.length - 1; i >= 0; i--) {
                const msg = msgs[i];
                if (!msg) continue;
                if (ackId && msg.id <= ackId) break;

                const isMe = msg.mentions?.some((u: any) => String(u.id) === String(myId));
                const isMyRole = msg.mention_roles?.some((r: string) => myRoles.includes(r));

                if (isMe || isMyRole) {
                    foundDirect = true;
                    break;
                }
            }

            if (foundDirect) {
                directMentionChannels.add(channelId);
            } else {
                directMentionChannels.delete(channelId);
            }
        }
    } catch { }
}

function updateBadges() {
    try {
        const directColor = settings.store.directColor || "#23a55a";
        document.documentElement.style.setProperty("--mention-direct-color", directColor);

        const numberBadges = document.querySelectorAll<HTMLElement>('[class*="numberBadge"]');

        for (const badge of numberBadges) {
            // 1. Server list in left sidebar
            const listItem = badge.closest('[class*="listItem"]') ?? badge.parentElement?.parentElement;
            const guildNav = listItem?.querySelector('[data-list-item-id^="guildsnav___"]');

            if (guildNav) {
                const rawId = guildNav.getAttribute("data-list-item-id")?.replace("guildsnav___", "") ?? "";
                let isDirect = false;

                if (rawId === "home") {
                    isDirect = true;
                } else if (rawId.startsWith("folder-") || rawId.startsWith("folder_")) {
                    const childGuildNavs = listItem?.querySelectorAll<HTMLElement>('[data-list-item-id^="guildsnav___"]') ?? [];
                    for (const childNav of childGuildNavs) {
                        const cId = childNav.getAttribute("data-list-item-id")?.replace("guildsnav___", "");
                        if (cId && !cId.startsWith("folder") && directMentionGuilds.has(cId)) {
                            isDirect = true;
                            break;
                        }
                    }
                } else if (rawId) {
                    isDirect = directMentionGuilds.has(rawId);
                }

                if (isDirect) {
                    badge.setAttribute("data-direct-mention", "true");
                    badge.style.setProperty("background-color", directColor, "important");
                    badge.style.setProperty("color", "#ffffff", "important");
                } else {
                    badge.removeAttribute("data-direct-mention");
                    badge.style.setProperty("background-color", "var(--status-danger, #f23f43)", "important");
                    badge.style.setProperty("color", "#ffffff", "important");
                }
                continue;
            }

            // 2. Channel list
            const channelNav = badge.closest('[data-list-item-id^="channels___"]') ?? badge.closest('li, [class*="containerDefault"]')?.querySelector('[data-list-item-id^="channels___"]');

            if (channelNav) {
                const channelId = channelNav.getAttribute("data-list-item-id")?.replace("channels___", "");
                const isDirect = Boolean(channelId && isChannelOrThreadDirectlyMentioned(channelId));

                if (isDirect) {
                    badge.setAttribute("data-direct-mention", "true");
                    badge.style.setProperty("background-color", directColor, "important");
                    badge.style.setProperty("color", "#ffffff", "important");
                } else {
                    badge.removeAttribute("data-direct-mention");
                    badge.style.setProperty("background-color", "var(--status-danger, #f23f43)", "important");
                    badge.style.setProperty("color", "#ffffff", "important");
                }
            }
        }
    } catch { }
}

function scheduleUpdate() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
        rafId = null;
        updateBadges();
    });
}

function onMessageCreate(event: any) {
    try {
        const message = event?.message;
        if (!message) return;

        const channelId = message.channel_id;
        const myId = UserStore.getCurrentUser()?.id;
        if (!myId || !channelId) return;

        const channel = ChannelStore.getChannel(channelId);
        if (channel && (channel.isDM?.() || channel.isGroupDM?.())) {
            directMentionChannels.add(channelId);
            updateGuildSets();
            scheduleUpdate();
            return;
        }

        const guildId = message.guild_id ?? channel?.guild_id;
        const isMeMentioned = Boolean(message.mentions?.some((u: any) => String(u.id) === String(myId)));
        const myRoles = guildId ? (GuildMemberStore.getMember(guildId, myId)?.roles ?? []) : [];
        const isRoleMentioned = Boolean(message.mention_roles?.some((r: string) => myRoles.includes(r)));

        if (isMeMentioned || isRoleMentioned) {
            directMentionChannels.add(channelId);
            updateGuildSets();
        }
        scheduleUpdate();
    } catch { }
}

function onAck(event: any) {
    try {
        const channelId = event?.channelId ?? event?.channel_id;
        if (channelId) {
            if ((ReadStateStore.getMentionCount?.(channelId) ?? 0) === 0) {
                directMentionChannels.delete(channelId);
            }
        }
        for (const cId of directMentionChannels) {
            if ((ReadStateStore.getMentionCount?.(cId) ?? 0) === 0) {
                directMentionChannels.delete(cId);
            }
        }
        updateGuildSets();
        scheduleUpdate();
    } catch { }
}

function scanInitial() {
    try {
        const mentionChannels = ReadStateStore.getMentionChannelIds?.() ?? [];
        for (const cId of mentionChannels) {
            inspectChannelMessages(cId);
        }
        updateGuildSets();
        scheduleUpdate();
    } catch { }
}

export default definePlugin({
    name: "MentionColors",
    description: "Distinguishes direct mentions from @everyone/@here pings. Direct personal tags show a green +1 badge across all servers and channels, while broadcast pings stay red.",
    tags: ["Notifications", "Appearance", "Servers"],
    authors: [{ name: "rootpoi", id: 1390609041897554050n }],
    settings,

    start() {
        scanInitial();

        try {
            FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
            FluxDispatcher.subscribe("MESSAGE_ACK", onAck);
            FluxDispatcher.subscribe("CHANNEL_SELECT", onAck);
            FluxDispatcher.subscribe("READ_STATE_UPDATE", onAck);
            FluxDispatcher.subscribe("NOTIFICATION_SETTINGS_UPDATE", scheduleUpdate);
            FluxDispatcher.subscribe("PASSIVE_UPDATE_V2", scheduleUpdate);
        } catch { }

        try {
            observer = new MutationObserver(() => {
                scheduleUpdate();
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } catch { }
    },

    stop() {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        try {
            FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
            FluxDispatcher.unsubscribe("MESSAGE_ACK", onAck);
            FluxDispatcher.unsubscribe("CHANNEL_SELECT", onAck);
            FluxDispatcher.unsubscribe("READ_STATE_UPDATE", onAck);
            FluxDispatcher.unsubscribe("NOTIFICATION_SETTINGS_UPDATE", scheduleUpdate);
            FluxDispatcher.unsubscribe("PASSIVE_UPDATE_V2", scheduleUpdate);
        } catch { }

        if (observer) {
            observer.disconnect();
            observer = null;
        }

        directMentionChannels.clear();
        directMentionGuilds.clear();

        const markedElements = document.querySelectorAll<HTMLElement>("[data-direct-mention]");
        for (const el of markedElements) {
            el.removeAttribute("data-direct-mention");
            el.style.setProperty("background-color", "var(--status-danger, #f23f43)");
        }
        document.documentElement.style.removeProperty("--mention-direct-color");
    }
});
