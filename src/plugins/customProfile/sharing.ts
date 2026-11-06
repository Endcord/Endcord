/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Profiles shared between Endcord users, with Discord itself as the place they're kept. Saving a profile posts one
// message to the profiles channel in the Endcord server, and every Endcord user in that server reads the channel.
// Discord vouches for who wrote each message, so nobody can publish a profile for someone else; nothing goes to a
// server of Endcord's, and nothing costs anything to run

import { DataStore } from "@api/index";
import { CloudUploadPlatform } from "@endcord/discord-types/enums";
import { Logger } from "@utils/Logger";
import { CloudUploader, Constants, FluxDispatcher, GuildStore, ReadStateStore, RestAPI } from "@webpack/common";

import type { CustomProfileData } from "./data";

export const PROFILES_GUILD_ID = "1543323763695820942";
/** The profiles channel in the Endcord server. Without it, nothing is published or read */
export const PROFILES_CHANNEL_ID = "1568188531480993842";
export const PROFILES_INVITE = "endcord";

/** Starts every profile message, with the format's version, so a later format can sit next to this one */
const PREFIX = "ecp1 ";
const CACHE_KEY = "CustomProfile_shared_v1";
/** What each of this computer's accounts last shared, so a change made while it couldn't be shared goes out later */
const PUBLISHED_KEY = "CustomProfile_published_v1";
const MAX_CONTENT = 2000;
/** Read the whole channel again this often, which also drops profiles whose messages were deleted */
const FULL_SYNC_EVERY = 12 * 60 * 60 * 1000;
/** Pick up new profiles this often, in case Discord said nothing about the channel */
const SYNC_EVERY = 10 * 60 * 1000;
/**
 * When Discord only says the channel has a newer message, each client reads it after a random moment up to this long,
 * so the Endcord users online don't all ask Discord in the same second
 */
const PASSIVE_SPREAD = 3000;
/** Between pages of the channel, to stay well inside Discord's limits */
const PAGE_DELAY = 500;

const logger = new Logger("CustomProfile", "#9ccbff");

interface SharedEntry {
    /** The message it came from; a newer message from the same person replaces it */
    m: string;
    d: CustomProfileData;
}

interface SharedCache {
    channel: string;
    /** The newest message read, where the next sync starts */
    newest: string | null;
    fullAt: number;
    profiles: Record<string, SharedEntry>;
}

let cache: SharedCache = { channel: PROFILES_CHANNEL_ID, newest: null, fullAt: 0, profiles: {} };
let onChange: (changed: string[]) => void = () => { };
let syncTimer: ReturnType<typeof setInterval> | undefined;
let syncing: Promise<void> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
/** When a save that slow mode turned away goes out, or 0 */
let retryAt = 0;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let passiveTimer: ReturnType<typeof setTimeout> | undefined;
/** The newest message id a read was already started for, so the same one never starts another */
let askedFor: string | null = null;
/** The signed-in account and its profile, or null without one */
let getMine: () => { id: string; data: CustomProfileData | null; } | null = () => null;

export const isSharingConfigured = () => !!PROFILES_CHANNEL_ID;
export const isInProfilesServer = () => !!GuildStore?.getGuild?.(PROFILES_GUILD_ID);

/** Another Endcord user's shared profile, or null */
export const getSharedProfile = (userId: string) => cache.profiles[userId]?.d ?? null;
export const hasSharedProfiles = () => Object.keys(cache.profiles).length > 0;
export const sharedProfileIds = () => Object.keys(cache.profiles);
/** When a save that the channel's slow mode turned away is sent again, or 0 */
export const sharingRetryAt = () => retryAt;

// ---- What a profile message may say ------------------------------------------------------------------------------

