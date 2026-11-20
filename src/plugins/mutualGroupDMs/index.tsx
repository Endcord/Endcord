/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import { Channel, User } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { isNonNullish } from "@utils/guards";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { findByPropsLazy, findCssClassesLazy } from "@webpack";
import { Avatar, ChannelStore, Clickable, IconUtils, RelationshipStore, ScrollerThin, Text, useMemo, UserStore } from "@webpack/common";
import { ComponentType } from "react";

const SelectedChannelActionCreators = findByPropsLazy("selectPrivateChannel");
const UserUtils = findByPropsLazy("getGlobalName");

const ProfileListClasses = findCssClassesLazy("empty", "textContainer", "connectionIcon");
const TabBarClasses = findCssClassesLazy("tabPanelScroller", "tabBarPanel");
const MutualsListClasses = findCssClassesLazy("row", "icon", "name", "details");

function getGroupDMName(channel: Channel) {
    return channel.name ||
        channel.recipients
            .map(UserStore.getUser)
            .filter(isNonNullish)
            .map(c => RelationshipStore.getNickname(c.id) || UserUtils.getName(c))
            .join(", ");
}

const getMutualGroupDms = (userId: string) =>
    ChannelStore.getSortedPrivateChannels()
        .filter(c => c.isGroupDM() && c.recipients.includes(userId));

const isBotOrSelf = (user: User) => user.bot || user.id === UserStore.getCurrentUser().id;

function getMutualGDMCountText(user: User) {
    const count = getMutualGroupDms(user.id).length;
    return `${count === 0 ? "No" : count} Mutual Group${count !== 1 ? "s" : ""}`;
}

function renderClickableGDMs(mutualDms: Channel[], onClose: () => void) {
    return mutualDms.map(c => (
        <Clickable
            key={c.id}
            className={MutualsListClasses.row}
            onClick={() => {
                onClose();
                SelectedChannelActionCreators.selectPrivateChannel(c.id);
            }}
        >
            <Avatar
                src={IconUtils.getChannelIconURL({ id: c.id, icon: c.icon, size: 32 })}
                size="SIZE_40"
                className={MutualsListClasses.icon}
            >
            </Avatar>
            <div className={MutualsListClasses.details}>
                <div className={MutualsListClasses.name}>{getGroupDMName(c)}</div>
                <Text variant="text-xs/medium">{c.recipients.length + 1}{" "}{t("Members")}</Text>
            </div>
        </Clickable>
    ));
}

const IS_PATCHED = Symbol("MutualGroupDMs.Patched");

