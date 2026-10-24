/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { addChannelToolbarButton, ChannelToolbarButton, removeChannelToolbarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import { Message } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Menu, openModal } from "@webpack/common";

import { deleteMessages, IndexedMessage, prune, putMessages, updateContent } from "./db";
import { openSaveModal, VaultIcon, VaultModal } from "./VaultModal";

const logger = new Logger("MessageVault");

export const settings = definePluginSettings({
    indexServers: {
        type: OptionType.BOOLEAN,
        description: "Index messages from servers",
        default: true,
    },
    indexDirectMessages: {
        type: OptionType.BOOLEAN,
        description: "Index direct messages and group chats",
        default: true,
    },
    maxMessages: {
        type: OptionType.SELECT,
        description: "How many messages to keep in the local index (the oldest are removed first)",
        options: [
            { label: "25,000", value: 25_000 },
            { label: "50,000", value: 50_000 },
            { label: "100,000", value: 100_000, default: true },
            { label: "250,000", value: 250_000 },
        ],
    },
    showToolbarButton: {
        type: OptionType.BOOLEAN,
        description: "Show the Message Vault button in the channel toolbar",
        default: true,
        restartNeeded: true,
    },
});

// ---- indexing: messages Discord already loaded for you, batched into one write ----

const queue = new Map<string, IndexedMessage>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let writesSincePrune = 0;

function toRecord(m: Message | any): IndexedMessage | null {
    if (!m?.id || !m.channel_id || !m.author) return null;
    const channel = ChannelStore.getChannel(m.channel_id);
    const guildId = channel?.guild_id ?? m.guild_id ?? null;
    if (guildId ? !settings.store.indexServers : !settings.store.indexDirectMessages) return null;
    const content = typeof m.content === "string" ? m.content : "";
    const attachments = m.attachments?.length ?? 0;
    if (!content && !attachments) return null;
    return {
        id: m.id,
        ch: m.channel_id,
        g: guildId,
        a: m.author.id,
        an: m.author.globalName ?? m.author.global_name ?? m.author.username ?? "",
        c: content.slice(0, 2000),
        ts: new Date(m.timestamp).getTime() || Date.now(),
        r: m.messageReference?.message_id ?? m.message_reference?.message_id ?? null,
        at: attachments,
    };
}

function enqueue(messages: any[]) {
    for (const m of messages) {
        const record = toRecord(m);
        if (record) queue.set(record.id, record);
    }
    if (!queue.size) return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, queue.size > 500 ? 0 : 1500);
}

async function flush() {
    const batch = [...queue.values()];
    queue.clear();
    try {
        await putMessages(batch);
        writesSincePrune += batch.length;
        if (writesSincePrune > 2000) {
            writesSincePrune = 0;
            await prune(Number(settings.store.maxMessages));
        }
    } catch (e) {
        logger.error("Failed to index messages", e);
    }
}

const MessageVaultContextMenu: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!message?.id) return;
    const group = findGroupChildrenByChildId("copy-text", children) ?? children;
    group.push(
        <Menu.MenuItem id="ec-vault-save" label={t("Save to Message Vault")} action={() => openSaveModal(message)} />
    );
};

export function openVault(initial?: { channelId?: string; }) {
    openModal(props => <VaultModal modalProps={props} initial={initial} />);
}

export default definePlugin({
    name: "MessageVault",
    description: "Search everything you have read by keyword, person, channel and date, browse it as a timeline, and keep messages in your own collections. Indexed on your device only.",
    tags: ["Utility", "Chat"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.Sharp],
    searchTerms: ["search", "find", "archive", "timeline", "collections", "bookmark", "arama"],
    dependencies: ["HeaderBarAPI"],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic: boolean; }) {
            if (!optimistic) enqueue([message]);
        },
        LOAD_MESSAGES_SUCCESS({ messages }: { messages: any[]; }) {
            enqueue(messages);
        },
        MESSAGE_UPDATE({ message }: { message: any; }) {
            if (message?.id && typeof message.content === "string") {
                const queued = queue.get(message.id);
                if (queued) queued.c = message.content.slice(0, 2000);
                else updateContent(message.id, message.content.slice(0, 2000)).catch(() => { });
            }
        },
        // A deleted message is no longer yours to search
        MESSAGE_DELETE({ id }: { id: string; }) {
            queue.delete(id);
            deleteMessages([id]).catch(() => { });
        },
        MESSAGE_DELETE_BULK({ ids }: { ids: string[]; }) {
            ids.forEach(id => queue.delete(id));
            deleteMessages(ids).catch(() => { });
        },
    },

    contextMenus: {
        "message": MessageVaultContextMenu,
    },

    toolboxActions: {
        "Open Message Vault": () => openVault(),
    },

    start() {
        if (settings.store.showToolbarButton) {
            addChannelToolbarButton("MessageVault", () => (
                <ChannelToolbarButton icon={VaultIcon} tooltip={t("Message Vault")} onClick={() => openVault()} />
            ), 4);
        }
    },

    stop() {
        removeChannelToolbarButton("MessageVault");
        clearTimeout(flushTimer);
        if (queue.size) flush();
    },
});
