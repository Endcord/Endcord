/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addProfileBadge, BadgePosition, BadgeRarity, ProfileBadge, removeProfileBadge } from "@api/Badges";
import { migratePluginSetting } from "@api/Settings";
import { Button } from "@components/Button";
import BadgeContextMenu from "@plugins/_api/badges";
import { Devs } from "@utils/constants";
import { openInviteModal } from "@utils/discord";
import { t } from "@utils/i18n";
import definePlugin from "@utils/types";
import { ContextMenuApi, React, Toasts, UserStore } from "@webpack/common";

import { openBadgeModal } from "./badgeModal";
import { settings } from "./settings";
import { cl, GlobalBadges, INVITE_LINK, loadBadges, serviceMap } from "./utils";

let intervalId: any;

function getGlobalBadges(userId: string): ProfileBadge[] {
    const badges = GlobalBadges[userId];
    if (!badges?.length) return [];

    return badges.map((badge, idx) => {
        const mod = serviceMap[badge.mod] ?? badge.mod;

        return {
            id: `global_badges_badge_${idx}`,
            iconSrc: badge.badge,
            description: badge.tooltip,
            title: badge.key,
            eyebrow: mod,
            body: t("Global Badge"),
            rarity: BadgeRarity.COMMON,
            position: BadgePosition.START,
            props: {
                style: {
                    borderRadius: "50%",
                    transform: "scale(0.9)"
                }
            },
            details: {
                era: mod,
                label: t("Global Badge"),
                text: t("GlobalBadges collects the badges other client mods give out. This one comes from {mod}.", { mod }),
                notice: t("Only people who use Endcord with GlobalBadges can see this badge."),
                action: badges.length > 1
                    ? {
                        text: t("See all {count}", { count: badges.length }),
                        onClick() {
                            const user = UserStore.getUser(userId);
                            if (user) openBadgeModal(user);
                        }
                    }
                    : undefined
            },
            onContextMenu(event, badge) {
                // @ts-ignore
                ContextMenuApi.openContextMenu(event, () => React.createElement(BadgeContextMenu as any, { badge }));
            }
        } satisfies ProfileBadge;
    });
}

const GlobalBadge: ProfileBadge = {
    id: "global_badges",
    position: BadgePosition.START,
    getBadges: ({ userId }) => getGlobalBadges(userId)
};

migratePluginSetting("GlobalBadges", "showRaincord", "showRa1ncord");
export default definePlugin({
    name: "GlobalBadges",
    description: "Adds global badges from other client mods",
    tags: ["Appearance"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,
    settingsAboutComponent: () => (
        <>
            <Button
                variant="link"
                className={cl("settings-button")}
                onClick={() => openInviteModal(INVITE_LINK)}
            >
                {t("Join GlobalBadges Server")}</Button>
        </>
    ),
    async start() {
        // The badges were loaded but never handed to profiles, so none ever showed
        addProfileBadge(GlobalBadge);
        await loadBadges();
        clearInterval(intervalId);
        intervalId = setInterval(loadBadges, 1000 * 60 * 30);
    },
    async stop() {
        removeProfileBadge(GlobalBadge);
        clearInterval(intervalId);
    },
    toolboxActions: {
        "Refetch Global Badges": async function() {
            await loadBadges();
            Toasts.show({
                id: Toasts.genId(),
                message: "Successfully refetched global badges!",
                type: Toasts.Type.SUCCESS
            });
        }
    },
    get GlobalBadges() {
        return GlobalBadges;
    },
    getGlobalBadges
});
