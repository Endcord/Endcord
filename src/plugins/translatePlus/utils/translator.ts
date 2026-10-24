/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "@endcordplugins/translatePlus/settings";

function isTokiPona(text: string) {
    const dictionary = /\b(?:leko|weka|pan|lete|linja|lipu|suli|nimi|akesi|misikeke|selo|ike|sijelo|sona|lili|pimeja|ante|jo|loje|telo|walo|kijetesantakalu|kasi|waso|wile|utala|lukin|sina|lape|ma|pilin|jasima|la|olin|pipi|meso|lawa|pi|pakala|oko|tan|ken|jaki|unpa|esun|seme|sitelen|len|kule|soko|open|ala|tenpo|lon|sinpin|pini|kokosila|mama|musi|monsi|mewika|taso|ona|mun|kiwen|tomo|mute|mi|nena|palisa|meli|laso|wawa|ale|kipisi|kulupu|ilo|lupa|nanpa|en|mu|jelo|kili|tonsi|moku|ni|kama|pu|poki|monsuta|sin|lasina|poka|soweli|sewi|elena|epiku|moli|pona|lanpan|alasa|anu|kute|uta|luka|suno|sama|awen|namako|suwi|noka|seli|mije|sike|jan|pali|tawa|inli|nasa|mani|wan|insa|nijon|nasin|kalama|ijo|toki|anpa|kala|kepeken|ko|kon|pana|tu|supa|kin|usawi|yupekosi)\b/gm;

    return (text.match(dictionary) || []).length >= text.split(/\s+/).length * 0.5;
}

function isSitelen(text: string) {
    const dictionary = /(?:\uDB86\uDD00|\uDB86\uDD01|\uDB86\uDD02|\uDB86\uDD03|\uDB86\uDD04|\uDB86\uDD05|\uDB86\uDD06|\uDB86\uDD07|\uDB86\uDD08|\uDB86\uDD09|\uDB86\uDD0A|\uDB86\uDD0B|\uDB86\uDD0C|\uDB86\uDD0D|\uDB86\uDD0E|\uDB86\uDD0F|\uDB86\uDD10|\uDB86\uDD11|\uDB86\uDD12|\uDB86\uDD13|\uDB86\uDD14|\uDB86\uDD15|\uDB86\uDD16|\uDB86\uDD17|\uDB86\uDD18|\uDB86\uDD19|\uDB86\uDD1A|\uDB86\uDD1B|\uDB86\uDD1C|\uDB86\uDD1D|\uDB86\uDD1E|\uDB86\uDD1F|\uDB86\uDD20|\uDB86\uDD21|\uDB86\uDD22|\uDB86\uDD23|\uDB86\uDD24|\uDB86\uDD25|\uDB86\uDD26|\uDB86\uDD27|\uDB86\uDD28|\uDB86\uDD29|\uDB86\uDD2A|\uDB86\uDD2B|\uDB86\uDD2C|\uDB86\uDD2D|\uDB86\uDD2E|\uDB86\uDD2F|\uDB86\uDD30|\uDB86\uDD31|\uDB86\uDD32|\uDB86\uDD33|\uDB86\uDD34|\uDB86\uDD35|\uDB86\uDD36|\uDB86\uDD37|\uDB86\uDD38|\uDB86\uDD39|\uDB86\uDD3A|\uDB86\uDD3B|\uDB86\uDD3C|\uDB86\uDD3D|\uDB86\uDD3E|\uDB86\uDD3F|\uDB86\uDD40|\uDB86\uDD41|\uDB86\uDD42|\uDB86\uDD43|\uDB86\uDD44|\uDB86\uDD45|\uDB86\uDD46|\uDB86\uDD47|\uDB86\uDD48|\uDB86\uDD49|\uDB86\uDD4A|\uDB86\uDD4B|\uDB86\uDD4C|\uDB86\uDD4D|\uDB86\uDD4E|\uDB86\uDD4F|\uDB86\uDD50|\uDB86\uDD51|\uDB86\uDD52|\uDB86\uDD53|\uDB86\uDD54|\uDB86\uDD55|\uDB86\uDD56|\uDB86\uDD57|\uDB86\uDD58|\uDB86\uDD59|\uDB86\uDD5A|\uDB86\uDD5B|\uDB86\uDD5C|\uDB86\uDD5D|\uDB86\uDD5E|\uDB86\uDD5F|\uDB86\uDD60|\uDB86\uDD61|\uDB86\uDD62|\uDB86\uDD63|\uDB86\uDD64|\uDB86\uDD65|\uDB86\uDD66|\uDB86\uDD67|\uDB86\uDD68|\uDB86\uDD69|\uDB86\uDD6A|\uDB86\uDD6B|\uDB86\uDD6C|\uDB86\uDD6D|\uDB86\uDD6E|\uDB86\uDD6F|\uDB86\uDD70|\uDB86\uDD71|\uDB86\uDD72|\uDB86\uDD73|\uDB86\uDD74|\uDB86\uDD75|\uDB86\uDD76|\uDB86\uDD77|\uDB86\uDDA0|\uDB86\uDDA1|\uDB86\uDDA2|\uDB86\uDDA3|\uDB86\uDD78|\uDB86\uDD79|\uDB86\uDD7A|\uDB86\uDD7B|\uDB86\uDD7C|\uDB86\uDD7D|\uDB86\uDD7E|\uDB86\uDD7F|\uDB86\uDD80|\uDB86\uDD81|\uDB86\uDD82|\uDB86\uDD83|\uDB86\uDD84|\uDB86\uDD85|\uDB86\uDD86|\uDB86\uDD87|\uDB86\uDD88|\uDB86\uDD90|\uDB86\uDD91|\uDB86\uDD92|\uDB86\uDD93|\uDB86\uDD94|\uDB86\uDD95|\uDB86\uDD96|\uDB86\uDD97|\uDB86\uDD98|\uDB86\uDD99|\uDB86\uDD9A|\uDB86\uDD9B|\uDB86\uDD9C|\uDB86\uDD9D)/gm;

    return dictionary.test(text);
}

