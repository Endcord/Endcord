/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import { removeRecentStickerByPackId } from "./components";
import { Sticker, StickerPack, StickerPackMeta } from "./types";
import { Mutex } from "./utils";

const mutex = new Mutex();

const PACKS_KEY = "MoreStickers:Packs";

/**
  * Convert StickerPack to StickerPackMeta
  *
  * @param {StickerPack} sp The StickerPack to convert.
  * @return {StickerPackMeta} The sticker pack metadata.
  */
function stickerPackToMeta(sp: StickerPack): StickerPackMeta {
    return {
        id: sp.id,
        title: sp.title = sp.title === "null" ? sp.id.match(/\d+/)?.[0] ?? sp.id : sp.title,
        author: sp.author,
        logo: sp.logo,
        dynamic: sp.dynamic,
    };
}

const RESERVED_KEYS = new Set([PACKS_KEY, "MoreStickers:RecentStickers"]);

function isHttpsUrl(v: unknown): v is string {
    try { return typeof v === "string" && new URL(v).protocol === "https:"; } catch { return false; }
}

function cleanSticker(raw: any, packId: string): Sticker {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || typeof raw.title !== "string" || !isHttpsUrl(raw.image))
        throw new Error("Invalid sticker in sticker pack");
    return {
        id: raw.id,
        image: raw.image,
        title: raw.title,
        stickerPackId: packId,
        ...(typeof raw.filename === "string" && { filename: raw.filename }),
        ...(typeof raw.isAnimated === "boolean" && { isAnimated: raw.isAnimated }),
    };
}

/**
 * Checks a sticker pack read from a file and rebuilds it from known fields only. The pack id is its DataStore key,
 * which is shared with every other plugin, so it has to be one of MoreStickers' own pack keys
 */
export function sanitizeStickerPack(raw: any): StickerPack {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid sticker pack");
    const { id } = raw;
    if (typeof id !== "string" || !/^MoreStickers:[\w:-]*Pack:[\w-]+$/.test(id) || RESERVED_KEYS.has(id))
        throw new Error("Invalid sticker pack id");
    if (typeof raw.title !== "string" || !Array.isArray(raw.stickers)) throw new Error("Invalid sticker pack");
    const author = raw.author && typeof raw.author === "object" && typeof raw.author.name === "string"
        ? { name: raw.author.name, ...(isHttpsUrl(raw.author.url) && { url: raw.author.url }) }
        : undefined;
    return {
        id,
        title: raw.title,
        author,
        logo: cleanSticker(raw.logo, id),
        stickers: raw.stickers.map((s: any) => cleanSticker(s, id)),
    };
}

/**
  * Save a sticker pack to the DataStore
  *
  * @param {StickerPack} sp The StickerPack to save.
  * @return {Promise<void>}
  */
export async function saveStickerPack(sp: StickerPack, packsKey: string = PACKS_KEY): Promise<void> {
    const meta = stickerPackToMeta(sp);

    await Promise.all([
        DataStore.set(`${sp.id}`, sp),
        (async () => {
            const unlock = await mutex.lock();

            try {
                let packs = (await DataStore.get(packsKey) ?? null);
                if (packs?.some(p => p.id === sp.id)) {
                    packs = packs.map(p => p.id === sp.id ? meta : p);
                } else {
                    packs = packs === null ? [meta] : [...packs, meta];
                }
                await DataStore.set(packsKey, packs);
            } finally {
                unlock();
            }
        })()
    ]);
}

/**
  * Get sticker packs' metadata from the DataStore
  *
  * @return {Promise<StickerPackMeta[]>}
  */
export async function getStickerPackMetas(packsKey: string | undefined = PACKS_KEY): Promise<StickerPackMeta[]> {
    const packs = (await DataStore.get(packsKey)) ?? null as (StickerPackMeta[] | null);
    return packs ?? [];
}

/**
 * Get a sticker pack from the DataStore
 *
 * @param {string} id The id of the sticker pack.
 * @return {Promise<StickerPack | null>}
 * */
export async function getStickerPack(id: string): Promise<StickerPack | null> {
    return (await DataStore.get(id)) ?? null as StickerPack | null;
}

/**
 * Delete a sticker pack from the DataStore
 *
 * @param {string} id The id of the sticker pack.
 * @return {Promise<void>}
 * */
export async function deleteStickerPack(id: string, packsKey: string = PACKS_KEY): Promise<void> {
    await Promise.all([
        DataStore.del(id),
        removeRecentStickerByPackId(id),
        (async () => {
            const unlock = await mutex.lock();

            try {
                const packs = (await DataStore.get(packsKey) ?? null);
                if (packs === null) return;
                await DataStore.set(packsKey, packs.filter(p => p.id !== id));
            } finally {
                unlock();
            }
        })()
    ]);
}