export default definePlugin({
    name: "MutualGroupDMs",
    description: "Shows mutual group dms in profiles",
    tags: ["Friends", "Appearance"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    patches: [
        // User Profile Modal
        {
            find: ".BOT_DATA_ACCESS?(",
            replacement: [
                {
                    match: /\i\.useEffect.{0,100}(\i)\[0\]\.section/,
                    replace: "$self.pushSection($1,arguments[0].user);$&"
                },
                {
                    match: /\(0,\i\.jsx\)\(\i,\{items:\i,section:(\i)/,
                    replace: "$1==='MUTUAL_GDMS'?$self.renderMutualGDMs(arguments[0]):$&"
                },
                // Discord adds spacing between each item which pushes our tab off screen.
                // set the gap to zero to ensure ours stays on screen
                {
                    match: /className:\i\.\i(?=,type:"top")/,
                    replace: '$& + " vc-mutual-gdms-modal-tab-bar"'
                }
            ]
        },
        // User Profile Modal v2
        {
            find: ".WIDGETS?",
            replacement: [
                {
                    // In the items builder, before the tabs' useState reads initialSection. GitHubRepos patches first
                    // and adds its own push after MUTUAL_GUILDS, hence the gap
                    match: /(\{user:(\i),currentUser:\i\}=\i,\{mutualFriendsCount:.+?section:\i\.\i\.MUTUAL_GUILDS\}\)\).{0,120}?,)(\i)\}/,
                    replace: "$1$self.pushSection($3,$2),$3}"
                },
                {
                    match: /children:(?=.{0,100}?component:.+?section:(\i(?:\.section)?))/,
                    replace: "$&$1==='MUTUAL_GDMS'?$self.renderMutualGDMs(arguments[0]):"
                },
                // Make the gap between each item smaller so our tab can fit.
                {
                    match: /type:"top",/,
                    replace: '$&className:"vc-mutual-gdms-modal-v2-tab-bar",'
                },
            ]
        },
        // Mutual friends / servers summary of the DM sidebar and profile popouts
        {
            find: "hideOverflowCount:!0,disableGuildNameTooltip:!0",
            group: true,
            replacement: [
                {
                    match: /(\i)=(\i)&&(\i)(\?"body-xs\/normal":"body-sm\/normal";return )\2\|\|\3\?/,
                    replace: "vcMutualGDMs=$self.getMutualGDMCount(arguments[0].user),$1=[$2,$3,vcMutualGDMs>0].filter(Boolean).length>1$4$2||$3||vcMutualGDMs>0?"
                },
                {
                    match: /,(\i)&&(\i)\?\(0,\i\.jsx\)\("div",\{"aria-hidden":"true",className:(\i\.\i)\}\):null,\i\?\(0,\i\.jsxs\)\((\i\.\i),\{className:(\i\.\i),onClick:\(\)=>(\i)\?\.\(\i\.\i\.MUTUAL_GUILDS\),children:\[.+?\(0,\i\.jsx\)\((\i\.\i),\{className:(\i\.\i),variant:(\i),.+?\]\}\):null/,
                    replace: "$&,vcMutualGDMs>0&&$self.renderMutualGDMsSummary({user:arguments[0].user,hasDivider:$1||$2,spacerClass:$3,Section:$4,sectionClass:$5,onOpenProfile:$6,Text:$7,textClass:$8,variant:$9})"
                }
            ]
        }
    ],

    getMutualGDMCount(user: User) {
        try {
            return isBotOrSelf(user) ? 0 : getMutualGroupDms(user.id).length;
        } catch (e) {
            new Logger("MutualGroupDMs").error("Failed to get mutual group dms:", e);
        }

        return 0;
    },

    pushSection(sections: any[], user: User) {
        try {
            if (isBotOrSelf(user) || sections[IS_PATCHED]) return;

            sections[IS_PATCHED] = true;
            sections.push({
                text: getMutualGDMCountText(user),
                section: "MUTUAL_GDMS",
            });
        } catch (e) {
            new Logger("MutualGroupDMs").error("Failed to push mutual group dms section:", e);
        }
    },

    renderMutualGDMs: ErrorBoundary.wrap(({ user, onClose }: { user: User, onClose: () => void; }) => {
        const mutualGDms = useMemo(() => getMutualGroupDms(user.id), [user.id]);
        const entries = renderClickableGDMs(mutualGDms, onClose);

        return (
            <ScrollerThin
                className={TabBarClasses.tabPanelScroller}
                fade={true}
                onClose={onClose}
            >
                {entries.length > 0
                    ? entries
                    : (
                        <div className={ProfileListClasses.empty}>
                            <div className={ProfileListClasses.textContainer}>
                                <BaseText tag="h3" size="md" weight="medium" style={{ color: "var(--text-strong)" }}>{t("You don't have any group chats in common")}</BaseText>
                            </div>
                        </div>
                    )
                }
            </ScrollerThin>
        );
    }),

    // Section, Text and the classes are the summary module's own, so the entry looks like its neighbours
    renderMutualGDMsSummary: ErrorBoundary.wrap(({ user, hasDivider, spacerClass, Section, sectionClass, onOpenProfile, Text: SummaryText, textClass, variant }: {
        user: User, hasDivider: boolean, spacerClass: string, Section: ComponentType<any>, sectionClass: string,
        onOpenProfile?: (section: string) => void, Text: ComponentType<any>, textClass: string, variant: string;
    }) => (
        <>
            {hasDivider && <div aria-hidden="true" className={spacerClass} />}
            <Section className={sectionClass} onClick={() => onOpenProfile?.("MUTUAL_GDMS")}>
                <SummaryText className={textClass} variant={variant} color="interactive-text-default">
                    {getMutualGDMCountText(user)}
                </SummaryText>
            </Section>
        </>
    ), { noop: true })
});
