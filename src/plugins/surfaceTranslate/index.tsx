/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import type { Channel, Message } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { useForceUpdater } from "@utils/react";
import definePlugin, { OptionType } from "@utils/types";
import { Unwrap, wrapMethod } from "@utils/wrapMethod";
import { ChannelStore, FluxDispatcher, useEffect } from "@webpack/common";

const logger = new Logger("SurfaceTranslate");

interface CachedTranslation {
    original: string;
    translated: string;
}

interface MessageWithContent extends Message {
    content: string;
}

interface SearchResultProps {
    id?: string;
    message: MessageWithContent;
}

const translationCache = new Map<string, CachedTranslation>();
const skippedTranslations = new Set<string>();
const inProgress = new Set<string>();
const abortControllers = new Set<AbortController>();
const searchResultListeners = new Map<string, Set<() => void>>();

let generation = 0;
// Through wrapMethod: FakeFriends wraps some of the same methods, and putting them back by hand on stop brought back
// its wrappers in the wrong order, or wrapped one of ours twice so it called itself
const unwrapChannelStore: Unwrap<any>[] = [];
let realGetChannel: ((channelId: string) => Channel | undefined) | undefined;

function resetTranslations() {
    generation++;
    translationCache.clear();
    skippedTranslations.clear();
    inProgress.clear();

    for (const controller of abortControllers) controller.abort();
    abortControllers.clear();
    rateLimitedUntil = 0;
    hasLoggedRateLimit = false;
}

const settings = definePluginSettings({
    targetLanguage: {
        type: OptionType.STRING,
        description: "Target language code for surface translations.",
        default: "en",
        onChange: resetTranslations,
    },
    translateChannelNames: {
        type: OptionType.BOOLEAN,
        description: "Translate guild channel and thread names.",
        default: true,
    },
    translateChannelTopics: {
        type: OptionType.BOOLEAN,
        description: "Translate guild channel topics and descriptions.",
        default: true,
    },
    translateSearchResults: {
        type: OptionType.BOOLEAN,
        description: "Translate message text when Discord renders search results.",
        default: true,
    },
    showOriginal: {
        type: OptionType.BOOLEAN,
        description: "Show the original text next to translated channel names and topics.",
        default: false,
    },
});

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function getTranslationCacheKey(kind: string, id: string, text: string) {
    return `${settings.store.targetLanguage}:${kind}:${id}:${text}`;
}

let rateLimitedUntil = 0;
let hasLoggedRateLimit = false;

function getTranslatedText(kind: string, id: string, text: string, onTranslated: () => void): string | undefined {
    if (Date.now() < rateLimitedUntil) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const key = getTranslationCacheKey(kind, id, trimmed);
    if (skippedTranslations.has(key)) return;

    const cached = translationCache.get(key);
    if (cached?.original === trimmed) return cached.translated;

    queueTranslation(key, trimmed, onTranslated);
}

function queueTranslation(key: string, text: string, onTranslated: () => void) {
    if (Date.now() < rateLimitedUntil || inProgress.has(key)) return;

    const currentGeneration = generation;
    const controller = new AbortController();
    inProgress.add(key);
    abortControllers.add(controller);

    fetchTranslation(text, controller.signal).then(translated => {
        if (generation !== currentGeneration) return;
        if (!translated || translated === text) {
            skippedTranslations.add(key);
            return;
        }

        translationCache.set(key, { original: text, translated });
        onTranslated();
    }).catch(error => {
        if (error instanceof Error && error.name === "AbortError") return;
        skippedTranslations.add(key);
        if (Date.now() >= rateLimitedUntil) {
            logger.warn("Surface translation failed", error);
        }
    }).finally(() => {
        inProgress.delete(key);
        abortControllers.delete(controller);
    });
}

function getBaseLanguage(language: string) {
    return language.toLowerCase().split(/[-_]/)[0];
}

