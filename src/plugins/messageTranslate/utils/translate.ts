/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "@plugins/messageTranslate/settings";
import { CachedTranslation, TranslateResponse } from "@plugins/messageTranslate/types";
import { Logger } from "@utils/Logger";

const logger = new Logger("MessageTranslate");

const translationCache = new Map<string, CachedTranslation>();
const inProgress = new Set<string>();
const failed = new Map<string, string>();

export function getCached(messageId: string): CachedTranslation | undefined {
    return translationCache.get(messageId);
}

export function hasFailed(messageId: string, text: string): boolean {
    return failed.get(messageId) === text;
}

export function isInProgress(messageId: string): boolean {
    return inProgress.has(messageId);
}

export function clearCache(messageId: string) {
    translationCache.delete(messageId);
    failed.delete(messageId);
}

async function fetchTranslation(text: string, targetLang: string): Promise<TranslateResponse> {
    const url = "https://translate-pa.googleapis.com/v1/translate?" + new URLSearchParams({
        "params.client": "gtx",
        "dataTypes": "TRANSLATION",
        "key": "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA", // some google API key
        "query.sourceLanguage": "auto",
        "query.targetLanguage": targetLang,
        "query.text": text,
    });
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Translation API returned ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

export async function translate(messageId: string, text: string): Promise<CachedTranslation | null> {
    if (inProgress.has(messageId)) return null;
    if (translationCache.has(messageId)) return translationCache.get(messageId)!;

    inProgress.add(messageId);

    try {
        const targetLang = settings.store.targetLanguage;
        const response = await fetchTranslation(text, targetLang);

        const confidence = response.detectedLanguages?.srclangsConfidences?.[0] ?? 1;
        if (response.sourceLanguage === targetLang || confidence < settings.store.confidenceRequirement) {
            failed.set(messageId, text);
            return null;
        }

        const translatedText = response.translation?.trim();
        if (!translatedText || translatedText === text) {
            failed.set(messageId, text);
            return null;
        }

        const entry: CachedTranslation = {
            original: text,
            translated: translatedText,
            sourceLang: response.sourceLanguage,
        };
        translationCache.set(messageId, entry);
        return entry;
    } catch (e) {
        logger.error("Translation failed", e);
        failed.set(messageId, text);
        return null;
    } finally {
        inProgress.delete(messageId);
    }
}