function isShavian(text: string) {
    const shavianRegex = /[\u{10450}-\u{1047F}]+/u;

    return shavianRegex.test(text);
}

async function translateShavian(message: string) {
    const dictionary = await (await fetch("https://raw.githubusercontent.com/ForkPrince/TranslatePlus/322199d5fdb1a9506591c9f4a2826338b5d67e38/shavian.json")).json();

    const punctuationMap = {
        '"': "\"",
        "«": "\"",
        "»": "\"",
        ",": ",",
        "!": "!",
        "?": "?",
        ".": ".",
        "(": "(",
        ")": ")",
        "/": "/",
        ";": ";",
        ":": ":"
    };

    let translated = "";
    const words = message.split(/\s+/);

    for (let word of words) {
        let punctuationBefore = "", punctuationAfter = "";

        if (word[0] in punctuationMap) {
            punctuationBefore = punctuationMap[word[0]];
            word = word.slice(1);
        }

        if (word[word.length - 1] in punctuationMap) {
            punctuationAfter = punctuationMap[word[word.length - 1]];
            word = word.slice(0, -1);
        }

        translated += punctuationBefore;

        if (word in dictionary) translated += dictionary[word];
        else translated += word;

        translated += punctuationAfter + " ";
    }

    return translated.trim();
}

async function translateSitelen(message: string) {
    message = Array.from(message).join(" ");

    const dictionary = await (await fetch("https://raw.githubusercontent.com/ForkPrince/TranslatePlus/5ca152b134ea11433971f21b2ef8d556d4306717/sitelen-pona.json")).json();

    const sorted = Object.keys(dictionary).sort((a, b) => b.length - a.length);

    const pattern = new RegExp(`(${sorted.join("|")})`, "g");

    const translate = message.replace(pattern, match => dictionary[match]);

    return translate;
}

async function google(target: string, text: string) {
    if (!text) return { src: "", text: "" };
    try {
        const res = await fetch("https://translate-pa.googleapis.com/v1/translate?" + new URLSearchParams({
            "params.client": "gtx",
            "dataTypes": "TRANSLATION",
            "key": "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA", // some google API key
            "query.sourceLanguage": "auto",
            "query.targetLanguage": target,
            "query.text": text,
        }));
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const translate = await res.json();

        return {
            src: translate.sourceLanguage,
            text: translate.translation
        };
    } catch (error) {
        console.error("[TranslatePlus] Google Translate request failed:", error);
        return { src: "en", text: "Translation failed due to an error." };
    }
}

export async function translate(text: string): Promise<any> {
    const { target, toki, sitelen, shavian } = settings.store;

    const output = { src: "", text: "" };

    if ((isTokiPona(text) || isSitelen(text)) && (toki || sitelen)) {
        if (isSitelen(text) && sitelen) text = await translateSitelen(text);

        console.log(text);

        const translate = await (await fetch("https://aiapi.serversmp.xyz/toki", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: text,
                src: "tl",
                target: "en"
            })
        })).json();

        console.log(translate);

        output.src = "tp";
        output.text = target === "en" ? translate.translation[0] : (await google(target, translate.translation[0])).text;
    } else if (isShavian(text) && shavian) {
        const translate = await translateShavian(text);

        output.src = "sh";
        output.text = target === "en" ? translate : (await google(target, translate)).text;
    } else {
        const translate = await google(target, text);

        output.src = translate.src;
        output.text = translate.text;
    }

    return output;
}