async function fetchTranslation(text: string, signal: AbortSignal): Promise<string | null> {
    if (Date.now() < rateLimitedUntil) return null;
    const targetLanguage = settings.store.targetLanguage.trim();
    const targetBaseLanguage = getBaseLanguage(targetLanguage);
    if (!targetBaseLanguage) return null;

    const url = `https://translate-pa.googleapis.com/v1/translate?${new URLSearchParams({
        "params.client": "gtx",
        "dataTypes": "TRANSLATION",
        "key": "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA", // some google API key
        "query.sourceLanguage": "auto",
        "query.targetLanguage": targetLanguage,
        "query.text": text,
    })}`;
    const response = await fetch(url, { signal });
    if (response.status === 429) {
        rateLimitedUntil = Date.now() + 60_000;
        if (!hasLoggedRateLimit) {
            hasLoggedRateLimit = true;
            logger.warn("Translation API returned 429 (rate limit). Pausing translations for 60s.");
        }
        return null;
    }
    if (!response.ok) throw new Error(`Translation API returned ${response.status} ${response.statusText}`);

    const data: unknown = await response.json();
    if (!isRecord(data) || typeof data.translation !== "string") return null;

    const sourceLanguage = typeof data.sourceLanguage === "string" ? getBaseLanguage(data.sourceLanguage) : "";
    if (sourceLanguage && sourceLanguage === targetBaseLanguage) return null;

    return data.translation.trim() || null;
}

function dispatchChannelRefresh(channelId: string) {
    const channel = realGetChannel?.(channelId);
    if (!channel) return;

    FluxDispatcher.dispatch({
        type: "CHANNEL_UPDATES",
        channels: [channel],
    });
}

// Re-renders the search results showing this message. A fake MESSAGE_UPDATE would reach every message store,
// and Discord's handlers expect raw gateway messages, not records
function refreshSearchResult(messageId: string) {
    searchResultListeners.get(messageId)?.forEach(listener => listener());
}

function formatTranslatedText(translated: string, original: string) {
    if (!settings.store.showOriginal) return translated;
    return `${translated} (${original})`;
}

function formatTranslatedTopic(translated: string, original: string) {
    if (!settings.store.showOriginal) return translated;
    return `${translated}\n\nOriginal: ${original}`;
}

function getChannelTopic(channel: Channel) {
    const { topic } = channel;
    return typeof topic === "string" ? topic : "";
}

function translateChannel(channel: Channel): Channel;
function translateChannel(channel: null | undefined): null | undefined;
function translateChannel(channel: Channel | null | undefined): Channel | null | undefined {
    if (!channel?.guild_id || typeof channel.merge !== "function") return channel;

    const changes: Record<string, unknown> = {};

    if (settings.store.translateChannelNames && channel.name) {
        const translatedName = getTranslatedText("channel-name", channel.id, channel.name, () => dispatchChannelRefresh(channel.id));
        if (translatedName) changes.name = formatTranslatedText(translatedName, channel.name);
    }

    const topic = getChannelTopic(channel);
    if (settings.store.translateChannelTopics && topic) {
        const translatedTopic = getTranslatedText("channel-topic", channel.id, topic, () => dispatchChannelRefresh(channel.id));
        if (translatedTopic) changes.topic_ = formatTranslatedTopic(translatedTopic, topic);
    }

    return Object.keys(changes).length ? channel.merge(changes) : channel;
}

function translateOptionalChannel(channel: Channel | undefined): Channel | undefined {
    return channel ? translateChannel(channel) : channel;
}

function translateChannelRecord(channels: Record<string, Channel> | null | undefined): Record<string, Channel> {
    if (!channels) return {};

    const translated = { ...channels };
    for (const channelId in channels) translated[channelId] = translateChannel(channels[channelId]);
    return translated;
}

function translateChannelArray(channels: Channel[] | null | undefined): Channel[] {
    return channels ? channels.map(channel => translateChannel(channel)) : [];
}

// Discord renders search results with ids like "search-result-<messageId>", chat messages with "chat-messages-…"
function isSearchResultProps(value: unknown): boolean {
    return isRecord(value) && typeof value.id === "string" && value.id.startsWith("search-result");
}

