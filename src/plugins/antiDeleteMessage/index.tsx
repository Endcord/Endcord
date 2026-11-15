/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { wrapMethod } from "@utils/wrapMethod";
import { Constants, RestAPI, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable automatic message restoration",
        default: true,
    },
    dmProtection: {
        type: OptionType.BOOLEAN,
        description: "Also protect DMs (not just servers)",
        default: false,
    },
    maxCacheSize: {
        type: OptionType.NUMBER,
        description: "Maximum number of messages kept in cache",
        default: 500,
    },
    serverBlacklist: {
        type: OptionType.STRING,
        description: "Server IDs to ignore (comma-separated). Messages sent in these servers will NOT be resent.",
        default: "",
        placeholder: "e.g. 123456789, 987654321",
    }
});

const DB_KEY = "AntiDeleteMessage_cache";

interface CachedMessage {
    content: string;
    channelId: string;
    nonce: string;
    guildId?: string;
    messageReference?: {
        channel_id: string;
        message_id: string;
        guild_id?: string;
    };
    savedAt: number; // timestamp for cache cleanup
}

// In-memory copy of the IndexedDB cache
let memCache: Record<string, CachedMessage> = {};
let dbLoaded = false;

async function loadCache() {
    try {
        const stored = await DataStore.get<Record<string, CachedMessage>>(DB_KEY);
        if (stored) {
            memCache = stored;
        }
        dbLoaded = true;
    } catch (e) {
        console.warn("[AntiDeleteMessage] Failed to load cache:", e);
        dbLoaded = true;
    }
}

// Persisted to IndexedDB 1s after the last message, so it doesn't write on every one
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            await DataStore.set(DB_KEY, memCache);
        } catch (e) {
            console.warn("[AntiDeleteMessage] Failed to save cache:", e);
        }
    }, 1000);
}

function getBlacklistedGuildIds(): Set<string> {
    const raw = settings.store.serverBlacklist ?? "";
    return new Set(
        raw.split(",")
            .map(s => s.trim())
            .filter(s => s.length > 0)
    );
}

function addToCache(messageId: string, data: CachedMessage) {
    const maxSize = settings.store.maxCacheSize ?? 500;

    // Evict oldest entries if cache exceeds the limit
    const ids = Object.keys(memCache);
    if (ids.length >= maxSize) {
        const sorted = ids.sort((a, b) => (memCache[a].savedAt ?? 0) - (memCache[b].savedAt ?? 0));
        const toDelete = Math.max(1, Math.floor(maxSize * 0.1));
        for (let i = 0; i < toDelete; i++) delete memCache[sorted[i]];
    }

    memCache[messageId] = data;
    scheduleSave();
}

/** Messages deleted from this client: the user wanted those gone, so they aren't sent again */
const deletedHere = new Set<string>();
const MESSAGE_PATH = /\/channels\/\d+\/messages\/(\d+)$/;
let unwrapDelete: (() => void) | undefined;

async function resendMessage(cached: CachedMessage) {
    try {
        const body: any = {
            content: cached.content,
            flags: 0,
            mobile_network_type: "unknown",
            nonce: cached.nonce, // same nonce = same visual position in chat
            tts: false,
        };

        if (cached.messageReference) {
            body.message_reference = cached.messageReference;
        }

        await RestAPI.post({
            url: Constants.Endpoints.MESSAGES(cached.channelId),
            body
        });
    } catch (err) {
        console.warn("[AntiDeleteMessage] Failed to resend message:", err);
    }
}

export default definePlugin({
    name: "AntiDeleteMessage",
    description: "Automatically resends your messages if someone else deletes them. Messages you delete yourself from this device stay deleted. Cache persisted across restarts.",
    authors: [Devs.vpg],
    enabledByDefault: false,
    settings,

    flux: {
        MESSAGE_CREATE({ message, guildId }: {
            message: {
                id: string;
                author: { id: string; };
                content: string;
                channel_id: string;
                nonce?: string;
                message_reference?: any;
                attachments?: { url: string; }[];
            };
            guildId?: string;
        }) {
            if (!settings.store.enabled) return;
            if (!dbLoaded) return; // not ready yet

            const currentUser = UserStore.getCurrentUser();
            if (!currentUser || message.author.id !== currentUser.id) return;

            // Ignore messages with no text content (stickers, etc.)
            if (!message.content?.trim()) return;

            // Ignore DMs if the option is disabled
            if (!guildId && !settings.store.dmProtection) return;

            // Ignore servers in the blacklist
            if (guildId && getBlacklistedGuildIds().has(guildId)) return;

            addToCache(message.id, {
                content: message.content,
                channelId: message.channel_id,
                nonce: message.id,
                guildId,
                messageReference: message.message_reference,
                savedAt: Date.now(),
            });
        },

        MESSAGE_DELETE({ id, channelId }: { id: string; channelId: string; }) {
            if (!settings.store.enabled) return;

            const cached = memCache[id];
            if (!cached) return;

            if (deletedHere.delete(id)) {
                delete memCache[id];
                scheduleSave();
                return;
            }

            // Check blacklist at delete-time too (in case the setting changed)
            if (cached.guildId && getBlacklistedGuildIds().has(cached.guildId)) {
                delete memCache[id];
                scheduleSave();
                return;
            }

            // Remove from cache to prevent infinite loops
            delete memCache[id];
            scheduleSave();

            setTimeout(() => resendMessage(cached), 400);
        },
    },

    async start() {
        await loadCache();
        // Every delete this client sends goes through here, whichever button or plugin asked for it
        unwrapDelete = wrapMethod(RestAPI, "del", function (original, req) {
            const id = MESSAGE_PATH.exec(String(req?.url))?.[1];
            if (id && memCache[id]) deletedHere.add(id);
            return original.call(this, req);
        });
    },

    stop() {
        unwrapDelete?.();
        unwrapDelete = undefined;
        deletedHere.clear();
        if (saveTimer) {
            clearTimeout(saveTimer);
            // Final synchronous save
            DataStore.set(DB_KEY, memCache).catch(() => {});
        }
        memCache = {};
        dbLoaded = false;
    }
});
