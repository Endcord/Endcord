/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const ALLOWED_PROTOCOLS = [
    "https:",
    "http:",
    "steam:",
    "spotify:",
    "com.epicgames.launcher:",
    "tidal:",
    "itunes:",
];
const LINK_PROTOCOLS = ["https:", "http:", "mailto:"];

// App protocols hand the URL to that app's command line, where these characters could start a new argument
const UNSAFE_APP_URL_CHARS = /[\s"`<>\\^|]/;
// Steam's run commands also accept launch options, which can start other programs
const SAFE_STEAM_URL = /^steam:\/\/(openurl\/https:\/\/|(run|rungameid)\/\d+\/?$)/;

export function isSafeExternalUrl(url: string) {
    try {
        var { protocol } = new URL(url);
    } catch {
        return false;
    }

    if (!ALLOWED_PROTOCOLS.includes(protocol)) return false;
    if (protocol === "https:" || protocol === "http:") return true;
    if (protocol === "steam:" && !SAFE_STEAM_URL.test(url)) return false;

    return !UNSAFE_APP_URL_CHARS.test(url);
}

/**
 * For hrefs from theme files, third-party APIs and settings. The browser extension removes Discord's CSP,
 * so a javascript: link would run inside Discord there. Parsing also catches tricks like "java\tscript:"
 */
export function isSafeLink(href: string | null | undefined) {
    try {
        return LINK_PROTOCOLS.includes(new URL(href ?? "", "https://discord.com/").protocol);
    } catch {
        return false;
    }
}
