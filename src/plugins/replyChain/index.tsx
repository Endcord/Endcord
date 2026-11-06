/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { EndcordModal } from "@components/EndcordModal";
import { Message } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { t } from "@utils/i18n";
import { openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Button, ChannelStore, Constants, GuildMemberStore, IconUtils, Menu, MessageActions, MessageStore, Parser, RestAPI, useEffect, UserStore, useState } from "@webpack/common";

const cl = classNameFactory("ec-replychain-");

/** Discord's message type for a reply, and the reference type that is a reply rather than a forward */
const REPLY = 19;
const REFERENCE_DEFAULT = 0;
// Far enough to see how a conversation started, without fetching a whole channel
const MAX_DEPTH = 25;

interface Reference { channel_id: string; message_id: string; type?: number; }

interface ChainMessage {
    id: string;
    channelId: string;
    authorId: string;
    name: string;
    avatar: string;
    content: string;
    timestamp: number;
    reference?: Reference;
}

function avatarOf(author: { id: string; avatar?: string | null; }, guildId?: string) {
    const user = UserStore.getUser(author.id);
    if (user) return user.getAvatarURL(guildId, 40);
    return IconUtils.getUserAvatarURL({ id: author.id, avatar: author.avatar, discriminator: "0" } as any, false, 40);
}

function fromStore(m: Message, guildId?: string): ChainMessage {
    const ref = (m as any).messageReference as Reference | undefined;
    return {
        id: m.id,
        channelId: m.channel_id,
        authorId: m.author.id,
        name: (guildId && GuildMemberStore.getNick(guildId, m.author.id)) || (m.author as any).globalName || m.author.username,
        avatar: avatarOf(m.author, guildId),
        content: m.content,
        timestamp: new Date(m.timestamp as any).getTime(),
        reference: m.type === REPLY && (ref?.type ?? REFERENCE_DEFAULT) === REFERENCE_DEFAULT ? ref : undefined
    };
}

function fromApi(m: any, guildId?: string): ChainMessage {
    const ref = m.message_reference as Reference | undefined;
    return {
        id: m.id,
        channelId: m.channel_id,
        authorId: m.author.id,
        name: (guildId && GuildMemberStore.getNick(guildId, m.author.id)) || m.author.global_name || m.author.username,
        avatar: avatarOf(m.author, guildId),
        content: m.content,
        timestamp: new Date(m.timestamp).getTime(),
        reference: m.type === REPLY && (ref?.type ?? REFERENCE_DEFAULT) === REFERENCE_DEFAULT ? ref : undefined
    };
}

async function load(ref: Reference, guildId?: string): Promise<ChainMessage | null> {
    const cached = MessageStore.getMessage(ref.channel_id, ref.message_id);
    if (cached) return fromStore(cached, guildId);

    // Read only: one message, the way Discord fetches a reply it hasn't seen
    const res = await RestAPI.get({
        url: Constants.Endpoints.MESSAGES(ref.channel_id),
        query: { limit: 1, around: ref.message_id },
        retries: 1
    }).catch(() => null);
    const found = res?.body?.find?.((m: any) => m.id === ref.message_id);
    return found ? fromApi(found, guildId) : null;
}

function ChainModal({ start, ...props }: { start: Message; transitionState: number; onClose(): void; }) {
    const guildId = ChannelStore.getChannel(start.channel_id)?.guild_id;
    const [chain, setChain] = useState<ChainMessage[]>(() => [fromStore(start, guildId)]);
    const [state, setState] = useState<"loading" | "done" | "missing" | "long">("loading");

    useEffect(() => {
        let stopped = false;
        (async () => {
            let list = [fromStore(start, guildId)];
            while (list[0].reference) {
                if (list.length >= MAX_DEPTH) return setState("long");
                const next = await load(list[0].reference, guildId);
                if (stopped) return;
                if (!next) return setState("missing");
                list = [next, ...list];
                setChain(list);
            }
            setState("done");
        })();
        return () => { stopped = true; };
    }, []);

    const jump = (m: ChainMessage) => {
        MessageActions.jumpToMessage({ channelId: m.channelId, messageId: m.id, flash: true });
        props.onClose();
    };
    const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

    return (
        <EndcordModal
            {...props}
            size="md"
            title={t("Reply chain")}
            subtitle={state === "loading" ? t("Finding the messages this one replies to…") : t("{count} messages, the first one at the top.", { count: chain.length })}
            actions={[{ text: t("Close"), variant: "secondary", onClick: props.onClose }]}
        >
            <ol className={cl("list")}>
                {state === "missing" && <li className={cl("note")}>{t("The message before this one was deleted.")}</li>}
                {state === "long" && <li className={cl("note")}>{t("The chain goes back further than this.")}</li>}
                {chain.map(m => (
                    <li key={m.id} className={cl("item", m.id === start.id && "current")}>
                        <img className={cl("avatar")} src={m.avatar} alt="" width={32} height={32} />
                        <div className={cl("body")}>
                            <div className={cl("head")}>
                                <span className={cl("name")}>{m.name}</span>
                                <time className={cl("time")} dateTime={new Date(m.timestamp).toISOString()}>{time.format(m.timestamp)}</time>
                                <Button className={cl("jump")} size={Button.Sizes.SMALL} look={Button.Looks.LINK} color={Button.Colors.LINK} onClick={() => jump(m)}>
                                    {t("Jump")}
                                </Button>
                            </div>
                            <div className={cl("content")}>
                                {m.content ? Parser.parse(m.content, true, { channelId: m.channelId, messageId: m.id, allowLinks: true }) : <i>{t("(no text)")}</i>}
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
        </EndcordModal>
    );
}

const messageMenu: NavContextMenuPatchCallback = (children, { message }: { message?: Message; }) => {
    const ref = (message as any)?.messageReference as Reference | undefined;
    if (!message || message.type !== REPLY || !ref || (ref.type ?? REFERENCE_DEFAULT) !== REFERENCE_DEFAULT) return;

    children.push(
        <Menu.MenuItem
            id="ec-reply-chain"
            label={t("Show Reply Chain")}
            action={() => openModal(props => <ChainModal {...props} start={message} />)}
        />
    );
};

export default definePlugin({
    name: "ReplyChain",
    description: "Right-click a reply to see the whole conversation it answers, from the first message down, in one window.",
    tags: ["Chat", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    contextMenus: {
        "message": messageMenu
    }
});
