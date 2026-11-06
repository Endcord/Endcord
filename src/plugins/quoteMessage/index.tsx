/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Message } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { copyWithToast, insertTextIntoChatInputBox } from "@utils/discord";
import { t } from "@utils/i18n";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, GuildMemberStore, Menu, SelectedChannelStore } from "@webpack/common";
import type { ReactElement } from "react";

const settings = definePluginSettings({
    withLink: {
        type: OptionType.BOOLEAN,
        description: "Add a link to the quoted message",
        default: true
    }
});

// A quote has to leave room in a 2000 character message for the reply under it
const MAX_QUOTE = 1500;

function authorName(message: Message, guildId?: string | null) {
    const { author } = message;
    return (guildId && GuildMemberStore.getNick(guildId, author.id)) || (author as any).globalName || author.username;
}

export function makeQuote(message: Message) {
    const guildId = ChannelStore.getChannel(message.channel_id)?.guild_id;

    let text = message.content ?? "";
    for (const file of message.attachments ?? []) text += `${text ? "\n" : ""}📎 ${file.filename}`;
    if (!text.trim()) text = "…";
    if (text.length > MAX_QUOTE) text = `${text.slice(0, MAX_QUOTE).trimEnd()}…`;

    // Discord doesn't nest quotes, so the quote marks a message already had would show as text
    const lines = text.split("\n").map(line => `> ${line.replace(/^>>?>? ?/, "")}`);
    // A name rather than a mention, so sending the quote doesn't ping anyone
    let by = `— **${authorName(message, guildId)}**`;
    if (settings.store.withLink) by += ` · https://discord.com/channels/${guildId ?? "@me"}/${message.channel_id}/${message.id}`;

    return `${lines.join("\n")}\n${by}\n`;
}

const QuoteIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H9a1 1 0 0 1 1 1v5.5A6.5 6.5 0 0 1 5 16.83a1 1 0 0 1-1.18-1.6A4.5 4.5 0 0 0 6 12H4V6.5Zm10 0A2.5 2.5 0 0 1 16.5 4H19a1 1 0 0 1 1 1v5.5a6.5 6.5 0 0 1-5 6.33 1 1 0 0 1-1.18-1.6A4.5 4.5 0 0 0 16 12h-2V6.5Z" />
    </svg>
);

const messageMenu: NavContextMenuPatchCallback = (children, { message }: { message?: Message; }) => {
    if (!message?.author) return;

    const items: ReactElement[] = [];
    // Writing goes into the open chat, so this is only offered there
    if (message.channel_id === SelectedChannelStore.getChannelId()) {
        items.push(
            <Menu.MenuItem
                id="ec-quote-message"
                key="ec-quote-message"
                label={t("Quote")}
                icon={QuoteIcon}
                action={() => insertTextIntoChatInputBox(makeQuote(message))}
            />
        );
    }
    items.push(
        <Menu.MenuItem
            id="ec-copy-as-quote"
            key="ec-copy-as-quote"
            label={t("Copy as Quote")}
            action={() => copyWithToast(makeQuote(message), t("Quote copied"))}
        />
    );

    const group = findGroupChildrenByChildId("copy-text", children);
    if (group) group.splice(group.findIndex(c => c?.props?.id === "copy-text") + 1, 0, ...items);
    else children.push(<Menu.MenuGroup>{items}</Menu.MenuGroup>);
};

export default definePlugin({
    name: "QuoteMessage",
    description: "Right-click a message to quote it in your message box, with who wrote it and a link back, or to copy it as a quote.",
    tags: ["Chat", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,

    contextMenus: {
        "message": messageMenu
    }
});
