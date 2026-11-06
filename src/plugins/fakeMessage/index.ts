/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import type { CommandContext } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByCodeLazy } from "@webpack";
import { FluxDispatcher, GuildMemberStore, MessageActions, SnowflakeUtils, UserStore, UserUtils } from "@webpack/common";

const createBotMessage = findByCodeLazy('username:"Clyde"');
const createMessageRecord = findByCodeLazy(".createFromServer(", ".isBlockedForMessage", "messageReference:");

async function resolveUser(userOpt: any) {
    let userId = "";
    if (typeof userOpt === "string") userId = userOpt;
    else if (Array.isArray(userOpt) && userOpt.length > 0) userId = typeof userOpt[0] === "string" ? userOpt[0] : (userOpt[0]?.id ?? userOpt[0]?.userId ?? "");
    else if (typeof userOpt === "object" && userOpt !== null) userId = userOpt.id ?? userOpt.userId ?? "";
    userId = userId.replace(/[<@!>]/g, "").trim();

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
    return user ?? UserStore.getCurrentUser();
}

/** Puts a message from this user in the channel, on this screen only */
function showLocalMessage(ctx: CommandContext, user: any, content: string) {
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
            avatarDecoration: user.avatarDecoration,
            bot: user.bot ?? false,
            global_name: user.globalName ?? user.global_name ?? user.username,
        },
        nick: nick || user.globalName || user.username,
        attachments: [],
        embeds: [],
        pinned: false,
        mention_everyone: false,
        tts: false,
        timestamp: new Date().toISOString(),
        state: "SENT",
    };

    if (typeof createBotMessage === "function") {
        try {
            const baseBot = createBotMessage({ channelId: ctx.channel.id, content, embeds: [] });
            MessageActions.receiveMessage(ctx.channel.id, Object.assign(baseBot, {
                ...rawMsg,
                author: user,
                timestamp: new Date(),
                flags: 0,
                state: "SENT"
            }));
            return;
        } catch { }
    }

    if (typeof createMessageRecord === "function") {
        try {
            MessageActions.receiveMessage(ctx.channel.id, createMessageRecord(rawMsg));
            return;
        } catch { }
    }

    sendBotMessage(ctx.channel.id, { ...rawMsg, author: user });
}

// Discord's own ids for Nitro's application, products and plans, as its code lists them
const NITRO_APPLICATION = "521842831262875670";
const GIFTS: Record<string, { sku: string; plan: string; }> = {
    month: { sku: "521847234246082599", plan: "511651880837840896" },
    year: { sku: "521847234246082599", plan: "511651885459963904" },
    basic: { sku: "978380684370378762", plan: "978380692553465866" }
};

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => CODE_LETTERS[byte % CODE_LETTERS.length]).join("");

/**
 * A gift link only this screen can open. Discord is told the code is already looked up, so it draws the gift card
 * without asking its servers, which know no such gift: it can't be claimed, and nobody else sees it
 */
function showFakeGift(ctx: CommandContext, from: any, kind: string) {
    const { sku, plan } = GIFTS[kind] ?? GIFTS.month;
    const code = randomCode();

    FluxDispatcher.dispatch({
        type: "GIFT_CODE_RESOLVE_SUCCESS",
        giftCode: {
            code,
            sku_id: sku,
            subscription_plan_id: plan,
            application_id: NITRO_APPLICATION,
            user: { id: from.id, username: from.username, avatar: from.avatar, discriminator: from.discriminator ?? "0", global_name: from.globalName ?? null },
            uses: 0,
            max_uses: 1,
            redeemed: false,
            expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            flags: 0
        }
    });
    showLocalMessage(ctx, from, `https://discord.gift/${code}`);
}

export default definePlugin({
    name: "FakeMessage",
    description: "Show a fake message as any user with /fakemsg, or a Nitro gift with /fakegift. Only you can see them.",
    tags: ["Chat", "Fun"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "fakemsg",
            description: "Locally display a fake message as another user. Only you can see it.",
            inputType: ApplicationCommandInputType.BUILT_IN,
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
                    const content: string = findOption(args, "message", "");
                    if (!content) return;
                    showLocalMessage(ctx, await resolveUser(findOption(args, "user")), content);
                } catch (err: any) {
                    console.error("[FakeMessage] Error executing /fakemsg:", err);
                    sendBotMessage(ctx.channel.id, {
                        content: `⚠️ Failed to create fake message: ${err?.message || err}`
                    });
                }
            },
        },
        {
            name: "fakegift",
            description: "Show a Nitro gift from someone in this chat. Only you can see it, and it can't be claimed.",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "from",
                    description: "Who the gift is from. You, if left empty.",
                    type: ApplicationCommandOptionType.USER,
                    required: false,
                },
                {
                    name: "gift",
                    description: "Which Nitro",
                    type: ApplicationCommandOptionType.STRING,
                    required: false,
                    choices: [
                        { name: "Nitro, 1 month", label: "Nitro, 1 month", value: "month" },
                        { name: "Nitro, 1 year", label: "Nitro, 1 year", value: "year" },
                        { name: "Nitro Basic, 1 month", label: "Nitro Basic, 1 month", value: "basic" },
                    ],
                },
            ],
            async execute(args, ctx) {
                try {
                    const from = findOption(args, "from");
                    showFakeGift(ctx, from ? await resolveUser(from) : UserStore.getCurrentUser(), findOption(args, "gift", "month"));
                } catch (err: any) {
                    console.error("[FakeMessage] Error executing /fakegift:", err);
                    sendBotMessage(ctx.channel.id, { content: `⚠️ Failed to create the gift: ${err?.message || err}` });
                }
            },
        },
    ],
});
