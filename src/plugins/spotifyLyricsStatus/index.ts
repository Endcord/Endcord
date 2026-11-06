/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";

import { findLyrics, Line, Song } from "./lyrics";

const logger = new Logger("SpotifyLyricsStatus");

interface CustomStatus {
    text?: string;
    emojiId?: string;
    emojiName?: string;
    expiresAtMs?: string;
    createdAtMs?: string;
}

const CustomStatusSetting = getUserSettingLazy<CustomStatus | undefined>("status", "customStatus")!;
// Discord's own Spotify store, for the song already playing when the plugin starts
const DiscordSpotify = findByPropsLazy("getActiveSocketAndDevice", "getActivity");

/** Discord cuts custom statuses at 128 characters */
const MAX_LENGTH = 128;
/** Lines go up this much early, since others see a status change a moment after it's made */
const LEAD = 400;
/** A lyric status clears itself this long after its last change, in case Discord closes while it's up */
const EXPIRES_AFTER = 10 * 60 * 1000;
/** A pause shorter than this, like the gap between two songs, keeps the lyrics up */
const PAUSE_GRACE = 4000;

const settings = definePluginSettings({
    emoji: {
        type: OptionType.STRING,
        description: "Emoji in front of each line. Leave empty for none",
        default: "🎵"
    },
    songBetweenLines: {
        type: OptionType.BOOLEAN,
        description: "Show the song's name between lines, and for songs without lyrics",
        default: true
    },
    minGap: {
        type: OptionType.SLIDER,
        description: "Least time between two status changes, in seconds. Too low and Discord starts refusing them",
        markers: [2, 3, 4, 5, 8],
        default: 3,
        stickToMarkers: true
    },
    // The status from before the lyrics, kept here so it comes back even after Discord closed mid-song
    savedStatus: {
        type: OptionType.CUSTOM,
        default: null as { status: CustomStatus | null; } | null,
        hidden: true
    }
});

let song: Song | null = null;
let playing = false;
/** Where the song was, in ms, and when that was read */
let position = 0;
let positionAt = 0;
let lines: Line[] | null = null;

let shown: string | null = null;
let lastWrite = 0;
let lineTimer: ReturnType<typeof setTimeout> | undefined;
let pauseTimer: ReturnType<typeof setTimeout> | undefined;
/** Set when the user changes their status while lyrics are up: the lyrics leave it alone until the next song */
let userTookOver = false;
let running = false;

const now = () => Date.now();
const songPosition = () => playing ? position + (now() - positionAt) : position;

function songLabel(s: Song) {
    return s.artists.length ? `${s.name} — ${s.artists.join(", ")}` : s.name;
}

/** What the status should say right now, or null for the user's own status */
function currentText(): string | null {
    if (!song || !playing) return null;

    const at = songPosition() + LEAD;
    let line: Line | undefined;
    if (lines) {
        for (const l of lines) {
            if (l.at > at) break;
            line = l;
        }
    }

    if (line?.text) return line.text;
    return settings.store.songBetweenLines ? songLabel(song) : null;
}

/** When the line after the current one starts, in ms from now */
function untilNextLine() {
    if (!lines || !playing) return undefined;
    const at = songPosition() + LEAD;
    const next = lines.find(l => l.at > at);
    return next ? next.at - at : undefined;
}

function readStatus(): CustomStatus | null {
    const status = CustomStatusSetting.getSetting();
    return status?.text || status?.emojiName || status?.emojiId && status.emojiId !== "0" ? { ...status } : null;
}

async function writeStatus(status: CustomStatus | null) {
    lastWrite = now();
    try {
        await CustomStatusSetting.updateSetting(status ?? undefined);
    } catch (e) {
        logger.warn("Discord didn't take the status change", e);
    }
}

function show(text: string) {
    if (text === shown) return;

    // The user's own status, kept once, before the first line goes up
    if (!settings.store.savedStatus) settings.store.savedStatus = { status: readStatus() };

    const emoji = settings.store.emoji.trim();
    shown = text;
    writeStatus({
        text: text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text,
        emojiId: "0",
        emojiName: emoji,
        expiresAtMs: String(now() + EXPIRES_AFTER),
        createdAtMs: String(now())
    });
}

/** Puts the user's own status back */
function restore() {
    const saved = settings.store.savedStatus;
    shown = null;
    if (!saved) return;
    settings.store.savedStatus = null;

    const { status } = saved;
    // One that ran out while the lyrics were up stays gone
    if (status?.expiresAtMs && status.expiresAtMs !== "0" && Number(status.expiresAtMs) < now()) return void writeStatus(null);
    writeStatus(status);
}

