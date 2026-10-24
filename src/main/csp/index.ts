/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NativeSettings } from "@main/settings";
import { session } from "electron";

type PolicyMap = Record<string, string[]>;

export const ConnectSrc = ["connect-src"];
export const ImageSrc = [...ConnectSrc, "img-src"];
export const CssSrc = ["style-src", "font-src"];
export const ImageAndCssSrc = [...ImageSrc, ...CssSrc];
export const ImageAndMediaSrc = [...ImageSrc, "media-src"];
export const ImageScriptsAndCssSrc = [...ImageAndCssSrc, "script-src", "worker-src"];

// Plugins can whitelist their own domains by importing this object in their native.ts
// script and just adding to it. But generally, you should just edit this file instead

export const CspPolicies: PolicyMap = {
    "http://localhost:*": ImageAndCssSrc,
    "http://127.0.0.1:*": ImageAndCssSrc,
    "localhost:*": ImageAndCssSrc,
    "127.0.0.1:*": ImageAndCssSrc,

    "*.github.io": ImageAndCssSrc, // GitHub pages, used by most themes
    // GitHub content and raw files: used by most themes, and for the sounds of Moyai, KeyboardSounds, Jumpscare,
    // WaitForSlot and WebcamStartNotifier (github.com/.../raw/... redirects to raw.githubusercontent.com)
    "github.com": [...ImageAndCssSrc, "media-src"],
    "raw.githubusercontent.com": [...ImageAndCssSrc, "media-src"],
    "*.gitlab.io": ImageAndCssSrc, // GitLab pages, used by some themes
    "gitlab.com": ImageAndCssSrc, // GitLab raw, used by some themes
    "*.codeberg.page": ImageAndCssSrc, // Codeberg pages, used by some themes
    "codeberg.org": ImageAndCssSrc, // Codeberg raw, used by some themes

    "*.githack.com": ImageAndCssSrc, // githack (namely raw.githack.com), used by some themes
    "jsdelivr.net": ImageAndCssSrc, // jsDelivr, used by very few themes

    "fonts.googleapis.com": ImageAndCssSrc, // Google Fonts, used by many themes; FontLoader and GifCaptioner also fetch the CSS

    "i.imgur.com": ImageSrc, // Imgur, used by some themes
    "i.ibb.co": ImageSrc, // ImgBB, used by some themes
    "i.pinimg.com": ImageSrc, // Pinterest, used by some themes
    "*.tenor.com": ImageAndMediaSrc, // Tenor: themes, GifProviderSwitcher search and previews
    "files.catbox.moe": ImageAndCssSrc, // Catbox, used by some themes

    "cdn.discordapp.com": ImageAndCssSrc, // Discord CDN, used by Endcord and some themes to load media
    "media.discordapp.net": ImageSrc, // Discord media CDN, possible alternative to Discord CDN

    // CDNs used for some things by Endcord.
    // FIXME: we really should not be using CDNs anymore
    "cdnjs.cloudflare.com": ImageScriptsAndCssSrc,
    "cdn.jsdelivr.net": ImageScriptsAndCssSrc,

    // Function Specific
    "api.github.com": ConnectSrc, // used for updating Endcord itself
    "ws.audioscrobbler.com": ConnectSrc, // Last.fm API
    "translate-pa.googleapis.com": ConnectSrc, // Google Translate API
    "translate.googleapis.com": ConnectSrc, // Google Translate romanization used by MusicControls lyrics
    "*.endcord.com": ImageSrc, // Endcord-hosted images
    "endcord.com": ConnectSrc, // Cloud settings sync (off by default); *.endcord.com does not cover the apex host
    "manti.vendicated.dev": ImageSrc, // ReviewDB API
    "decor.fieryflames.dev": ConnectSrc, // Decor API
    "ugc.decor.fieryflames.dev": ImageSrc, // Decor CDN
    "sponsor.ajay.app": ConnectSrc, // Dearrow API
    "dearrow-thumb.ajay.app": ImageSrc, // Dearrow Thumbnail CDN
    "usrbg.is-hardly.online": ImageSrc, // USRBG API
    "icons.duckduckgo.com": ImageSrc, // DuckDuckGo Favicon API (Reverse Image Search)

    "themes.equicord.org": ImageAndCssSrc, // Theme Library API, previews, and online theme CSS

    // APIs that bundled plugins call from the renderer; without these the requests fail with "Failed to fetch"
    "badges.equicord.org": ConnectSrc, // GlobalBadges
    "timezone.creations.works": ConnectSrc, // Timezones
    "cors.keiran0.workers.dev": ConnectSrc, // FileUpload, BetterAudioPlayer and MoreStickers CORS proxy
    "corsproxy.io": ConnectSrc, // GifCaptioner
    "lrclib.net": ConnectSrc, // MusicControls lyrics
    "spotify-lyrics-api-pi.vercel.app": ConnectSrc, // MusicControls lyrics
    "api.thecatapi.com": ConnectSrc, // MoreCommands
    "api.thedogapi.com": ConnectSrc, // MoreCommands
    "nekos.best": ConnectSrc, // MoreCommands
    "www.reddit.com": ConnectSrc, // MoreCommands
    "*.wikipedia.org": ConnectSrc, // WikiLookup
    "free.freeipapi.com": ConnectSrc, // VoiceServerInfo
    "huggingface.co": ConnectSrc, // VoiceMessageTranscriber model download
    "*.huggingface.co": ConnectSrc,
    "*.hf.co": ConnectSrc,
    "api.stats.fm": ConnectSrc, // RichPresence
    "dc.songspotlight.nexpid.xyz": ConnectSrc, // SongSpotlight
    "api.imgur.com": ConnectSrc, // ChannelWallpaper uploads
    "api.openai.com": ConnectSrc, // ChatGPT (user-supplied key)
    "aiapi.serversmp.xyz": ConnectSrc, // TranslatePlus AI mode
    "placeholder.nin0.dev": ImageSrc, // FavoriteAnything placeholders
    "*.tenor.co": ImageAndMediaSrc,
    "*.giphy.com": ImageAndMediaSrc,
    "*.listenbrainz.org": ConnectSrc, // MusicRichPresence
    "coverartarchive.org": ConnectSrc, // MusicRichPresence album art lookup
    "musicbrainz.org": ConnectSrc, // MusicRichPresence track lookup
    "fonts.google.com": ConnectSrc, // FontLoader, GifCaptioner and GifMaker font search
    "streaks.equicord.org": ConnectSrc, // Streaks API
    "archive.org": ConnectSrc,
    "*.archive.org": ConnectSrc,
};

