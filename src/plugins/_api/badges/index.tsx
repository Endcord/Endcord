/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./fixDiscordBadgePadding.css";

import { _getBadges, AddedBadge, addProfileBadge, BadgeListProcessors, BadgePosition, BadgeRarity, BadgeUserArgs, ProfileBadge, removeProfileBadge } from "@api/Badges";
import { Settings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs, DevsById } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import { EndcordDeveloperIds, isEndcordDeveloper, isPluginDev } from "@utils/misc";
import definePlugin from "@utils/types";
import { ContextMenuApi, Menu, UserStore } from "@webpack/common";
import type { ReactElement } from "react";

import { CONTRIBUTOR_ICON, DEVELOPER_ICON } from "./badgeArt";
import { openBadgeDetails } from "./BadgeDetails";
import { renderBadgeHoverCard } from "./BadgeHoverCard";
import { describeDiscordBadge, learnBadges, loadLearnedBadges, rememberProfileBadges, requestCatalog } from "./discordBadges";

let DonorBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;
const withOwner = new WeakMap<object, any>();

function BadgeContextMenu({ badge }: { badge: Omit<ProfileBadge, "id"> & BadgeUserArgs; }) {
    return (
        <Menu.Menu
            navId="vc-badge-context"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Badge Options"
        >
            {badge.description && (
                <Menu.MenuItem
                    id="vc-badge-copy-name"
                    label={t("Copy Badge Name")}
                    action={() => copyWithToast(badge.description!)}
                />
            )}
            {badge.iconSrc && (
                <Menu.MenuItem
                    id="vc-badge-copy-link"
                    label={t("Copy Badge Image Link")}
                    action={() => copyWithToast(badge.iconSrc!)}
                />
            )}
        </Menu.Menu>
    );
}

function viewPlugins(userId: string) {
    const user = UserStore.getUser(userId);
    if (!user) return;

    // Required when it's needed: the dialog lists every plugin, and the plugin list loads this file
    const { openContributorModal } = require("@components/settings/tabs/plugins/ContributorModal") as typeof import("@components/settings/tabs/plugins/ContributorModal");
    openContributorModal(user);
}

function endcordBadge(id: string, icon: string, title: string, flavor: string, text: () => string, shouldShow: (userId: string) => boolean): ProfileBadge {
    return {
        id,
        position: BadgePosition.START,
        shouldShow: ({ userId }) => !Settings.hideContributorBadge && shouldShow(userId),
        getBadges: () => [{
            id,
            description: t(title),
            title: t(title),
            body: t(flavor),
            rarity: BadgeRarity.CELESTIAL,
            iconSrc: icon,
            details: ({ userId }) => ({
                flavor: t(flavor),
                era: "Endcord",
                label: t("Endcord Badge"),
                text: text(),
                notice: t("Only people who use Endcord can see this badge."),
                action: { text: t("View their plugins"), onClick: () => viewPlugins(userId) }
            })
        }]
    };
}

// The people who make Endcord, and everyone who has helped build it. There are only a handful of each, so both sit
// above anything Discord gives out
const DeveloperBadge = endcordBadge("endcord_developer", DEVELOPER_ICON, "Endcord Developer", "Makes Endcord",
    () => t("Given to the people who make Endcord. {count} people have it.", { count: EndcordDeveloperIds.length }), isEndcordDeveloper);
const ContributorBadge = endcordBadge("endcord_contributor", CONTRIBUTOR_ICON, "Endcord Contributor", "Helped build Endcord",
    () => t("Given to the people who helped build Endcord. {count} people have it.", { count: Object.keys(DevsById).length }), isPluginDev);

