/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Everything here runs on the message text alone: no link is looked up anywhere, so nothing leaves the computer

export type Warning =
    | { kind: "lookalike"; host: string; real: string; }
    | { kind: "alphabets"; host: string; real?: string; }
    | { kind: "hidden"; host: string; shown: string; }
    | { kind: "userinfo"; host: string; shown: string; }
    | { kind: "bait"; host: string; real: string; };

/** The sites scams pretend to be, with the domains that really are theirs */
const BRANDS: Record<string, string[]> = {
    discord: ["discord.com", "discord.gg", "discordapp.com", "discordapp.net", "discord.media", "discord.new", "discord.gift", "discord.gifts", "discord.dev", "discord.co", "discordstatus.com", "discord.store", "discordmerch.com", "dis.gd"],
    discordapp: ["discordapp.com", "discordapp.net"],
    steamcommunity: ["steamcommunity.com"],
    steampowered: ["steampowered.com"],
    steam: ["steampowered.com", "steamcommunity.com", "steamstatic.com", "steamgames.com", "steamdeck.com", "s.team"],
    paypal: ["paypal.com", "paypal.me"],
    roblox: ["roblox.com"],
    epicgames: ["epicgames.com"],
    github: ["github.com", "github.io", "githubusercontent.com"],
    twitch: ["twitch.tv"],
    youtube: ["youtube.com", "youtu.be"],
    instagram: ["instagram.com"],
    spotify: ["spotify.com"],
    netflix: ["netflix.com"],
    coinbase: ["coinbase.com"],
    binance: ["binance.com"],
    metamask: ["metamask.io"],
    opensea: ["opensea.io"],
    microsoft: ["microsoft.com", "live.com", "microsoftonline.com"],
    riotgames: ["riotgames.com"],
    minecraft: ["minecraft.net"],
    playstation: ["playstation.com"]
};
const OFFICIAL = new Set(Object.values(BRANDS).flat());
const BAIT = /nitro|gift|free|airdrop|giveaway|claim|promo|reward|verif|login|signin|auth|support|appeal|secur|bonus|drop/;
// Well known sites that have a name and one of those words in them, and are what they say they are
const KNOWN_SITES = new Set(["steamgifts.com", "steamtrades.com"]);

// Two-part endings, so "evil.co.uk" counts as one site rather than as "co.uk"
const SECOND_LEVEL = new Set(["co.uk", "org.uk", "ac.uk", "com.br", "com.tr", "com.au", "net.au", "co.jp", "co.kr", "com.mx", "com.ar", "co.in", "com.cn", "com.ru", "co.nz", "com.pl", "co.za"]);

export function siteOf(host: string) {
    const labels = host.replace(/\.$/, "").split(".");
    const take = labels.length > 2 && SECOND_LEVEL.has(labels.slice(-2).join(".")) ? 3 : 2;
    return labels.slice(-take).join(".");
}

const CONFUSABLE: Record<string, string> = {
    а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ԁ: "d", һ: "h", ӏ: "l", ѕ: "s", ԛ: "q", ԝ: "w", к: "k", м: "m", т: "t", в: "b", н: "h",
    ο: "o", α: "a", ν: "v", ρ: "p", τ: "t", ι: "i", κ: "k", χ: "x", υ: "u", ε: "e", ɩ: "i", ı: "i", ɡ: "g", ℓ: "l"
};

/** The letters a name reads as, so "dlscord", "disc0rd" and "dіscord" with a Cyrillic і all read as "discord" */
function readAs(label: string) {
    return [...label.toLowerCase()].map(c => CONFUSABLE[c] ?? c).join("")
        .replace(/-/g, "")
        .replace(/rn/g, "m").replace(/vv/g, "w").replace(/cl/g, "d")
        .replace(/[1l|!]/g, "i").replace(/0/g, "o").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/\$/g, "s");
}

function distance(a: string, b: string) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = row;
    }
    return prev[b.length];
}