const findHeader = (headers: PolicyMap, headerName: Lowercase<string>) => {
    return Object.keys(headers).find(h => h.toLowerCase() === headerName);
};

const parsePolicy = (policy: string): PolicyMap => {
    const result: PolicyMap = {};
    policy.split(";").forEach(directive => {
        const [directiveKey, ...directiveValue] = directive.trim().split(/\s+/g);
        if (directiveKey && !Object.prototype.hasOwnProperty.call(result, directiveKey)) {
            result[directiveKey] = directiveValue;
        }
    });

    return result;
};

const stringifyPolicy = (policy: PolicyMap): string =>
    Object.entries(policy)
        .filter(([, values]) => values?.length)
        .map(directive => directive.flat().join(" "))
        .join("; ");


const patchCsp = (headers: PolicyMap) => {
    const reportOnlyHeader = findHeader(headers, "content-security-policy-report-only");
    if (reportOnlyHeader)
        delete headers[reportOnlyHeader];

    const header = findHeader(headers, "content-security-policy");

    if (header) {
        const csp = parsePolicy(headers[header][0]);

        const pushDirective = (directive: string, ...values: string[]) => {
            csp[directive] ??= [...(csp["default-src"] ?? [])];
            csp[directive].push(...values);
        };

        pushDirective("style-src", "'unsafe-inline'");
        // we could make unsafe-inline safe by using strict-dynamic with a random nonce on our Endcord loader script https://content-security-policy.com/strict-dynamic/
        // HOWEVER, at the time of writing (24 Jan 2025), Discord is INSANE and also uses unsafe-inline
        // Once they stop using it, we also should
        pushDirective("script-src", "'unsafe-inline'", "'unsafe-eval'");

        for (const directive of ["style-src", "connect-src", "img-src", "font-src", "media-src", "worker-src"]) {
            pushDirective(directive, "blob:", "data:", "endcord:", "vesktop:");
        }

        for (const [host, directives] of Object.entries(NativeSettings.store.customCspRules)) {
            for (const directive of directives) {
                pushDirective(directive, host);
            }
        }

        for (const [host, directives] of Object.entries(CspPolicies)) {
            for (const directive of directives) {
                pushDirective(directive, host);
            }
        }

        headers[header] = [stringifyPolicy(csp)];
    }
};

export function initCsp() {
    session.defaultSession.webRequest.onHeadersReceived(({ responseHeaders, resourceType }, cb) => {
        if (responseHeaders) {
            if (resourceType === "mainFrame")
                patchCsp(responseHeaders);

            // Fix hosts that don't properly set the css content type, such as
            // raw.githubusercontent.com
            if (resourceType === "stylesheet") {
                const header = findHeader(responseHeaders, "content-type");
                if (header)
                    responseHeaders[header] = ["text/css"];
            }
        }

        cb({ cancel: false, responseHeaders });
    });

    // assign a noop to onHeadersReceived to prevent other mods from adding their own incompatible ones.
    // For instance, OpenAsar adds their own that doesn't fix content-type for stylesheets which makes it
    // impossible to load css from github raw despite our fix above
    session.defaultSession.webRequest.onHeadersReceived = () => { };
}

