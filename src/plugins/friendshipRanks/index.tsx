/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { BadgePosition, BadgeRarity, BadgeUserArgs, ProfileBadge } from "@api/Badges";
import { Badges } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { t } from "@utils/i18n";
import definePlugin, { OptionType } from "@utils/types";
import { RelationshipStore, Tooltip, useStateFromStores } from "@webpack/common";

interface rankInfo {
    title: string;
    description: string;
    requirement: number;
    iconSrc: string;
    /** The longer a friendship has to last for it, the fewer people have it */
    rarity: BadgeRarity;
}

const cl = classNameFactory("vc-friendship-ranks-");

const settings = definePluginSettings({
    showFriendsInChat: {
        type: OptionType.BOOLEAN,
        description: "Show a friend icon on messages from friends.",
        default: false,
    },
});

function daysSince(dateString: string): number {
    const date = new Date(dateString);
    const currentDate = new Date();

    const differenceInMs = currentDate.getTime() - date.getTime();

    const days = differenceInMs / (1000 * 60 * 60 * 24);

    return Math.floor(days);
}

const ranks: rankInfo[] =
    [
        {
            title: "Sprout",
            description: "Your friendship is just starting",
            requirement: 0,
            iconSrc: "https://equicord.org/assets/plugins/friendshipRanks/sprout.png",
            rarity: BadgeRarity.COMMON
        },
        {
            title: "Blooming",
            description: "Your friendship is getting there! (1 Month)",
            requirement: 30,
            iconSrc: "https://equicord.org/assets/plugins/friendshipRanks/blooming.png",
            rarity: BadgeRarity.COMMON
        },
        {
            title: "Burning",
            description: "Your friendship has reached terminal velocity (3 Months)",
            requirement: 90,
            iconSrc: "https://equicord.org/assets/plugins/friendshipRanks/burning.png",
            rarity: BadgeRarity.RARE
        },
        {
            title: "Fighter",
            description: "Your friendship is strong (6 Months)",
            requirement: 182.5,
            iconSrc: "https://equicord.org/assets/plugins/friendshipRanks/fighter.png",
            rarity: BadgeRarity.RARE
        },
        {
            title: "Star",
            description: "Your friendship has been going on for a WHILE (1 Year)",
            requirement: 365,
            iconSrc: "https://equicord.org/assets/plugins/friendshipRanks/star.png",
            rarity: BadgeRarity.EPIC
        },
        {
            title: "Royal",
            description: "Your friendship has gone through thick and thin- a whole 2 years!",
            requirement: 730,
            iconSrc: "https://equicord.org/assets/plugins/friendshipRanks/royal.png",
            rarity: BadgeRarity.EPIC
        },
        {
            title: "Besties",
            description: "How do you even manage this??? (5 Years)",
            requirement: 1826.25,
            iconSrc: "https://equicord.org/assets/plugins/friendshipRanks/besties.png",
            rarity: BadgeRarity.MYTHIC
        }
    ];

function friendsSince(userId: string) {
    const since = new Date(RelationshipStore.getSince(userId));
    return Number.isNaN(since.getTime()) ? undefined : since.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function shouldShowBadge(userId: string, requirement: number, index: number) {
    if (!RelationshipStore.isFriend(userId)) return false;

    const days = daysSince(RelationshipStore.getSince(userId));

    if (ranks[index + 1] == null) return days > requirement;

    return (days > requirement && days < ranks[index + 1].requirement);
}

// One entry for every rank, made once so stop() removes the very badge start() added
const FriendshipBadge: ProfileBadge = {
    id: "friendship_ranks",
    position: BadgePosition.END,
    getBadges({ userId }: BadgeUserArgs) {
        const index = ranks.findIndex((rank, i) => shouldShowBadge(userId, rank.requirement, i));
        if (index === -1) return [];

        const rank = ranks[index];
        const since = friendsSince(userId);
        const friendsSinceText = since && t("Friends since {date}", { date: since });

        return [{
            id: `friendship_ranks_badge_${index}`,
            description: rank.title,
            iconSrc: rank.iconSrc,
            rarity: rank.rarity,
            body: friendsSinceText || t("Friendship Rank"),
            details: {
                flavor: friendsSinceText,
                era: t("Friendship Rank"),
                label: t("Friendship Rank"),
                text: rank.description,
                notice: t("Only you see this badge, on the profiles of your friends.")
            },
            props: {
                style: {
                    borderRadius: "50%",
                    transform: "scale(0.9)"
                }
            }
        }];
    }
};

const FriendDecoration = ErrorBoundary.wrap(({ userId }: { userId: string; }) => {
    const isFriend = useStateFromStores([RelationshipStore], () => RelationshipStore.isFriend(userId), [userId]);
    if (!isFriend) return null;

    return (
        <Tooltip text={t("Friend")}>
            {tooltipProps => (
                <span {...tooltipProps} className={cl("decoration")}>
                    <svg className={cl("icon")} aria-hidden="true" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M13 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                        <path fill="currentColor" d="M3 5v-.75C3 3.56 3.56 3 4.25 3s1.24.56 1.33 1.25C6.12 8.65 9.46 12 13 12h1a8 8 0 0 1 8 8 2 2 0 0 1-2 2 .21.21 0 0 1-.2-.15 7.65 7.65 0 0 0-1.32-2.3c-.15-.2-.42-.06-.39.17l.25 2c.02.15-.1.28-.25.28H9a2 2 0 0 1-2-2v-2.22c0-1.57-.67-3.05-1.53-4.37A15.85 15.85 0 0 1 3 5Z" />
                    </svg>
                </span>
            )}
        </Tooltip>
    );
}, { noop: true });

export default definePlugin({
    name: "FriendshipRanks",
    description: "Adds badges showcasing how long you have been friends with a user for",
    tags: ["Friends"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,
    renderMessageDecoration({ message }) {
        if (!settings.store.showFriendsInChat || !message?.author) return null;
        return <FriendDecoration userId={message.author.id} />;
    },
    start() {
        Badges.addProfileBadge(FriendshipBadge);
    },
    stop() {
        Badges.removeProfileBadge(FriendshipBadge);
    },
});
