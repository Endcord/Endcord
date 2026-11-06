/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { AddedBadge } from "@api/Badges";
import ErrorBoundary from "@components/ErrorBoundary";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import { findComponentByCodeLazy } from "@webpack";
import type { ReactElement } from "react";

import { describeDiscordBadge, requestCatalog } from "./discordBadges";

// Discord's own hover card for badges: the big picture, the name and a line under it, as on Nitro badges.
// Using Discord's component means it moves, sizes and themes exactly like the cards around it
const RichBadgeTooltip = findComponentByCodeLazy('"mini-premium-tooltip"');

// Discord's badge cards show no rarity: that is for the badge's page
interface Card {
    title: string;
    eyebrow?: string;
    body?: string;
    variant?: "nitro" | "default";
    image?: string;
    animated?: boolean;
}

function endcordCard(badge: AddedBadge): Card | null {
    const title = badge.title ?? badge.description;
    if (!title) return null;

    return { title, eyebrow: badge.eyebrow, body: badge.body ?? t("Shown by Endcord"), image: badge.iconSrc };
}

function getRichTooltip() {
    try {
        return RichBadgeTooltip.$$endcordGetWrappedComponent();
    } catch (e) {
        new Logger("BadgeAPI").error("Discord's badge hover card wasn't found", e);
        return undefined;
    }
}

/**
 * The badge with Discord's rich hover card around it, or null to keep Discord's plain tooltip: for a badge drawn by a
 * component, one Discord gives its own tooltip, or when Discord's card can't be found
 */
export function renderBadgeHoverCard(badge: any, anchor: ReactElement<any>, tooltipText: unknown, forceOpen: boolean, key: string) {
    if (!badge || forceOpen || badge.component) return null;

    const isOwn = badge.isEndcordBadge === true;
    if (!isOwn && typeof tooltipText !== "string") return null;

    const { userId } = badge as { userId: string; };
    // Discord's badges, and badges that stand for one, get what Discord itself shows for them
    const view = describeDiscordBadge(badge, userId);
    const card: Card | null = view
        // The moving art where Discord has one, as its own cards play it
        ? { title: view.title, eyebrow: view.eyebrow, body: view.body, variant: view.nitro ? "nitro" : "default", image: view.animated ?? view.image, animated: !!view.animated }
        : isOwn ? endcordCard(badge) : typeof tooltipText === "string" ? { title: tooltipText } : null;

    const image = card?.image ?? badge.iconSrc ?? anchor?.props?.children?.props?.src;
    if (!card || !image) return null;

    const Tooltip = getRichTooltip();
    if (!Tooltip) return null;

    return (
        <ErrorBoundary key={key} fallback={() => anchor}>
            <Tooltip
                title={card.title}
                eyebrow={card.eyebrow}
                body={card.body}
                variant={card.variant ?? "default"}
                isAnimated={card.animated}
                badgeImage={image}
                badgeName={card.title}
                // Discord reads the profile's badge catalog when a card first shows, so this does too
                onShow={() => view && !badge.discordBadge && requestCatalog(userId)}
            >
                {anchor}
            </Tooltip>
        </ErrorBoundary>
    );
}
