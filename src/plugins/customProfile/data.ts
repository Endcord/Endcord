/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DisplayNameStyles, NameplateData } from "./collectibles";

export interface CustomProfileData {
    username?: string;
    globalName?: string;
    avatar?: string;
    banner?: string;
    bio?: string;
    accentColor?: number;
    accentColor2?: number;
    pronouns?: string;
    badgeFlags?: number;
    createdAt?: string;
    nitro?: boolean;
    nitroLevel?: number;
    /** When the Nitro badge says they subscribed, as YYYY-MM-DD; without it, as long ago as the level takes */
    nitroSince?: string;
    boostMonths?: number;
    email?: string;
    phone?: string;
    customBadgeIds?: string[];
    /** Tier index per tiered badge type, see TIERED_BADGES */
    tieredBadges?: Record<string, number>;
    oldName?: string;
    decorationAsset?: string;
    profileEffectId?: string;
    profileFrameId?: string;
    nameplate?: NameplateData;
    displayNameStyles?: DisplayNameStyles;
    copiedUserId?: string;
}

export interface SavedPreset {
    name: string;
    data: CustomProfileData;
}

export function hasAnyCustomData(pd: CustomProfileData | null | undefined): boolean {
    if (!pd) return false;
    if (pd.username) return true;
    if (pd.globalName) return true;
    if (pd.avatar) return true;
    if (pd.banner) return true;
    if (pd.bio) return true;
    if (pd.pronouns) return true;
    if (pd.accentColor != null) return true;
    if (pd.accentColor2 != null) return true;
    if (pd.profileEffectId) return true;
    if (pd.profileFrameId) return true;
    if (pd.decorationAsset) return true;
    if (pd.nameplate) return true;
    if (pd.displayNameStyles) return true;
    if (pd.badgeFlags != null && pd.badgeFlags > 0) return true;
    if (pd.customBadgeIds && pd.customBadgeIds.length > 0) return true;
    if (pd.tieredBadges && Object.keys(pd.tieredBadges).length > 0) return true;
    if (pd.nitroLevel != null && pd.nitroLevel >= 0) return true;
    if (pd.boostMonths != null && pd.boostMonths >= 0) return true;
    if (pd.nitro) return true;
    if (pd.oldName) return true;
    if (pd.createdAt) return true;
    return false;
}

export function hasCustomBadgesConfigured(pd: CustomProfileData | null | undefined): boolean {
    if (!pd) return false;
    if (pd.badgeFlags != null && pd.badgeFlags > 0) return true;
    if (pd.customBadgeIds && pd.customBadgeIds.length > 0) return true;
    if (pd.tieredBadges && Object.keys(pd.tieredBadges).length > 0) return true;
    if (pd.nitroLevel != null && pd.nitroLevel >= 0) return true;
    if (pd.boostMonths != null && pd.boostMonths >= 0) return true;
    return false;
}
