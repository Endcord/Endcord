/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface Character {
    id: string;
    name: string;
    character: string;
    img: string;
    color: string;
    defaultText: { text: string; x: number; y: number; r: number; s: number; };
}

// The 359 stickers' settings are 110 KB, so they come from the sticker maker's own repository the first time the
// picker opens, the same place the pictures and fonts come from. The file is checked against its known hash
const CHARACTERS_URL = "https://raw.githubusercontent.com/TheOriginalAyaka/sekai-stickers/4c8e1cfebbd6ccb7be0da3a6adedb04d053cc6f8/src/characters.json";
const CHARACTERS_SHA256 = "39911b50ceff2422e5ae69d835d9a71d597c039e2b65619d598fae932129deda";

/** Filled by loadCharacters before the sticker maker opens */
export const characters: Character[] = [];

let loading: Promise<void> | undefined;

async function fetchCharacters() {
    const response = await fetch(CHARACTERS_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    if (hash !== CHARACTERS_SHA256) throw new Error("The sticker list doesn't match its known hash");
    characters.push(...JSON.parse(new TextDecoder().decode(bytes)) as Character[]);
}

export function loadCharacters() {
    loading ??= fetchCharacters().catch(e => {
        loading = undefined;
        throw e;
    });
    return loading;
}