const DISCORD_CDN = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/[^\s"'<>]+$/;
const TOKEN = /^[\w.-]{1,80}$/;
const SNOWFLAKE = /^\d{1,25}$/;
const ASSET_PATH = /^(?!.*\.\.)[\w\-./]{1,160}$/;

const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max ? value : undefined;
const int = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? value as number : undefined;
const matching = (value: unknown, pattern: RegExp) => typeof value === "string" && pattern.test(value) ? value : undefined;

/**
 * Keeps only what a shared profile may set, each of the right type and size. Everyone's client reads these messages,
 * so pictures must be on Discord's own servers (anything else would tell a stranger who looked at the profile), and
 * email, phone and the account's creation date never come from someone else
 */
export function sanitizeShared(raw: unknown): CustomProfileData | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const out: CustomProfileData = {};

    const set = <K extends keyof CustomProfileData>(key: K, value: CustomProfileData[K] | undefined) => {
        if (value !== undefined) out[key] = value;
    };

    set("username", text(r.username, 32));
    set("globalName", text(r.globalName, 32));
    set("bio", text(r.bio, 400));
    set("pronouns", text(r.pronouns, 40));
    set("oldName", text(r.oldName, 32));
    set("avatar", matching(r.avatar, DISCORD_CDN));
    set("banner", matching(r.banner, DISCORD_CDN));
    set("accentColor", int(r.accentColor, 0, 0xFFFFFF));
    set("accentColor2", int(r.accentColor2, 0, 0xFFFFFF));
    set("badgeFlags", int(r.badgeFlags, 0, 2 ** 31 - 1));
    set("nitroLevel", int(r.nitroLevel, 0, 20));
    set("nitroSince", matching(r.nitroSince, /^\d{4}-\d{2}-\d{2}$/));
    set("boostMonths", int(r.boostMonths, 0, 30));
    if (typeof r.nitro === "boolean") out.nitro = r.nitro;
    set("decorationAsset", matching(r.decorationAsset, TOKEN));
    set("profileEffectId", matching(r.profileEffectId, SNOWFLAKE));
    set("profileFrameId", matching(r.profileFrameId, SNOWFLAKE));

    if (Array.isArray(r.customBadgeIds) && r.customBadgeIds.length <= 40) {
        const ids = r.customBadgeIds.filter(id => matching(id, TOKEN));
        if (ids.length) out.customBadgeIds = ids as string[];
    }
    if (r.tieredBadges && typeof r.tieredBadges === "object" && !Array.isArray(r.tieredBadges)) {
        const tiers: Record<string, number> = {};
        for (const [key, tier] of Object.entries(r.tieredBadges).slice(0, 20)) {
            if (matching(key, TOKEN) && int(tier, 0, 20) !== undefined) tiers[key] = tier as number;
        }
        if (Object.keys(tiers).length) out.tieredBadges = tiers;
    }

    const plate = r.nameplate as Record<string, unknown> | undefined;
    if (plate && typeof plate === "object") {
        const skuId = matching(plate.skuId, SNOWFLAKE), asset = matching(plate.asset, ASSET_PATH);
        if (skuId && asset) out.nameplate = { skuId, asset, label: text(plate.label, 80), palette: text(plate.palette, 40) };
    }

    const styles = r.displayNameStyles as Record<string, unknown> | undefined;
    if (styles && typeof styles === "object" && Array.isArray(styles.colors) && styles.colors.length <= 4) {
        const fontId = int(styles.fontId, 0, 1_000_000), effectId = int(styles.effectId, 0, 1_000_000);
        const colors = styles.colors.filter(color => int(color, 0, 0xFFFFFF) !== undefined) as number[];
        if (fontId !== undefined && effectId !== undefined) out.displayNameStyles = { fontId, effectId, colors };
    }

    return Object.keys(out).length ? out : null;
}

/** Message attachments, by file name, for a profile that points at its own uploaded pictures */
type Attachments = { filename: string; url: string; }[];

/** A profile message's text and pictures, as the profile it describes, or null when it isn't one */
export function readProfileMessage(content: string, attachments: Attachments = []): CustomProfileData | null {
    if (!content.startsWith(PREFIX)) return null;
    let raw: any;
    try {
        raw = JSON.parse(content.slice(PREFIX.length));
    } catch {
        return null;
    }
    if (!raw || typeof raw !== "object") return null;
    // A picture uploaded with the message is named "att:<file name>"
    for (const key of ["avatar", "banner"] as const) {
        const ref = raw[key];
        if (typeof ref === "string" && ref.startsWith("att:")) raw[key] = attachments.find(file => file.filename === ref.slice(4))?.url;
    }
    return sanitizeShared(raw);
}

/**
 * The message that shares a profile: what others may see of it, as compact JSON. Pictures that are files on this
 * computer go along as attachments and the text names them. Too long, the bio is shortened, then left out
 */