function translateSearchMessage(message: MessageWithContent): MessageWithContent {
    const translated = getTranslatedText("search-message", message.id, message.content, () => refreshSearchResult(message.id));
    if (!translated) return message;

    // Search results carry content pre-rendered from the original text (with the search terms highlighted),
    // which Discord shows instead of `content`, so it has to go
    return Object.assign(Object.create(Object.getPrototypeOf(message)), message, {
        content: translated,
        customRenderedContent: undefined,
    }) as MessageWithContent;
}

function patchChannelStore() {
    if (unwrapChannelStore.length) return;

    // Discord calls these constantly, so the wrappers call through directly rather than building anything per call
    const wrap = (key: keyof typeof ChannelStore, wrapper: (this: unknown, original: any, ...args: any[]) => unknown) => {
        if (typeof ChannelStore[key] !== "function") return undefined;
        const unwrap = wrapMethod(ChannelStore as any, key, wrapper);
        unwrapChannelStore.push(unwrap);
        return unwrap;
    };

    realGetChannel = wrap("getChannel", function (original, channelId: string) {
        const channel = original.call(this, channelId);
        return channel ? translateChannel(channel) : channel;
    })?.original;
    wrap("getBasicChannel", function (original, channelId: string) { return translateOptionalChannel(original.call(this, channelId)); });
    wrap("getDMChannelFromUserId", function (original, userId: string) { return translateOptionalChannel(original.call(this, userId)); });
    wrap("getMutableBasicGuildChannelsForGuild", function (original, guildId: string) { return translateChannelRecord(original.call(this, guildId)); });
    wrap("getMutableGuildChannelsForGuild", function (original, guildId: string) { return translateChannelRecord(original.call(this, guildId)); });
    wrap("getMutablePrivateChannels", function (original) { return translateChannelRecord(original.call(this)); });
    wrap("getInitialOverlayState", function (original) { return translateChannelRecord(original.call(this)); });
    wrap("getAllThreadsForGuild", function (original, guildId: string) { return translateChannelArray(original.call(this, guildId)); });
    wrap("getAllThreadsForParent", function (original, parentChannelId: string) { return translateChannelArray(original.call(this, parentChannelId)); });
    wrap("getSortedLinkedChannelsForGuild", function (original, guildId: string) { return translateChannelArray(original.call(this, guildId)); });
    wrap("getSortedPrivateChannels", function (original) { return translateChannelArray(original.call(this)); });
}

function restoreChannelStore() {
    for (const unwrap of unwrapChannelStore.splice(0)) unwrap();
    realGetChannel = undefined;
}

export default definePlugin({
    name: "SurfaceTranslate",
    description: "Translate channel names, channel topics, and search result text.",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    tags: ["Chat", "Utility"],
    settings,

    patches: [
        {
            // The message component of the search results panel (chat messages use a different one)
            find: "inlineEditor:",
            replacement: {
                match: /(?<=let\{message:\i,[^}]{0,400}?inlineEditor:\i,\.\.\.\i\}=)\i(?=,)/,
                replace: "$self.useSearchResultProps($&)",
            },
        },
    ],

    start() {
        patchChannelStore();
    },

    stop() {
        restoreChannelStore();
        resetTranslations();
    },

    // Runs at the top of the search result component on every render, so the hooks are never skipped
    useSearchResultProps(props: SearchResultProps): SearchResultProps {
        const forceUpdate = useForceUpdater();
        const { message } = props;
        const isSearchResult = settings.store.translateSearchResults && !!message.content && isSearchResultProps(props);

        useEffect(() => {
            if (!isSearchResult) return;

            let listeners = searchResultListeners.get(message.id);
            if (!listeners) searchResultListeners.set(message.id, listeners = new Set());
            listeners.add(forceUpdate);

            return () => {
                listeners.delete(forceUpdate);
                if (!listeners.size) searchResultListeners.delete(message.id);
            };
        }, [isSearchResult, message.id]);

        if (!isSearchResult) return props;

        const translated = translateSearchMessage(message);
        return translated === message ? props : { ...props, message: translated };
    },
});
