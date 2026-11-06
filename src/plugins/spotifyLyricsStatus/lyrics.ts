/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Timed lyrics from lrclib.net, a free and open lyrics library that needs no account

export interface Song {
    id: string;
    name: string;
    artists: string[];
    album: string;
    /** In milliseconds */
    duration: number;
}

export interface Line {
    /** When the line starts, in milliseconds */
    at: number;
    /** null for a gap: an instrumental part, or the silence between verses */
    text: string | null;
}

interface LrcLibSong {
    trackName: string;
    artistName: string;
    duration: number;
    instrumental: boolean;
    syncedLyrics: string | null;
}

const API = "https://lrclib.net/api";

const TIME = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

/** "[01:02.50]text" lines into timed lines; a line can carry several times when it repeats */
export function parseLrc(lrc: string): Line[] {
    const lines: Line[] = [];
    for (const raw of lrc.split("\n")) {
        const times = [...raw.matchAll(TIME)];
        if (!times.length) continue;
        const text = raw.replace(TIME, "").trim();
        for (const [, minutes, seconds] of times) {
            lines.push({
                at: Math.round((Number(minutes) * 60 + Number(seconds)) * 1000),
                text: text === "" || text === "♪" ? null : text
            });
        }
    }
    return lines.sort((a, b) => a.at - b.at);
}

async function getJson<T>(path: string, params: Record<string, string>): Promise<T | null> {
    // A plain request: a custom header would need lrclib to allow it across origins first
    const response = await fetch(`${API}/${path}?${new URLSearchParams(params)}`);
    if (!response.ok) return null;
    return response.json();
}

/** Real timed lyrics, not an instrumental, a one-line test upload or untimed text */
function usable(song: LrcLibSong | null | undefined): Line[] | null {
    if (!song?.syncedLyrics || song.instrumental) return null;
    const lines = parseLrc(song.syncedLyrics);
    return lines.filter(l => l.text).length >= 4 ? lines : null;
}

const cache = new Map<string, Line[] | null>();

/** The song's timed lines, or null when the library has none (or only untimed ones) */
export async function findLyrics(song: Song): Promise<Line[] | null> {
    if (cache.has(song.id)) return cache.get(song.id)!;

    const seconds = song.duration / 1000;
    const exact = await getJson<LrcLibSong>("get", {
        track_name: song.name,
        artist_name: song.artists[0] ?? "",
        album_name: song.album,
        duration: String(Math.round(seconds))
    }).catch(() => null);

    let result = usable(exact);

    // The exact lookup needs album and length to match, and anyone can upload, so it can also be junk.
    // A search finds the same song under other albums: the one closest in length wins
    if (!result) {
        const results = await getJson<LrcLibSong[]>("search", {
            track_name: song.name,
            artist_name: song.artists[0] ?? ""
        }).catch(() => null);
        result = (results ?? [])
            .filter(r => Math.abs(r.duration - seconds) <= 4)
            .sort((a, b) => Math.abs(a.duration - seconds) - Math.abs(b.duration - seconds))
            .map(usable)
            .find(Boolean) ?? null;
    }

    cache.set(song.id, result);
    // Enough for an album or two; old songs make room
    if (cache.size > 60) cache.delete(cache.keys().next().value!);
    return result;
}
