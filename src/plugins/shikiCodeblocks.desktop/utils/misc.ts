/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { resolveLang } from "@plugins/shikiCodeblocks.desktop/api/languages";
import { HighlighterProps } from "@plugins/shikiCodeblocks.desktop/components/Highlighter";
import { HljsSetting } from "@plugins/shikiCodeblocks.desktop/types";
import { classNameFactory } from "@utils/css";
import { filters, mapMangledModuleLazy } from "@webpack";

export const cl = classNameFactory("vc-shiki-");

/** Discord's own syntax highlighter, which replaced highlight.js. Languages load on demand and suspend while loading. */
export const DiscordHighlighter: {
    resolveLanguage(lang?: string): string | undefined;
    useHighlightedHtml(lang: string, code: string): string | null;
} = mapMangledModuleLazy(["highlightToHtml(", ".missingInjections", '"c++":"cpp"'], {
    resolveLanguage: filters.byCode(".toLowerCase();"),
    useHighlightedHtml: filters.byCode("highlightToHtml(")
});

/** The language id Discord's highlighter uses for `lang`, or undefined if it can't highlight it. */
export function resolveDiscordLang(lang?: string) {
    if (!lang) return undefined;
    try {
        const resolved = DiscordHighlighter.resolveLanguage(lang);
        // ANSI blocks are styled by Discord's own codeblock component, not through highlighted HTML
        return resolved === "ansi" ? undefined : resolved;
    } catch {
        return undefined;
    }
}

/** Splits highlighted HTML into lines, closing and reopening tags that span a line break. */
export function splitHighlightedLines(html: string) {
    const open: string[] = [];
    return html.split("\n").map(raw => {
        const reopened = open.map(tag => `<${tag}>`).join("") + raw;
        for (const [, closing, tag] of raw.matchAll(/<(\/?)([a-z][\w-]*)[^>]*>/gi)) {
            if (closing) open.pop();
            else open.push(tag);
        }
        return reopened + [...open].reverse().map(tag => `</${tag}>`).join("");
    });
}

export const shouldUseHljs = ({
    lang,
    tryHljs,
}: {
    lang: HighlighterProps["lang"],
    tryHljs: HljsSetting,
}) => {
    const discordLang = resolveDiscordLang(lang);
    const shikiLang = lang ? resolveLang(lang) : null;
    const langName = shikiLang?.name;

    switch (tryHljs) {
        case HljsSetting.Always:
            return true;
        case HljsSetting.Primary:
            return !!discordLang || lang === "";
        case HljsSetting.Secondary:
            return !langName && !!discordLang;
        case HljsSetting.Never:
            return false;
        default: return false;
    }
};
