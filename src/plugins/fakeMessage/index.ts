/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { EndcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByCodeLazy } from "@webpack";
import { GuildMemberStore, MessageActions, SnowflakeUtils, UserStore, UserUtils } from "@webpack/common";

const createBotMessage = findByCodeLazy('username:"Clyde"');
const createMessageRecord = findByCodeLazy(".createFromServer(", ".isBlockedForMessage", "messageReference:");

export default definePlugin({
    name: "FakeMessage",
    description: "Send a client-side fake message posed as any user via /fakemsg. Only you can see it.",
    tags: ["Chat", "Fun"],
    authors: [EndcordDevs.Sharp],
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "fakemsg",
            description: "Locally display a fake message as another user. Only you can see it.",
            inputType: ApplicationCommandInputType.BOT,
            options: [
                {
                    name: "user",
                    description: "The user to pose the message as.",
                    type: ApplicationCommandOptionType.USER,
                    required: true,
                },
                {
                    name: "message",
                    description: "The message content to display.",
                    type: ApplicationCommandOptionType.STRING,
                    required: true,
                },
            ],
            async execute(args, ctx) {
                try {
                    const userOpt: any = findOption(args, "user");
                    let userId = "";
                    if (typeof userOpt === "string") userId = userOpt;
                    else if (Array.isArray(userOpt) && userOpt.length > 0) userId = typeof userOpt[0] === "string" ? userOpt[0] : (userOpt[0]?.id ?? userOpt[0]?.userId ?? "");
                    else if (typeof userOpt === "object" && userOpt !== null) userId = userOpt.id ?? userOpt.userId ?? "";
                    userId = userId.replace(/[<@!>]/g, "").trim();

                    const content: string = findOption(args, "message", "");
                    if (!content) return;

                    let user = userId ? UserStore.getUser(userId) : null;
                    if (!user && userId) {
                        try {
                            user = await UserUtils.getUser(userId);
                        } catch { }
                    }
                    if (!user && userId) {
                        const allUsers = UserStore.getUsers?.();
                        if (allUsers) {
                            user = Object.values(allUsers).find(
                                (u: any) => u.username?.toLowerCase() === userId.toLowerCase() ||
                                            u.globalName?.toLowerCase() === userId.toLowerCase()
                            ) as any;
                        }
                    }
                    if (!user) {
                        user = UserStore.getCurrentUser();
                    }

                    const nick = ctx.guild?.id ? GuildMemberStore?.getNick?.(ctx.guild.id, user.id) : undefined;
                    const messageId = SnowflakeUtils.fromTimestamp(Date.now());

                    const rawMsg: any = {
                        id: messageId,
                        type: 0,
                        content,
                        channel_id: ctx.channel.id,
                        author: {
                            id: user.id,
                            username: user.username,
                            discriminator: user.discriminator || "0",
                            avatar: user.avatar,
                            avatarDecoration: (user as any).avatarDecoration,
                            bot: user.bot ?? false,
                            global_name: (user as any).globalName ?? (user as any).global_name ?? user.username,
                        },
                        nick: nick || (user as any).globalName || user.username,
                        attachments: [],
                        embeds: [],
                        pinned: false,
                        mention_everyone: false,
                        tts: false,
                        timestamp: new Date().toISOString(),
                        state: "SENT",
                    };

                    let dispatched = false;

                    if (typeof createBotMessage === "function") {
                        try {
                            const baseBot = createBotMessage({ channelId: ctx.channel.id, content, embeds: [] });
                            const finalMsg = Object.assign(baseBot, {
                                ...rawMsg,
                                author: user,
                                timestamp: new Date(),
                                flags: 0,
                                state: "SENT"
                            });
                            MessageActions.receiveMessage(ctx.channel.id, finalMsg);
                            dispatched = true;
                        } catch { }
                    }

                    if (!dispatched && typeof createMessageRecord === "function") {
                        try {
                            const record = createMessageRecord(rawMsg);
                            MessageActions.receiveMessage(ctx.channel.id, record);
                            dispatched = true;
                        } catch { }
                    }

                    if (!dispatched) {
                        sendBotMessage(ctx.channel.id, {
                            ...rawMsg,
                            author: user as any
                        });
                    }
                } catch (err: any) {
                    console.error("[FakeMessage] Error executing /fakemsg:", err);
                    sendBotMessage(ctx.channel.id, {
                        content: `⚠️ Failed to create fake message: ${err?.message || err}`
                    });
                }
            },
        },
    ],
});
