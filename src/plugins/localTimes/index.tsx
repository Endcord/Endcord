/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Message } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import definePlugin from "@utils/types";
import { LocaleStore } from "@webpack/common";

// People write "EST" all year when they mean the time in New York, so each name stands for its place, and the
// place's own clock decides whether it's summer time there that day
const ZONES: Record<string, string> = {
    ET: "America/New_York", EST: "America/New_York", EDT: "America/New_York",
    CT: "America/Chicago", CST: "America/Chicago", CDT: "America/Chicago",
    MT: "America/Denver", MST: "America/Denver", MDT: "America/Denver",
    PT: "America/Los_Angeles", PST: "America/Los_Angeles", PDT: "America/Los_Angeles",
    AKST: "America/Anchorage", AKDT: "America/Anchorage", HST: "Pacific/Honolulu",
    BRT: "America/Sao_Paulo", ART: "America/Argentina/Buenos_Aires",
    BST: "Europe/London", WET: "Europe/Lisbon", WEST: "Europe/Lisbon",
    CET: "Europe/Paris", CEST: "Europe/Paris", EET: "Europe/Athens", EEST: "Europe/Athens",
    TRT: "Europe/Istanbul", MSK: "Europe/Moscow",
    IST: "Asia/Kolkata", PKT: "Asia/Karachi", WIB: "Asia/Jakarta", ICT: "Asia/Bangkok",
    SGT: "Asia/Singapore", HKT: "Asia/Hong_Kong", PHT: "Asia/Manila", JST: "Asia/Tokyo", KST: "Asia/Seoul",
    AWST: "Australia/Perth", ACST: "Australia/Adelaide", ACDT: "Australia/Adelaide",
    AEST: "Australia/Sydney", AEDT: "Australia/Sydney", NZST: "Pacific/Auckland", NZDT: "Pacific/Auckland"
};

// Zone names only count in capitals: "9:00 art class" is not Argentina
const NAMES = `UTC|GMT|${Object.keys(ZONES).sort((a, b) => b.length - a.length).join("|")}`;
const TIME_RE = new RegExp(
    String.raw`(?<![\w:.])(\d{1,2})(?:[:.](\d{2}))?\s*([aApP])\.?[mM]\.?(?![a-zA-Z])\s*(${NAMES})(?![a-zA-Z])` +
    String.raw`|(?<![\w:.])(\d{1,2})[:.](\d{2})\s*(${NAMES})(?:\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?)?(?![\w])`,
    "g"
);
// An offset written after the 12 hour form too, like "5pm UTC+3"
const OFFSET_AFTER = /^\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?(?![\w])/;

const zoneFormats = new Map<string, Intl.DateTimeFormat>();

interface Found {
    text: string;
    at: number;
}

/** Minutes the zone is ahead of UTC at that moment */
function zoneOffset(zone: string, at: number) {
    let format = zoneFormats.get(zone);
    if (!format) zoneFormats.set(zone, format = new Intl.DateTimeFormat("en-US", {
        timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric"
    }));
    const parts = format.formatToParts(at);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
    return Math.round((Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - Math.floor(at / 60000) * 60000) / 60000);
}

/** The moment the time means, on the day the message was sent in that place */
function resolve(hour: number, minute: number, zone: string | null, fixedOffset: number, sentAt: number) {
    const offsetAt = (at: number) => zone ? zoneOffset(zone, at) : fixedOffset;
    const day = new Date(sentAt + offsetAt(sentAt) * 60000);
    const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute);
    // Once more with the offset of that hour itself, for the days the clocks change
    return wall - offsetAt(wall - offsetAt(wall) * 60000) * 60000;
}

export function findTimes(content: string, sentAt: number): Found[] {
    // Code shows times as they are written
    const text = content.replace(/```[\s\S]*?```|`[^`\n]*`|https?:\/\/\S+/g, m => " ".repeat(m.length));
    const found: Found[] = [];

    for (const m of text.matchAll(TIME_RE)) {
        const twelveHour = m[1] != null;
        let hour = Number(twelveHour ? m[1] : m[5]);
        const minute = Number((twelveHour ? m[2] : m[6]) ?? 0);
        const name = (twelveHour ? m[4] : m[7]).toUpperCase();
        let sign = m[8], offH = m[9], offM = m[10];
        let written = m[0];

        if (twelveHour) {
            const after = OFFSET_AFTER.exec(text.slice(m.index! + m[0].length));
            if (after) {
                [, sign, offH, offM] = after;
                written += after[0];
            }
            if (hour < 1 || hour > 12) continue;
            hour = hour % 12 + (m[3].toLowerCase() === "p" ? 12 : 0);
        } else if (hour > 23) continue;
        if (minute > 59) continue;

        const zone = ZONES[name] ?? null;
        let fixedOffset = 0;
        if (!zone && sign) {
            fixedOffset = (Number(offH) * 60 + Number(offM ?? 0)) * (sign === "-" ? -1 : 1);
            if (Math.abs(fixedOffset) > 14 * 60) continue;
        } else if (zone && sign) continue; // "EST+2" isn't a time anyone means

        const at = resolve(hour, minute, zone, fixedOffset, sentAt);
        // Already the reader's own time: nothing to tell them
        if (new Date(at).getHours() === hour && new Date(at).getMinutes() === minute) continue;
        if (!found.some(f => f.at === at)) found.push({ text: written.trim(), at });
        if (found.length === 3) break;
    }

    return found;
}

function LocalTimesLine({ message }: { message: Message; }) {
    if (!message.content || !/\d/.test(message.content)) return null;

    const sentAt = new Date(message.timestamp as any).getTime();
    const times = findTimes(message.content, sentAt);
    if (!times.length) return null;

    const { locale } = LocaleStore;
    const sentDay = new Date(sentAt).toDateString();
    const clock = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
    const dayAndClock = new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" });

    return (
        <div className="ec-localtimes">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </svg>
            {times.map((time, i) => (
                <span key={i}>
                    {t("{time} is {local} for you", {
                        time: time.text,
                        local: (new Date(time.at).toDateString() === sentDay ? clock : dayAndClock).format(time.at)
                    })}
                </span>
            ))}
        </div>
    );
}

export default definePlugin({
    name: "LocalTimes",
    description: "When a message has a time with a time zone in it, like \"8pm EST\" or \"14:00 UTC\", shows that time in your own time zone under it.",
    tags: ["Chat", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    renderMessageAccessory: props => <LocalTimesLine message={props.message} />
});