/** RFC 3492, to read an "xn--" name back as the letters it shows */
export function decodePunycode(input: string): string | null {
    const BASE = 36, T_MIN = 1, T_MAX = 26;
    const adapt = (delta: number, points: number, first: boolean) => {
        delta = first ? Math.floor(delta / 700) : delta >> 1;
        delta += Math.floor(delta / points);
        let k = 0;
        for (; delta > ((BASE - T_MIN) * T_MAX) >> 1; k += BASE) delta = Math.floor(delta / (BASE - T_MIN));
        return k + Math.floor((BASE - T_MIN + 1) * delta / (delta + 38));
    };
    const digitOf = (c: number) => c >= 48 && c <= 57 ? c - 22 : c >= 97 && c <= 122 ? c - 97 : c >= 65 && c <= 90 ? c - 65 : BASE;

    const dash = input.lastIndexOf("-");
    const out = dash > 0 ? [...input.slice(0, dash)].map(c => c.codePointAt(0)!) : [];
    let n = 128, i = 0, bias = 72, pos = dash > 0 ? dash + 1 : 0;
    while (pos < input.length) {
        const old = i;
        for (let w = 1, k = BASE; ; k += BASE) {
            if (pos >= input.length) return null;
            const digit = digitOf(input.charCodeAt(pos++));
            if (digit >= BASE) return null;
            i += digit * w;
            const tt = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
            if (digit < tt) break;
            w *= BASE - tt;
        }
        bias = adapt(i - old, out.length + 1, old === 0);
        n += Math.floor(i / (out.length + 1));
        i %= out.length + 1;
        if (n > 0x10ffff) return null;
        out.splice(i++, 0, n);
    }
    return String.fromCodePoint(...out);
}

const isOfficial = (host: string) => OFFICIAL.has(siteOf(host));

function checkHost(host: string): Warning | null {
    if (isOfficial(host)) return null;
    const site = siteOf(host);

    // "discord.com.evil.example": the real name in front of someone else's site
    for (const real of OFFICIAL) {
        if (host.startsWith(`${real}.`) || host.includes(`.${real}.`)) return { kind: "lookalike", host, real };
    }

    const label = site.split(".")[0];
    const shown = label.startsWith("xn--") ? decodePunycode(label.slice(4)) : label;
    if (shown == null) return null;

    const mixes = /[a-z]/i.test(shown) && /[\u0370-\u03ff\u0400-\u04ff]/.test(shown);
    const read = readAs(shown);

    for (const [brand, domains] of Object.entries(BRANDS)) {
        const target = readAs(brand);
        // A typo of the name, keeping its first letter: "finance" isn't a misspelled "binance"
        const close = read === target || (target.length >= 6 && read[0] === target[0] && distance(read, target) <= (target.length >= 10 ? 2 : 1));
        // The real name with a different ending, like discord.ru, is often someone's fan site: only near misses count
        if (close && shown !== brand) return { kind: shown !== label || mixes ? "alphabets" : "lookalike", host, real: domains[0] };
        if (read.includes(target) && read !== target && BAIT.test(read) && !KNOWN_SITES.has(site)) return { kind: "bait", host, real: domains[0] };
    }

    if (mixes) return { kind: "alphabets", host };
    return null;
}

const LINK_RE = /\[([^\]\n]{1,200})\]\(\s*<?(https?:\/\/[^\s)>]+)>?\s*\)|(https?:\/\/[^\s<>()[\]]+)/g;
const DOMAIN_TEXT = /^(?:https?:\/\/)?((?:[\w-]+\.)+[a-z]{2,})(?:[/:?#]|$)/i;

export function checkMessage(content: string): Warning[] {
    const warnings: Warning[] = [];
    const seen = new Set<string>();
    let count = 0;

    for (const m of content.matchAll(LINK_RE)) {
        if (++count > 20 || warnings.length >= 2) break;
        const raw = m[2] ?? m[3];
        let url: URL;
        try {
            url = new URL(raw);
        } catch {
            continue;
        }
        const host = url.hostname.toLowerCase();
        if (seen.has(host)) continue;
        seen.add(host);

        // "https://discord.com@evil.example" goes to evil.example
        if (url.username || url.password) {
            const shown = raw.replace(/^https?:\/\//, "").split("@")[0];
            warnings.push({ kind: "userinfo", host, shown });
            continue;
        }

        const found = checkHost(host);
        if (found) {
            warnings.push(found);
            continue;
        }

        // [discord.com](https://evil.example): the text names a site the link doesn't go to
        const text = m[1]?.trim();
        const named = text && DOMAIN_TEXT.exec(text)?.[1]?.toLowerCase();
        if (named && siteOf(named) !== siteOf(host)) warnings.push({ kind: "hidden", host, shown: named });
    }

    return warnings;
}
