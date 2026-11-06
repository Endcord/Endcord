/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Whether a host is that domain or one under it. "tenor.com" matches "media.tenor.com" but not "eviltenor.com",
 * which a plain endsWith or includes would let through
 */
export function isHostOf(host: string, domain: string) {
    const name = host.toLowerCase();
    return name === domain || name.endsWith(`.${domain}`);
}

/** The host of a URL, or "" when it isn't one */
export function hostOf(url: string) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return "";
    }
}

/** Whether a URL is on that domain or one under it */
export const isUrlOn = (url: string, domain: string) => isHostOf(hostOf(url), domain);

const MEDIA_PROTOCOLS = new Set(["https:", "http:", "blob:"]);

/** Whether a URL can be shown as a picture or video: a web address, a blob, or an inline image or video */
export function isSafeMediaUrl(url: string) {
    if (/^data:(?:image|video)\//i.test(url)) return true;
    try {
        return MEDIA_PROTOCOLS.has(new URL(url).protocol);
    } catch {
        return false;
    }
}

/** Discord's ids, so one taken from a message can't be a key such as "__proto__" */
export const isSnowflake = (id: unknown): id is string => typeof id === "string" && /^\d{1,20}$/.test(id);
