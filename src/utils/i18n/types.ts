/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type EndcordLang = "en" | "tr" | "ru" | "es" | "fr";

export type LangCode = Exclude<EndcordLang, "en">;
export type LangTable = Record<string, string>;
export type LangTables = Record<LangCode, () => LangTable>;
