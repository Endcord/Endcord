/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 nin0
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RendererSettings } from "@main/settings";

type SongLinkResult = {
    info?: {
        title: string;
        artist: string;
    };
    links: {
        [platform: string]: {
            url: string;
            nativeUri?: string;
        };
    };
};

export async function getTrackData(_, trackURL: string): Promise<SongLinkResult> {
    const url = new URL("https://api.song.link/v1-alpha.1/links");
    url.searchParams.set("url", trackURL);
    url.searchParams.set("userCountry", RendererSettings.store.plugins?.SongLink?.userCountry || "US");
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`song.link returned ${res.status}`);
    const raw = await res.json();
    if (!raw?.linksByPlatform) throw new Error("song.link returned no links");
    const [, entry]: any = Object.entries(raw.entitiesByUniqueId ?? {})
        .find(([key]) => !key.includes("YOUTUBE")) || [];
    const possibleTrackInfo = entry
        ? { title: (entry.title as string), artist: (entry.artistName as string) }
        : null;
    return {
        // @ts-ignore
        info: possibleTrackInfo,
        links: Object.fromEntries(Object.entries<any>(raw.linksByPlatform).map(([name, data]) => [name, {
            url: data.url,
            nativeUri: data.nativeAppUriDesktop
        }]))
    };
}
