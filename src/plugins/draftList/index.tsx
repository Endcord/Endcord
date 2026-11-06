/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { EndcordModal } from "@components/EndcordModal";
import { Channel } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { t } from "@utils/i18n";
import { openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Button, ChannelStore, DraftStore, DraftType, GuildStore, Menu, NavigationRouter, RelationshipStore, UserStore, useStateFromStores } from "@webpack/common";

const cl = classNameFactory("ec-drafts-");
const DraftManager: { clearDraft(channelId: string, type: number): void; } = findByPropsLazy("clearDraft", "saveDraft");

interface Draft {
    channelId: string;
    timestamp: number;
    draft: string;
}

function placeOf(channel: Channel) {
    if (channel.guild_id) {
        return { name: `#${channel.name}`, where: GuildStore.getGuild(channel.guild_id)?.name ?? "" };
    }
    if (channel.name) return { name: channel.name, where: t("Group DM") };

    const user = UserStore.getUser(channel.recipients?.[0]);
    const name = user ? RelationshipStore.getNickname(user.id) || (user as any).globalName || user.username : t("Unknown user");
    return { name, where: t("Direct Message") };
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function DraftsModal(props: { transitionState: number; onClose(): void; }) {
    const drafts: Draft[] = useStateFromStores([DraftStore], () =>
        (DraftStore.getRecentlyEditedDrafts(DraftType.ChannelMessage) as Draft[]).filter(d => d.draft?.trim() && ChannelStore.getChannel(d.channelId))
    );

    const open = (channel: Channel) => {
        NavigationRouter.transitionTo(`/channels/${channel.guild_id ?? "@me"}/${channel.id}`);
        props.onClose();
    };

    return (
        <EndcordModal
            {...props}
            size="md"
            title={t("Unsent messages")}
            subtitle={drafts.length === 0
                ? t("When you leave a chat with something written in its message box, it shows up here.")
                : drafts.length === 1
                    ? t("1 chat has something written in the message box that wasn't sent.")
                    : t("{count} chats have something written in the message box that wasn't sent.", { count: drafts.length })}
            actions={[{ text: t("Close"), variant: "secondary", onClick: props.onClose }]}
        >
            {drafts.length > 0 && (
                <ul className={cl("list")}>
                    {drafts.map(draft => {
                        const channel = ChannelStore.getChannel(draft.channelId);
                        const { name, where } = placeOf(channel);
                        return (
                            <li key={draft.channelId} className={cl("row")}>
                                <button className={cl("open")} onClick={() => open(channel)}>
                                    <span className={cl("place")}>
                                        <span className={cl("name")}>{name}</span>
                                        {where && <span className={cl("where")}>{where}</span>}
                                        <time className={cl("time")} dateTime={new Date(draft.timestamp).toISOString()}>{timeFormat.format(draft.timestamp)}</time>
                                    </span>
                                    <span className={cl("text")}>{draft.draft}</span>
                                </button>
                                <Button
                                    size={Button.Sizes.SMALL}
                                    color={Button.Colors.RED}
                                    look={Button.Looks.LINK}
                                    onClick={() => DraftManager.clearDraft(draft.channelId, DraftType.ChannelMessage)}
                                >
                                    {t("Discard")}
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </EndcordModal>
    );
}

export function openDrafts() {
    openModal(props => <DraftsModal {...props} />);
}

export default definePlugin({
    name: "DraftList",
    description: "Lists every chat where you left a message unsent, so you can go back and finish it. Open it from the Endcord Toolbox in the title bar.",
    tags: ["Chat", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    toolboxActions: () => (
        <Menu.MenuItem id="ec-draft-list-open" label={t("Unsent messages")} action={openDrafts} />
    )
});