/** Notices the user changing their status by hand while a line is up */
function userChangedStatus() {
    if (shown == null) return false;
    const current = CustomStatusSetting.getSetting();
    const text = current?.text ?? "";
    return text !== (shown.length > MAX_LENGTH ? `${shown.slice(0, MAX_LENGTH - 1)}…` : shown);
}

function update() {
    clearTimeout(lineTimer);
    lineTimer = undefined;
    if (!running) return;

    if (shown != null && userChangedStatus()) {
        // Their new status is the one to keep; the lyrics wait for the next song
        userTookOver = true;
        shown = null;
        settings.store.savedStatus = null;
    }
    if (userTookOver) return;

    const text = currentText();
    if (text == null) {
        if (shown != null) restore();
    } else {
        const wait = lastWrite + settings.store.minGap * 1000 - now();
        if (text !== shown && wait > 0) {
            // Too soon after the last change: try again when allowed, with whatever line is current then
            lineTimer = setTimeout(update, wait);
            return;
        }
        show(text);
    }

    const next = untilNextLine();
    if (next != null) lineTimer = setTimeout(update, Math.max(next, 50));
}

async function setSong(next: Song | null) {
    if (next?.id === song?.id) return;
    song = next;
    lines = null;
    userTookOver = false;
    if (!next) return;

    try {
        const found = await findLyrics(next);
        // Another song may have started while this one's lyrics loaded
        if (song?.id === next.id) lines = found;
    } catch (e) {
        logger.warn("Couldn't load lyrics for", next.name, e);
    }
}

function setPlaying(isPlaying: boolean) {
    clearTimeout(pauseTimer);
    pauseTimer = undefined;
    if (isPlaying) {
        playing = true;
        return;
    }
    // Paused: the line stays a moment, since a new song often starts with a short pause
    position = songPosition();
    positionAt = now();
    pauseTimer = setTimeout(() => {
        playing = false;
        update();
    }, PAUSE_GRACE);
}

interface SpotifyTrack {
    id: string | null;
    name: string;
    duration: number;
    album?: { name?: string; };
    artists?: { name: string; }[];
}

function songFromTrack(track: SpotifyTrack | null | undefined): Song | null {
    if (!track?.name) return null;
    const artists = (track.artists ?? []).map(a => a.name).filter(Boolean);
    return {
        // Local files have no id
        id: track.id ?? `${track.name}|${artists.join(",")}`,
        name: track.name,
        artists,
        album: track.album?.name ?? "",
        duration: track.duration
    };
}

/** The Spotify activity Discord shows, turned into a song and position, for when the plugin starts mid-song */
function readCurrentActivity() {
    let activity: any;
    try {
        activity = DiscordSpotify.getActivity();
    } catch {
        return;
    }
    const { start, end } = activity?.timestamps ?? {};
    if (!activity?.details || !start || !end) return;

    return {
        song: {
            id: activity.sync_id ?? activity.details,
            name: activity.details,
            artists: String(activity.state ?? "").split("; ").filter(Boolean),
            album: activity.assets?.large_text ?? "",
            duration: end - start
        } satisfies Song,
        position: now() - start
    };
}

export default definePlugin({
    name: "SpotifyLyricsStatus",
    description: "Shows the line of the Spotify song you're listening to as your custom status, in time with the song. Needs Spotify connected to Discord",
    tags: ["Fun", "Media", "Activity"],
    authors: [Devs.rootpoi],
    dependencies: ["UserSettingsAPI"],
    settings,

    flux: {
        async SPOTIFY_PLAYER_STATE(e: { track: SpotifyTrack | null; isPlaying: boolean; position?: number; }) {
            if (!running) return;
            const next = songFromTrack(e.track);

            position = e.position ?? 0;
            positionAt = now();
            setPlaying(!!e.isPlaying && !!next);

            if (next?.id !== song?.id) {
                await setSong(next);
            }
            update();
        }
    },

    async start() {
        running = true;
        const current = readCurrentActivity();
        if (current) {
            position = current.position;
            positionAt = now();
            playing = true;
            await setSong(current.song);
            update();
        } else if (settings.store.savedStatus) {
            // Discord closed mid-song last time; nothing is playing now, so the user's status comes back
            restore();
        }
    },

    stop() {
        running = false;
        clearTimeout(lineTimer);
        clearTimeout(pauseTimer);
        lineTimer = pauseTimer = undefined;
        if (settings.store.savedStatus) restore();
        song = null;
        lines = null;
        playing = false;
        userTookOver = false;
    }
});
