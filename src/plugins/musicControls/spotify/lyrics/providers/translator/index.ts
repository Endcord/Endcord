/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import settings from "@equicordplugins/musicControls";
import { Provider, SyncedLyric } from "@equicordplugins/musicControls/spotify/lyrics/providers/types";

// stolen from src/plugins/translate/utils.ts

interface GoogleData {
    translation: string;
    sourceLanguage: string;
}

interface GoogleRomanizeData {
    src: string;
    sentences: {
        // 🏳️‍⚧️
        trans: string;
        orig: string;
        src_translit?: string;
    }[];
}

async function googleTranslate(text: string, targetLang: string): Promise<string | null> {
    const url = "https://translate-pa.googleapis.com/v1/translate?" + new URLSearchParams({
        "params.client": "gtx",
        "dataTypes": "TRANSLATION",
        "key": "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA", // some google API key
        "query.sourceLanguage": "auto",
        "query.targetLanguage": targetLang,
        "query.text": text,
    });

    const res = await fetch(url).catch(() => null);
    if (!res?.ok)
        return null;

    const { translation }: GoogleData = await res.json();
    return translation || null;
}

// translate-pa can't romanize, so romanization still uses the old endpoint
async function googleRomanize(text: string): Promise<GoogleRomanizeData | null> {
    const url = "https://translate.googleapis.com/translate_a/single?" + new URLSearchParams({
        // see https://stackoverflow.com/a/29537590 for more params
        // holy shidd nvidia
        client: "gtx",
        // source language
        sl: "auto",
        // target language, romanization doesn't need one
        tl: "",
        // what to return, rm = romanization
        dt: "rm",
        // Send json object response instead of weird array
        dj: "1",
        source: "input",
        // query, duh
        q: text
    });

    const res = await fetch(url).catch(() => null);
    if (!res?.ok)
        return null;

    return await res.json();
}

async function processLyrics(
    lyrics: SyncedLyric[],
    targetLang: string,
    romanize: boolean
): Promise<SyncedLyric[] | null> {
    if (!lyrics) return null;

    const nonDuplicatedLyrics = lyrics.filter((lyric, index, self) =>
        self.findIndex(l => l.text === lyric.text) === index
    );

    const processedLyricsResp = await Promise.all(
        nonDuplicatedLyrics.map(async lyric => {
            if (!lyric.text) return [lyric.text, null];

            if (!romanize) return [lyric.text, await googleTranslate(lyric.text, targetLang)];

            const romanization = await googleRomanize(lyric.text);

            if (!romanization || !romanization.sentences || romanization.sentences.length === 0) return [lyric.text, null];

            return [lyric.text, romanization.sentences[0].src_translit];
        })
    );

    if (processedLyricsResp.every(mapping => mapping[1] === null)) return null;

    return lyrics.map(lyric => ({
        ...lyric,
        text: processedLyricsResp.find(mapping => mapping[0] === lyric.text)?.[1] ?? lyric.text
    }));
}

async function translateLyrics(lyrics: SyncedLyric[]) {
    return await processLyrics(lyrics, settings.store.TranslateTo, false);
}

async function romanizeLyrics(lyrics: SyncedLyric[]) {
    return await processLyrics(lyrics, "", true);
}

export const lyricsAlternativeFetchers = {
    [Provider.Translated]: translateLyrics,
    [Provider.Romanized]: romanizeLyrics
};
