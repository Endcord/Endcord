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

const MAX_CONCURRENT = 4;
let active = 0;
const waiting: (() => void)[] = [];
let rateLimitedUntil = 0;

class RateLimitError extends Error { }

async function acquireSlot() {
    if (active < MAX_CONCURRENT) {
        active++;
        return;
    }
    await new Promise<void>(resolve => waiting.push(resolve));
}

function releaseSlot() {
    const next = waiting.shift();
    if (next) next();
    else active--;
}

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
    const url = `https://translate-pa.googleapis.com/v1/translate?${new URLSearchParams({
        "params.client": "gtx",
        "dataTypes": "TRANSLATION",
        "key": "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA", // some google API key
        "query.sourceLanguage": "auto",
        "query.targetLanguage": targetLang,
        "query.text": text,
    })}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });

    if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const alreadyLimited = Date.now() < rateLimitedUntil;
        rateLimitedUntil = Date.now() + (retryAfter > 0 ? Math.min(retryAfter, 600) * 1000 : 60_000);
        if (!alreadyLimited) logger.warn(`Rate limited, pausing translations until ${new Date(rateLimitedUntil).toLocaleTimeString()}`);
        throw new RateLimitError("Translation API returned 429");
    }
    if (!response.ok) {
        throw new Error(`Translation API returned ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

export async function translate(messageId: string, text: string): Promise<CachedTranslation | null> {
    if (inProgress.has(messageId)) return null;
    if (translationCache.has(messageId)) return translationCache.get(messageId)!;
    if (Date.now() < rateLimitedUntil) return null;

    inProgress.add(messageId);
    await acquireSlot();

    try {
        // Requests queued before a 429 are dropped; the message is retried on a later render.
        if (Date.now() < rateLimitedUntil) return null;
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
        if (e instanceof RateLimitError) return null;
        logger.error("Translation failed", e);
        failed.set(messageId, text);
        return null;
    } finally {
        releaseSlot();
        inProgress.delete(messageId);
    }
}
