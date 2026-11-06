/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getIsEndcordHidden } from "@api/EndcordVisibility";
import ErrorBoundary from "@components/ErrorBoundary";
import BadgeAPIPlugin from "@plugins/_api/badges";
import type { DiscordBadgeRef } from "@plugins/_api/badges/discordBadges";
import { ComponentType, HTMLProps } from "react";

export const enum BadgePosition {
    START,
    END
}

/** How few people can have a badge, on the scale Discord uses for its own. The numbers are Discord's, but for CELESTIAL */
export const enum BadgeRarity {
    COMMON = 1,
    RARE = 2,
    EPIC = 3,
    MYTHIC = 5,
    /** Endcord's own, above anything Discord gives out: only the people who build Endcord have it */
    CELESTIAL = 6
}

/** What clicking a badge shows, laid out like Discord's own badge page */
export interface BadgeDetails {
    /** A short line under the title, like Discord's "A spoonful of knowledge" */
    flavor?: string;
    /** Where the badge comes from, or when it was given */
    era?: string;
    /** Small label above the description, such as "Endcord Badge" */
    label?: string;
    /** How the badge is earned */
    text: string;
    /** A blue info box under the description */
    notice?: string;
    action?: { text: string; onClick(): void; };
}

export interface ProfileBadge {
    /**
     * Badge id, unused by endcord, required by discord
     */
    id: string,
    /** The tooltip to show on hover. Required for image badges */
    description?: string;
    /** Custom component for the badge (tooltip not included) */
    component?: ComponentType<ProfileBadge & BadgeUserArgs>;
    /** The custom image to use */
    iconSrc?: string;
    link?: string;
    /** Action to perform when you click the badge. Without one, an image badge opens its details */
    onClick?(event: React.MouseEvent, props: ProfileBadge & BadgeUserArgs): void;
    /** Action to perform when you right click the badge */
    onContextMenu?(event: React.MouseEvent, props: BadgeUserArgs): void;
    /** Should the user display this badge? */
    shouldShow?(userInfo: BadgeUserArgs): boolean;
    /** Optional props (e.g. style) for the badge, ignored for component badges */
    props?: HTMLProps<HTMLImageElement>;
    /** Insert at start or end? */
    position?: BadgePosition;
    /** The badge name to display, Discord uses this. Required for component badges */
    key?: string;

    /** The big name on the hover card and in the details. Defaults to the description */
    title?: string;
    /** A small line above the title on the hover card */
    eyebrow?: string;
    /** The line under the title on the hover card, such as when the badge was earned */
    body?: string;
    rarity?: BadgeRarity;
    /** What clicking the badge shows. Can depend on whose profile it is */
    details?: BadgeDetails | ((userInfo: BadgeUserArgs) => BadgeDetails);
    /**
     * The Discord badge this one stands for, such as a badge CustomProfile shows. It then looks and opens exactly
     * like Discord's own, with Discord's name, rarity and wording, instead of as an Endcord badge
     */
    discordBadge?: DiscordBadgeRef;

    /**
     * Allows dynamically returning multiple badges.
     * Must not call hooks
     */
    getBadges?(userInfo: BadgeUserArgs): ProfileBadge[];
}

/** Every badge this API hands to Discord carries this, so the badge list can tell them from Discord's own */
export type AddedBadge = ProfileBadge & BadgeUserArgs & { isEndcordBadge: true; };

const Badges = new Set<ProfileBadge>();

/**
 * Functions that get the final badge list of a profile (Discord's badges plus every added badge)
 * and return it reordered or filtered. Must be pure and fast: they run on every profile render.
 */
export const BadgeListProcessors = new Set<(profile: BadgeUserArgs, badges: any[]) => any[]>();

/**
 * Register a new badge with the Badges API
 * @param badge The badge to register
 */
export function addProfileBadge(badge: ProfileBadge) {
    badge.component &&= ErrorBoundary.wrap(badge.component, { noop: true });
    Badges.add(badge);
}

/**
 * Unregister a badge from the Badges API
 * @param badge The badge to remove
 */
export function removeProfileBadge(badge: ProfileBadge) {
    return Badges.delete(badge);
}

/**
 * Inject badges into the profile badges array.
 * You probably don't need to use this.
 */
export function _getBadges(args: BadgeUserArgs) {
    const badges = [] as AddedBadge[];
    for (const badge of Badges) {
        if (badge.shouldShow && !badge.shouldShow(args)) {
            continue;
        }

        const b = badge.getBadges
            ? badge.getBadges(args).map(badge => ({
                ...args,
                ...badge,
                component: badge.component && ErrorBoundary.wrap(badge.component, { noop: true }),
                isEndcordBadge: true as const
            }))
            : [{ ...args, ...badge, isEndcordBadge: true as const }];

        if (badge.position === BadgePosition.START) {
            badges.unshift(...b);
        } else {
            badges.push(...b);
        }
    }

    const donorBadges = BadgeAPIPlugin.getDonorBadges(args.userId);
    if (donorBadges) {
        badges.unshift(
            ...donorBadges.map(badge => ({
                ...args,
                ...badge,
                isEndcordBadge: true as const
            }))
        );
    }

    // Hidden, only the badges that pass as Discord's own stay
    return getIsEndcordHidden() ? badges.filter(badge => badge.discordBadge) : badges;
}

export interface BadgeUserArgs {
    userId: string;
    guildId: string;
}
