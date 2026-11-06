/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Which Discord badge each CustomProfile badge stands for, so its hover card and page show Discord's own name, level,
// rarity and wording (see src/plugins/_api/badges/discordBadges.ts)

import { DiscordBadgeRef, DiscordBadgeType } from "@plugins/_api/badges/discordBadges";

import { profileBadgeId } from "./badgeManagement";

/** Every badge carries a stable key, so Discord's badge panel can reorder and hide it (see badgeManagement.ts) */
export function makeBadge(key: string, icon: string, label: string, discordBadge?: DiscordBadgeRef) {
    return { id: profileBadgeId(key), key, badge: icon, tooltip: label, icon, description: label, discordBadge };
}

// Profile flag -> Discord badge type. Active Developer has none: Discord retired it
const FLAG_BADGE_TYPES: Record<number, DiscordBadgeType> = {
    1: DiscordBadgeType.STAFF,
    2: DiscordBadgeType.PARTNER,
    4: DiscordBadgeType.HYPESQUAD,
    8: DiscordBadgeType.BUG_HUNTER_LEVEL_1,
    64: DiscordBadgeType.HYPESQUAD_HOUSE_1,
    128: DiscordBadgeType.HYPESQUAD_HOUSE_2,
    256: DiscordBadgeType.HYPESQUAD_HOUSE_3,
    512: DiscordBadgeType.EARLY_SUPPORTER,
    16384: DiscordBadgeType.BUG_HUNTER_LEVEL_2,
    131072: DiscordBadgeType.VERIFIED_DEVELOPER,
    262144: DiscordBadgeType.CERTIFIED_MODERATOR
};

const SPECIAL_BADGE_TYPES: Record<string, DiscordBadgeType> = {
    oldname: DiscordBadgeType.LEGACY_USERNAME,
    quest: DiscordBadgeType.QUEST_COMPLETED,
    meadow: DiscordBadgeType.APRIL_FOOLS_2026,
    orbs: DiscordBadgeType.ORB_PROFILE
};

const TIERED_BADGE_TYPES: Record<string, DiscordBadgeType> = {
    account_age: DiscordBadgeType.ACCOUNT_AGE,
    streaming: DiscordBadgeType.STREAMING,
    game_time: DiscordBadgeType.GAME_TIME,
    game_variety: DiscordBadgeType.GAME_VARIETY
};

export function flagBadgeRef(flag: number): DiscordBadgeRef | undefined {
    const type = FLAG_BADGE_TYPES[flag];
    return type ? { type } : undefined;
}

/** Nitro by months subscribed, 0 for the plain badge */
export const nitroBadgeRef = (months: number): DiscordBadgeRef => ({ type: DiscordBadgeType.PREMIUM_TENURE, tier: months });

type Levels = NonNullable<DiscordBadgeRef["tiers"]>;

export const boostBadgeRef = (level: number, name: string, levels: Levels): DiscordBadgeRef =>
    ({ type: DiscordBadgeType.GUILD_BOOSTER, tier: level, tierName: name, tiers: levels });

export function specialBadgeRef(id: string, giftIds: string[], giftLevels: Levels): DiscordBadgeRef | undefined {
    const gift = giftIds.indexOf(id);
    if (gift !== -1) return { type: DiscordBadgeType.GIFTING, tier: gift, tierName: giftLevels[gift].label, tiers: giftLevels };
    return id in SPECIAL_BADGE_TYPES ? { type: SPECIAL_BADGE_TYPES[id] } : undefined;
}

export function tieredBadgeRef(key: string, tier: number, name: string, levels: Levels): DiscordBadgeRef | undefined {
    const type = TIERED_BADGE_TYPES[key];
    return type ? { type, tier, tierName: name, tiers: levels } : undefined;
}