export function writeProfileMessage(data: CustomProfileData) {
    const shared: Record<string, unknown> = { ...data };
    for (const key of ["email", "phone", "createdAt", "copiedUserId"]) delete shared[key];

    const files: File[] = [];
    for (const key of ["avatar", "banner"] as const) {
        const value = data[key];
        if (!value) continue;
        if (value.startsWith("data:")) {
            const file = dataUrlToFile(value, key);
            if (file) {
                files.push(file);
                shared[key] = `att:${file.name}`;
                continue;
            }
        }
        // Only pictures on Discord's servers can be shown to others; anything else stays on this computer
        if (!DISCORD_CDN.test(value)) delete shared[key];
    }

    let content = PREFIX + JSON.stringify(shared);
    if (content.length > MAX_CONTENT && typeof shared.bio === "string") {
        shared.bio = shared.bio.slice(0, Math.max(0, shared.bio.length - (content.length - MAX_CONTENT) - 1));
        content = PREFIX + JSON.stringify(shared);
    }
    if (content.length > MAX_CONTENT) {
        delete shared.bio;
        content = PREFIX + JSON.stringify(shared);
    }
    return { content, files, fits: content.length <= MAX_CONTENT };
}

function dataUrlToFile(url: string, name: string) {
    const match = /^data:(image\/(png|jpeg|gif|webp));base64,(.+)$/.exec(url);
    if (!match) return null;
    const bytes = Uint8Array.from(atob(match[3]), char => char.charCodeAt(0));
    return new File([bytes], `${name}.${match[2] === "jpeg" ? "jpg" : match[2]}`, { type: match[1] });
}

// ---- Reading the channel -------------------------------------------------------------------------------------------

const newer = (a: string, b: string) => a.length !== b.length ? a.length > b.length : a > b;

/** Takes a message into the cache, if it's newer than what its author had. Returns whether anything changed */
function takeMessage(message: any): boolean {
    const author = message?.author?.id;
    if (!author || typeof message.content !== "string") return false;
    if (cache.newest == null || newer(message.id, cache.newest)) cache.newest = message.id;

    const current = cache.profiles[author];
    if (current && !newer(message.id, current.m)) return false;
    const data = readProfileMessage(message.content, message.attachments);
    if (!data) return false;
    cache.profiles[author] = { m: message.id, d: data };
    return true;
}

