/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Message } from "@endcord/discord-types";

export interface TranslateResponse {
    translation?: string;
    sourceLanguage: string;
    detectedLanguages?: {
        srclangs?: string[];
        srclangsConfidences?: number[];
    };
}

export interface CachedTranslation {
    original: string;
    translated: string;
    sourceLang: string;
}

export type MessageWithContent = Message & { content: string; };
