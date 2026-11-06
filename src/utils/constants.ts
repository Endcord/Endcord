/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const ENDCORD_GUILD_ID = "1543323763695820942";
export const SUPPORT_CHANNEL_ID = "1543359285503721573";

const platform = navigator.platform.toLowerCase();
export const IS_WINDOWS = platform.startsWith("win");
export const IS_MAC = platform.startsWith("mac");
export const IS_LINUX = platform.startsWith("linux");

export interface Dev {
    name: string;
    id: bigint;
    badge?: boolean;
}

export const Devs: Record<string, Dev> & {
    ewlle: Dev;
    rootpoi: Dev;
    kraethis: Dev;
    Ven: Dev;
    Vendicated: Dev;
} = new Proxy({
    ewlle: { name: "ewlle", id: 1097880625513496586n },
    rootpoi: { name: "rootpoi", id: 1390609041897554050n },
    kraethis: { name: "kraethis", id: 904384828143706164n },
    Sharp: { name: "ewlle", id: 1097880625513496586n },
    vpg: { name: "vpg", id: 1374807824479162369n },
    Ven: { name: "rootpoi", id: 1390609041897554050n },
    Vendicated: { name: "rootpoi", id: 1390609041897554050n }
} as any, {
    get: (target, prop) => {
        if (typeof prop === "string" && prop in target) {
            return target[prop];
        }
        return {
            name: typeof prop === "string" ? prop : String(prop),
            id: 1390609041897554050n
        };
    }
});

export const DevsById = /* #__PURE__*/ (() =>
    Object.freeze(Object.fromEntries(
        Object.entries({
            rootpoi: { name: "rootpoi", id: 1390609041897554050n },
            ewlle: { name: "ewlle", id: 1097880625513496586n },
            kraethis: { name: "kraethis", id: 904384828143706164n },
            vpg: { name: "vpg", id: 1374807824479162369n }
        })
            .filter(d => d[1].id !== 0n)
            .map(([_, v]) => [v.id, v] as const)
    ))
)() as Record<string, Dev>;

export const EndcordDevs = Devs;



export const GUILD_IDS = [ENDCORD_GUILD_ID];
