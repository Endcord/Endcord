/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PlainSettings, Settings, useSettings } from "@api/Settings";
import { UserSettings } from "@api/UserSettings";
import { translateHook } from "@utils/translateHook";
import { findByProps } from "@webpack";
import { toastTranslator } from "@webpack/common/utils";

import dictEs from "./locales/es";
import dictFr from "./locales/fr";
import dictRu from "./locales/ru";
import dictTr from "./locales/tr";
import descEs from "./pluginDescriptions/es";
import descFr from "./pluginDescriptions/fr";
import descRu from "./pluginDescriptions/ru";
import descTr from "./pluginDescriptions/tr";
import type { EndcordLang, LangCode, LangTable, LangTables } from "./types";

export type { EndcordLang };

export interface LanguageOption {
    code: EndcordLang;
    nativeName: string;
    englishName: string;
    discordLocale: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
    { code: "en", nativeName: "English", englishName: "English", discordLocale: "en-US" },
    { code: "tr", nativeName: "Türkçe", englishName: "Turkish", discordLocale: "tr" },
    { code: "ru", nativeName: "Русский", englishName: "Russian", discordLocale: "ru" },
    { code: "es", nativeName: "Español", englishName: "Spanish", discordLocale: "es-ES" },
    { code: "fr", nativeName: "Français", englishName: "French", discordLocale: "fr" },
];

export function normalizeLang(code?: string | null): EndcordLang {
    if (!code) return "en";
    const lower = code.toLowerCase().trim();
    if (lower.startsWith("tr")) return "tr";
    if (lower.startsWith("ru")) return "ru";
    if (lower.startsWith("es")) return "es";
    if (lower.startsWith("fr")) return "fr";
    return "en";
}

export function getCurrentLang(): EndcordLang {
    try {
        const stored = PlainSettings?.language || Settings?.language;
        if (stored) return normalizeLang(stored);
    } catch { }
    try {
        if (typeof navigator !== "undefined" && navigator.language) {
            return normalizeLang(navigator.language);
        }
    } catch { }
    return "en";
}

export function syncDiscordLocale(lang: EndcordLang) {
    try {
        const opt = SUPPORTED_LANGUAGES.find(l => l.code === lang) ?? SUPPORTED_LANGUAGES[0];
        const targetLocale = opt.discordLocale;

        if (UserSettings) {
            for (const key in UserSettings) {
                const s = UserSettings[key];
                if (s && s.userSettingsAPIGroup === "localization" && s.userSettingsAPIName === "locale") {
                    const cur = s.getSetting?.();
                    if (cur && cur !== targetLocale) {
                        s.updateSetting?.(targetLocale);
                    }
                    break;
                }
            }
        }

        const localeMgr = findByProps("setLocale", "getLocale");
        if (localeMgr?.setLocale && localeMgr?.getLocale?.() !== targetLocale) {
            localeMgr.setLocale(targetLocale);
        }
    } catch { }
}

export function setEndcordLanguage(lang: EndcordLang) {
    const normalized = normalizeLang(lang);
    Settings.language = normalized;
    syncDiscordLocale(normalized);
}


// Each table is built the first time its language is needed: English needs none, and nobody needs all four
const dictCache: Partial<Record<LangCode, LangTable>> = {};
const getDict = (lang: LangCode) => dictCache[lang] ??= dictionaries[lang]();
const dictionaries: LangTables = { tr: dictTr, ru: dictRu, es: dictEs, fr: dictFr };

const pluginDescCache: Partial<Record<LangCode, LangTable>> = {};
const getPluginDescDict = (lang: LangCode) => pluginDescCache[lang] ??= pluginDescriptions[lang]();
const pluginDescriptions: LangTables = { tr: descTr, ru: descRu, es: descEs, fr: descFr };

export function t(key: string, vars?: Record<string, string | number>): string {
    const lang = getCurrentLang();
    let res = key;
    if (lang !== "en") {
        res = getDict(lang)[key] ?? key;
    }
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            res = res.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
    }
    return res;
}

export function tPluginDesc(pluginName: string, fallbackDescription: string): string {
    const lang = getCurrentLang();
    if (lang === "en") return fallbackDescription;
    return getPluginDescDict(lang)[pluginName] ?? getDict(lang)[fallbackDescription] ?? fallbackDescription;
}

const LANGUAGE_PATHS: ["language"] = ["language"];

export function useI18n() {
    const settings = useSettings(LANGUAGE_PATHS);
    const lang = normalizeLang(settings.language);
    return {
        lang,
        t,
        tPluginDesc,
        setLanguage: setEndcordLanguage
    };
}

// Plugins pass English text to showToast and Toasts.show; show it in the user's language when a translation exists
toastTranslator.translate = text => t(text);

// Components that i18n depends on indirectly (ErrorBoundary) translate through this hook to avoid an import cycle
translateHook.translate = t;