function dropMessage(messageId: string) {
    for (const [author, entry] of Object.entries(cache.profiles)) {
        if (entry.m === messageId) {
            delete cache.profiles[author];
            return author;
        }
    }
    return null;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPage(query: Record<string, string | number>) {
    const { body } = await RestAPI.get({ url: Constants.Endpoints.MESSAGES(PROFILES_CHANNEL_ID), query: { limit: 100, ...query }, retries: 2 });
    return Array.isArray(body) ? body : [];
}

/** Reads what's new in the channel, or all of it when it's been a while, so deleted profiles drop out too */
async function sync() {
    if (!isSharingConfigured() || !isInProfilesServer()) return;
    const full = !cache.newest || Date.now() - cache.fullAt > FULL_SYNC_EVERY || cache.channel !== PROFILES_CHANNEL_ID;
    const before = new Map(Object.entries(cache.profiles).map(([id, entry]) => [id, entry.m]));

    if (full) {
        const fresh: SharedCache = { channel: PROFILES_CHANNEL_ID, newest: null, fullAt: Date.now(), profiles: {} };
        const old = cache;
        cache = fresh;
        try {
            let oldest: string | undefined;
            for (;;) {
                const page = await fetchPage(oldest ? { before: oldest } : {});
                for (const message of page) takeMessage(message);
                if (page.length < 100) break;
                oldest = page[page.length - 1].id;
                await sleep(PAGE_DELAY);
            }
        } catch (err) {
            // Keep what there was rather than showing nobody's profile
            cache = old;
            throw err;
        }
    } else {
        let after = cache.newest!;
        for (;;) {
            const page = await fetchPage({ after });
            for (const message of page) takeMessage(message);
            if (page.length < 100) break;
            after = page.reduce((max, message) => newer(message.id, max) ? message.id : max, after);
            await sleep(PAGE_DELAY);
        }
    }

    const changed = [...new Set([...before.keys(), ...Object.keys(cache.profiles)])].filter(id => before.get(id) !== cache.profiles[id]?.m);
    if (changed.length) {
        onChange(changed);
        await DataStore.set(CACHE_KEY, cache);
    }
}

function syncSoon() {
    syncing ??= sync()
        .catch(err => logger.warn("Couldn't read shared profiles", err))
        .finally(() => syncing = undefined);
    return syncing;
}

// Discord sends the channel's messages live to members, so new and changed profiles show without waiting for a sync
function onMessageCreate({ message, channelId }: any) {
    if ((channelId ?? message?.channel_id) !== PROFILES_CHANNEL_ID) return;
    if (takeMessage(message)) {
        onChange([message.author.id]);
        DataStore.set(CACHE_KEY, cache).catch(() => { });
    }
}

function onMessageDelete({ id, channelId }: any) {
    if (channelId !== PROFILES_CHANNEL_ID) return;
    const author = dropMessage(id);
    if (author) {
        onChange([author]);
        DataStore.set(CACHE_KEY, cache).catch(() => { });
    }
}

/** The channel's newest message id, as far as Discord has told this client, or null */
function latestKnown(event?: any): string | null {
    const ids: unknown[] = [ReadStateStore?.lastMessageId?.(PROFILES_CHANNEL_ID)];
    for (const channel of Array.isArray(event?.channels) ? event.channels : []) {
        if (channel?.id === PROFILES_CHANNEL_ID) ids.push(channel.lastMessageId ?? channel.last_message_id);
    }
    return (ids.filter(id => typeof id === "string" && SNOWFLAKE.test(id)) as string[])
        .reduce<string | null>((max, id) => !max || newer(id, max) ? id : max, null);
}

/**
 * In a big server Discord doesn't send every member every message, only each channel's newest message id now and then.
 * A newer one here means someone shared a profile, and reading what's new picks it up. Once per id: when the newest
 * message was deleted, the id stays behind, and it mustn't start a read every time Discord repeats it
 */
function onPassiveUpdate(event?: any) {
    const latest = latestKnown(event);
    if (!latest || latest === askedFor || (cache.newest && !newer(latest, cache.newest)) || passiveTimer) return;
    askedFor = latest;
    passiveTimer = setTimeout(() => {
        passiveTimer = undefined;
        syncSoon();
    }, 300 + Math.random() * PASSIVE_SPREAD);
}

/**
 * Loads the cached profiles, and with read, keeps them up to date from the channel. Once Discord is connected, the
 * signed-in account's profile is shared if it changed since it last was: saved before joining the server, saved on
 * another account, or saved while sharing failed
 */
export async function startSharing(changed: (userIds: string[]) => void, { read, mine }: { read: boolean; mine: typeof getMine; }) {
    onChange = changed;
    getMine = mine;
    FluxDispatcher.subscribe("CONNECTION_OPEN", sharePendingSoon);
    sharePendingSoon();
    cache = { channel: PROFILES_CHANNEL_ID, newest: null, fullAt: 0, profiles: {} };
    const saved = await DataStore.get(CACHE_KEY) as SharedCache | undefined;
    if (saved?.profiles && saved.channel === PROFILES_CHANNEL_ID) {
        // What was cached was checked when it came in, but it's checked again: the cache is a file anyone can edit
        cache = { ...saved, profiles: {} };
        for (const [id, entry] of Object.entries(saved.profiles)) {
            const data = sanitizeShared(entry?.d);
            if (data && typeof entry.m === "string") cache.profiles[id] = { m: entry.m, d: data };
        }
        if (hasSharedProfiles()) onChange(sharedProfileIds());
    }
    if (!isSharingConfigured() || !read) return;

    FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
    FluxDispatcher.subscribe("MESSAGE_UPDATE", onMessageCreate);
    FluxDispatcher.subscribe("MESSAGE_DELETE", onMessageDelete);
    FluxDispatcher.subscribe("PASSIVE_UPDATE_V2", onPassiveUpdate);
    syncTimer = setInterval(syncSoon, SYNC_EVERY);
    // Not at once: Discord has enough to do right after it starts
    setTimeout(syncSoon, 15_000);
}

export function stopSharing() {
    FluxDispatcher.unsubscribe("CONNECTION_OPEN", sharePendingSoon);
    clearTimeout(pendingTimer);
    FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
    FluxDispatcher.unsubscribe("MESSAGE_UPDATE", onMessageCreate);
    FluxDispatcher.unsubscribe("MESSAGE_DELETE", onMessageDelete);
    FluxDispatcher.unsubscribe("PASSIVE_UPDATE_V2", onPassiveUpdate);
    clearInterval(syncTimer);
    clearTimeout(passiveTimer);
    passiveTimer = undefined;
    askedFor = null;
    clearTimeout(retryTimer);
    retryAt = 0;
    const ids = sharedProfileIds();
    cache = { ...cache, profiles: {} };
    if (ids.length) onChange(ids);
}

// ---- Publishing ----------------------------------------------------------------------------------------------------

function upload(file: File) {
    return new Promise<{ filename: string; uploaded_filename: string; }>((resolve, reject) => {
        const item = new CloudUploader({ file, isThumbnail: false, platform: CloudUploadPlatform.WEB }, PROFILES_CHANNEL_ID);
        item.on("complete", () => resolve({ filename: item.filename, uploaded_filename: item.uploadedFilename }));
        item.on("error", () => reject(new Error(`Couldn't upload ${file.name}`)));
        item.upload();
    });
}

/** Short, and the same for the same profile: what was shared, without keeping a copy of it */
function fingerprint(data: CustomProfileData | null) {
    const text = data ? `${writeProfileMessage(data).content + (data.avatar?.length ?? 0)}:${data.banner?.length ?? 0}` : "";
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return `${(hash >>> 0).toString(36)}.${text.length}`;
}

/** Per account: what it last shared from here (f), and the message that holds it (m) */
type Published = Record<string, { f: string; m?: string; }>;

async function readPublished(): Promise<Published> {
    const saved = await DataStore.get(PUBLISHED_KEY) as Published | undefined;
    return saved && typeof saved === "object" ? saved : {};
}

async function rememberPublished(myId: string, data: CustomProfileData | null, messageId: string | undefined) {
    const published = await readPublished();
    published[myId] = { f: fingerprint(data), m: messageId };
    await DataStore.set(PUBLISHED_KEY, published);
}

function sharePendingSoon() {
    clearTimeout(pendingTimer);
    // The server list arrives a moment after Discord connects
    pendingTimer = setTimeout(() => sharePending().catch(err => logger.warn("Couldn't share the profile", err)), 20_000);
}

async function sharePending() {
    const mine = getMine();
    if (!mine || !isSharingConfigured() || !isInProfilesServer()) return;
    const published = await readPublished();
    // Nothing was ever shared and there's nothing to share: nothing to do
    if (!mine.data && published[mine.id] === undefined) return;
    if (published[mine.id]?.f === fingerprint(mine.data)) return;
    await publishProfile(mine.id, mine.data);
}

export type PublishResult = "published" | "not-configured" | "not-member" | "too-long" | "later" | "failed";

/**
 * Shares this account's profile: posts the new message, then deletes the ones it replaces. With null, the profile is
 * taken back. The channel's slow mode can turn a quick second save away; the newest one is sent again once it may be
 * (sharingRetryAt says when)
 */
export async function publishProfile(myId: string, data: CustomProfileData | null): Promise<PublishResult> {
    clearTimeout(retryTimer);
    retryAt = 0;
    if (!isSharingConfigured()) return "not-configured";
    if (!isInProfilesServer()) return "not-member";

    // The message the channel shows for this account, and the one this computer last posted, when that's another:
    // posted while the channel wasn't being read, or before a newer one from another computer
    const previous = new Set([cache.profiles[myId]?.m, (await readPublished())[myId]?.m].filter(Boolean) as string[]);
    let posted: string | undefined;
    try {
        if (data) {
            const { content, files, fits } = writeProfileMessage(data);
            if (!fits) return "too-long";
            const attachments = await Promise.all(files.map(upload));
            const { body } = await RestAPI.post({
                url: Constants.Endpoints.MESSAGES(PROFILES_CHANNEL_ID),
                body: {
                    content,
                    // Quiet and plain: no pings, no link previews
                    flags: (1 << 2) | (1 << 12),
                    allowed_mentions: { parse: [] },
                    attachments: attachments.map((file, index) => ({ id: String(index), ...file }))
                }
            });
            if (body?.id) {
                posted = String(body.id);
                takeMessage({ ...body, author: { id: myId } });
            }
        } else {
            delete cache.profiles[myId];
        }
        for (const id of previous) {
            if (id !== posted) await RestAPI.del({ url: Constants.Endpoints.MESSAGE(PROFILES_CHANNEL_ID, id) }).catch(() => { });
        }
        onChange([myId]);
        DataStore.set(CACHE_KEY, cache).catch(() => { });
        await rememberPublished(myId, data, posted);
        return "published";
    } catch (err: any) {
        const wait = Number(err?.body?.retry_after);
        if (err?.status === 429 && Number.isFinite(wait)) {
            const delay = (Math.max(0, wait) + 2) * 1000;
            retryAt = Date.now() + delay;
            retryTimer = setTimeout(() => publishProfile(myId, data), delay);
            return "later";
        }
        logger.error("Couldn't share the profile", err);
        return "failed";
    }
}
