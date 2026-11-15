/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Supporter badges. People who support Endcord on Ko-fi get a role in the Endcord server, post the badge they want in
// a channel only that role sees, and once the team approves it, a bot in the Endcord/badges repository writes it to
// the list there (see that repository's README). The app only reads that list: a badge posted anywhere else, #profiles
// included, is never taken, so copying someone's badge gets nobody anything

import { Logger } from "@utils/Logger";

const REPO = "https://raw.githubusercontent.com/Endcord/badges/main/";
export const SUPPORTERS_URL = `${REPO}supporters.json`;
/** Pictures only come from that repository's icons folder, named by the bot */
export const ICON_BASE = `${REPO}icons/`;
const ICON_FILE = /^\d{17,20}-[0-9a-f]{12}\.(?:png|gif|webp|jpg)$/;
const SNOWFLAKE = /^\d{17,20}$/;
/** Control characters and the invisible marks that hide text or flip its direction */
const UNPRINTABLE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;
const MAX_NAME = 32;
const MAX_PER_PERSON = 3;
/** The list changes when someone subscribes, picks a badge or stops; half an hour is soon enough */
const REFRESH_EVERY = 30 * 60 * 1000;

export interface SupporterBadge {
    name: string;
    /** Full address, under ICON_BASE */
    icon: string;
}

const logger = new Logger("SupporterBadges");
let supporters: Record<string, SupporterBadge[]> = Object.create(null);
let timer: ReturnType<typeof setInterval> | undefined;
let firstLoad: ReturnType<typeof setTimeout> | undefined;

/** The list as the bot writes it, keeping only what's well formed: `{ version: 1, supporters: { id: [{ name, icon }] } }` */
export function parseSupporters(raw: unknown): Record<string, SupporterBadge[]> {
    const out: Record<string, SupporterBadge[]> = Object.create(null);
    const list = (raw as { supporters?: unknown; } | null)?.supporters;
    if (!list || typeof list !== "object" || Array.isArray(list)) return out;

    for (const [id, badges] of Object.entries(list)) {
        if (!SNOWFLAKE.test(id) || !Array.isArray(badges)) continue;
        const kept: SupporterBadge[] = [];
        for (const badge of badges.slice(0, MAX_PER_PERSON)) {
            if (!badge || typeof badge !== "object") continue;
            const { name, icon } = badge as Record<string, unknown>;
            if (typeof name !== "string" || typeof icon !== "string" || !ICON_FILE.test(icon) || !icon.startsWith(`${id}-`)) continue;
            const clean = name.replace(UNPRINTABLE, "").trim();
            if (!clean || clean.length > MAX_NAME) continue;
            kept.push({ name: clean, icon: ICON_BASE + icon });
        }
        if (kept.length) out[id] = kept;
    }
    return out;
}

export const supporterBadgesOf = (userId: string): SupporterBadge[] => supporters[userId] ?? [];

async function load() {
    try {
        const res = await fetch(SUPPORTERS_URL, { cache: "no-cache" });
        // Not there yet, or GitHub having a moment: whatever was loaded stays
        if (!res.ok) return;
        supporters = parseSupporters(await res.json());
    } catch (e) {
        logger.debug("Couldn't load supporter badges", e);
    }
}

export function startSupporterBadges() {
    // Not at once: Discord has enough to do right after it starts
    firstLoad = setTimeout(load, 8_000);
    timer = setInterval(load, REFRESH_EVERY);
}

export function stopSupporterBadges() {
    clearTimeout(firstLoad);
    clearInterval(timer);
    supporters = Object.create(null);
}