export default definePlugin({
    name: "BadgeAPI",
    description: "API to add badges to users",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    required: true,
    patches: [
        {
            find: "#{intl::PROFILE_USER_BADGES}",
            replacement: [
                {
                    match: /alt:" ","aria-hidden":!0,src:.{0,50}(\i).iconSrc/,
                    replace: "...$1.props,$&"
                },
                // Every badge Discord would give a plain tooltip gets Discord's own rich hover card instead,
                // the one Nitro badges have: the big picture, the name and a line under it
                {
                    match: /return(\(0,\i\.jsx\)\(\i\.\i,\{__unsupportedReactNodeAsText:(\i),forceOpen:(\i),delay:(?:\i\.\i|\d+),ariaHidden:!0,children:(\i)\},(`\$\{(\i)\.id\}-\$\{\i\}`)\))/,
                    replace: "return $self.renderBadgeHoverCard($6,$4,$2,$3,$5)??$1"
                },
                // With Discord's badge pages on, it would look ours up in its own catalog and find nothing,
                // so ours take the path above and keep their own name, rarity and details
                {
                    match: /if\((\i)\)(return\(0,\i\.jsx\)\(\i,\{shouldShow:!?\i,legacyBadgeId:(\i)\.id)/,
                    replace: "if($1&&!$3.isEndcordBadge)$2"
                },
                // Nitro's levels get the small card Discord's badge pages use, with the level's art, name and
                // rarity, instead of the big promotional one
                {
                    match: /(badgeId:\i\.id,targetElementRef:\i,)mode:"tooltip"/,
                    replace: '$1mode:"mini-tooltip"'
                },
                // Clicking one of Discord's badges opens its page, as it does with Discord's badge pages on
                {
                    match: /(\i)\.preventDefault\(\),\(0,\i\.openBadgeDirectoryModal\)\(\{initialBadgeId:\(0,\i\.\i\)\((\i)\.id\),targetUserId:(\i)\?\.userId.{0,80}?\}\);return\}/,
                    replace: "$&if($self.openDiscordBadgePage($2,$3?.userId,$1))return;"
                },
                // Path with 2026-04-badge-discovery OFF
                {
                    match: /(?<=forceOpen:.{0,40}?ariaHidden:!0,)children:(?=.{0,50}?(\i)\.id)/,
                    replace: "children:$1.component?$self.renderBadgeComponent({...$1}):"
                },
                // Path with 2026-04-badge-discovery ON
                {
                    match: /(?<=fallbackIconSrc:.{0,50}?)children:(?=.{0,50}?(\i)\.id)/,
                    replace: "children:$1.component?$self.renderBadgeComponent({...$1}):"
                },
                // handle onClick and onContextMenu
                {
                    match: /href:(\i)\.link/,
                    replace: "...$self.getBadgeMouseEventHandlers($1),$&"
                }
            ]
        },
        {
            find: "getLegacyUsername(){",
            replacement: {
                // Keep Discord's list under a new name, add our badges to it, and let plugins reorder or filter the result
                match: /getBadges\(\)\{(.{0,100}?)return\[/,
                replace: "getBadges(){return $self.processBadges(this,this.ecUnprocessedBadges())}ecUnprocessedBadges(){$1return[...$self.getBadges(this),"
            }
        }
    ],

    start() {
        addProfileBadge(DeveloperBadge);
        addProfileBadge(ContributorBadge);
        loadLearnedBadges().catch(e => new Logger("BadgeAPI").error("Couldn't load the badges Discord described before", e));
    },

    stop() {
        removeProfileBadge(DeveloperBadge);
        removeProfileBadge(ContributorBadge);
    },

    flux: {
        // Whatever Discord's servers say about badges is kept, so they read right everywhere afterwards
        BADGE_DIRECTORY_FETCH_SUCCESS({ badges }: { badges: unknown; }) {
            learnBadges(badges);
        },
        BADGE_FETCH_SUCCESS({ badge }: { badge: unknown; }) {
            learnBadges([badge]);
        },
        BADGE_SUMMARY_FETCH_SUCCESS({ badge }: { badge: unknown; }) {
            learnBadges([badge]);
        },
        CONNECTION_OPEN() {
            // The account's own catalog describes every badge it can earn, with each level's rarity
            setTimeout(() => requestCatalog(UserStore.getCurrentUser()?.id), 10_000);
        }
    },

    // for access from the console or other plugins
    get DonorBadges() {
        return DonorBadges;
    },

    set DonorBadges(val: any) {
        DonorBadges = val;
    },

    getBadges(profile: { userId: string; guildId: string; }) {
        if (!profile) return [];

        try {
            return _getBadges(profile);
        } catch (e) {
            new Logger("BadgeAPI#getBadges").error(e);
            return [];
        }
    },

    processBadges(profile: { userId: string; guildId: string; }, badges: any[]) {
        if (!profile) return badges;

        for (const process of BadgeListProcessors) {
            try {
                badges = process(profile, badges) ?? badges;
            } catch (e) {
                new Logger("BadgeAPI#processBadges").error(e);
            }
        }

        // Discord's own badges don't say whose they are, and their hover card and page read that profile's catalog.
        // The copies are kept, so a badge stays the same object from one render to the next
        badges = badges.map(badge => {
            if (!badge || typeof badge !== "object" || badge.userId) return badge;

            let copy = withOwner.get(badge);
            if (copy?.userId !== profile.userId) withOwner.set(badge, copy = { ...badge, userId: profile.userId });
            return copy;
        });

        // Endcord's badges always lead, the developer one first
        const ours = [DeveloperBadge.id, ContributorBadge.id].map(id => badges.find(badge => badge?.id === id)).filter(Boolean);
        if (ours.length) badges = [...ours, ...badges.filter(badge => !ours.includes(badge))];

        rememberProfileBadges(profile.userId, badges);
        return badges;
    },

    renderBadgeComponent: ErrorBoundary.wrap((badge: ProfileBadge & BadgeUserArgs) => {
        const Component = badge.component!;
        return <Component {...badge} />;
    }, { noop: true }),

    renderBadgeHoverCard(badge: any, anchor: ReactElement<any>, tooltipText: unknown, forceOpen: boolean, key: string) {
        try {
            return renderBadgeHoverCard(badge, anchor, tooltipText, forceOpen, key);
        } catch (e) {
            new Logger("BadgeAPI#renderBadgeHoverCard").error(e);
            return null;
        }
    },

    /** Opens the page for one of Discord's badges. Returns false for anything Discord should handle itself */
    openDiscordBadgePage(badge: any, userId: string | undefined, event: React.MouseEvent) {
        try {
            if (!badge || badge.isEndcordBadge || !describeDiscordBadge(badge, userId ?? badge.userId)) return false;

            event.preventDefault();
            openBadgeDetails({ ...badge, userId: userId ?? badge.userId });
            return true;
        } catch (e) {
            new Logger("BadgeAPI#openDiscordBadgePage").error(e);
            return false;
        }
    },

    getBadgeMouseEventHandlers(badge: ProfileBadge & BadgeUserArgs) {
        const handlers = {} as Record<string, (e: React.MouseEvent) => void>;

        if (!badge) return handlers;

        const { onClick, onContextMenu } = badge;

        if (onClick) handlers.onClick = e => onClick(e, badge);
        // A badge Endcord added opens its details, like Discord's own badges open their page
        else if ((badge as AddedBadge).isEndcordBadge && badge.iconSrc && !badge.link) handlers.onClick = e => {
            e.preventDefault();
            openBadgeDetails(badge as AddedBadge);
        };
        if (onContextMenu) handlers.onContextMenu = e => onContextMenu(e, badge);

        return handlers;
    },

    getDonorBadges(userId: string) {
        const userBadges = DonorBadges[userId];
        if (!userBadges) return [];

        const list = Array.isArray(userBadges) ? userBadges : ((userBadges as any)?.badges || []);
        return list.map((badge: any, idx: number) => ({
            id: badge.id ?? `endcord_donor_badge_${idx}`,
            iconSrc: badge.badge || badge.icon || badge.iconSrc,
            description: badge.tooltip || badge.description || "Custom Badge",
            discordBadge: badge.discordBadge,
            position: BadgePosition.START,
            props: {
                style: {
                    background: "transparent",
                    backgroundColor: "transparent",
                    transform: "scale(1.05)"
                }
            },
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            }
        } satisfies ProfileBadge));
    }
});
