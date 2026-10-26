/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./fixDiscordBadgePadding.css";

import { _getBadges, BadgeListProcessors, BadgePosition, BadgeUserArgs, ProfileBadge } from "@api/Badges";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { ContextMenuApi, Menu } from "@webpack/common";

let DonorBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;

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
        if (!profile || !BadgeListProcessors.size) return badges;

        for (const process of BadgeListProcessors) {
            try {
                badges = process(profile, badges) ?? badges;
            } catch (e) {
                new Logger("BadgeAPI#processBadges").error(e);
            }
        }
        return badges;
    },

    renderBadgeComponent: ErrorBoundary.wrap((badge: ProfileBadge & BadgeUserArgs) => {
        const Component = badge.component!;
        return <Component {...badge} />;
    }, { noop: true }),

    getBadgeMouseEventHandlers(badge: ProfileBadge & BadgeUserArgs) {
        const handlers = {} as Record<string, (e: React.MouseEvent) => void>;

        if (!badge) return handlers;

        const { onClick, onContextMenu } = badge;

        if (onClick) handlers.onClick = e => onClick(e, badge);
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
