/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { classNameFactory } from "@utils/css";

import { settings } from "./settings";

export interface GlobalBadge {
    badge: string;
    mod: string;
    /** The badge's own name */
    key: string;
    /** The name with the mod added in front or behind, as the settings ask */
    tooltip: string;
}

export let GlobalBadges: Record<string, GlobalBadge[]> = {};
export const INVITE_LINK = "kwHCJPxp8t";
export const cl = classNameFactory("vc-global-badges-");
export const serviceMap: Record<string, string> = {
    badgevault: "BadgeVault",
    nekocord: "Nekocord",
    reviewdb: "ReviewDB",
    aero: "Aero",
    aliucord: "Aliucord",
    raincord: "Raincord",
    velocity: "Velocity",
    enmity: "Enmity",
    paicord: "Paicord",
};

const blockedMods = ["vencord", "endcord"];

export async function loadBadges() {
    const url = settings.store.apiUrl.endsWith("/") ? `${settings.store.apiUrl}users` : `${settings.store.apiUrl}/users`;
    const globalBadges = await fetch(url, { cache: "no-cache" }).then(r => r.json());
    const filteredUsers: Record<string, typeof globalBadges.users[string]> = {};

    for (const key in globalBadges.users) {
        filteredUsers[key] = globalBadges.users[key].filter(b => {
            const { mod } = b;
            if (!mod || blockedMods.includes(mod)) return false;

            const conditionalMods = {
                aero: settings.store.showAero,
                velocity: settings.store.showVelocity,
                badgevault: settings.store.showCustom,
                nekocord: settings.store.showNekocord,
                reviewdb: settings.store.showReviewDB,
                aliucord: settings.store.showAliucord,
                raincord: settings.store.showRaincord,
                enmity: settings.store.showEnmity
            };

            if (mod in conditionalMods && !conditionalMods[mod]) return false;

            return true;
        }).map(b => {
            const modFormatted = serviceMap[b.mod];
            const prefix = settings.store.showPrefix ? `${modFormatted} - ` : "";
            const suffix = settings.store.showSuffix ? ` - ${modFormatted}` : "";
            const tooltip = prefix + b.tooltip + suffix;
            return {
                ...b,
                key: b.tooltip,
                tooltip
            };
        });
    }

    GlobalBadges = filteredUsers;
}
