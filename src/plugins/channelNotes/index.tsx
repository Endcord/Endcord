/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { addChannelToolbarButton, ChannelToolbarButton, removeChannelToolbarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { Channel, RenderModalProps } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { t, useI18n } from "@utils/i18n";
import definePlugin from "@utils/types";
import { ChannelStore, GuildStore, Menu, Modal, NavigationRouter, openModal, React, SelectedChannelStore, useEffect, useMemo, UserStore, useState, useStateFromStores } from "@webpack/common";

const cl = classNameFactory("ec-notes-");
const DS_KEY = "ChannelNotes_notes";
const MAX_LENGTH = 4000;

interface Note {
    text: string;
    updatedAt: number;
}

let notes: Record<string, Note> = {};
const listeners = new Set<() => void>();

async function setNote(channelId: string, text: string) {
    const trimmed = text.trim().slice(0, MAX_LENGTH);
    if (trimmed) notes = { ...notes, [channelId]: { text: trimmed, updatedAt: Date.now() } };
    else {
        const { [channelId]: _, ...rest } = notes;
        notes = rest;
    }
    listeners.forEach(l => l());
    await DataStore.set(DS_KEY, notes);
}

function useNotes() {
    const [, force] = useState(0);
    useEffect(() => {
        const l = () => force(n => n + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
    }, []);
    return notes;
}

function channelTitle(channel: Channel | undefined) {
    if (!channel) return t("Unknown channel");
    if (channel.guild_id) {
        const guild = GuildStore.getGuild(channel.guild_id);
        return `#${channel.name}${guild ? ` · ${guild.name}` : ""}`;
    }
    if (channel.name) return channel.name;
    const other = UserStore.getUser(channel.recipients?.[0]);
    return other ? (other.globalName ?? other.username) : t("Direct message");
}

function NoteIcon({ hasNote, ...props }: { hasNote?: boolean; width?: number; height?: number; }) {
    return (
        <svg viewBox="0 0 24 24" width={props.width ?? 20} height={props.height ?? 20}>
            <path fill="currentColor" d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9.59a2 2 0 0 0 1.41-.59l4.41-4.41a2 2 0 0 0 .59-1.41V5a2 2 0 0 0-2-2H5Zm2 5a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h5a1 1 0 1 0 0-2H8Zm7 7.59V15a1 1 0 0 1 1-1h3.59L15 18.59Z" />
            {hasNote && <circle cx="19.5" cy="4.5" r="3.5" fill="var(--brand-500, #5865f2)" stroke="var(--background-base-low, #1e1f22)" strokeWidth="1.5" />}
        </svg>
    );
}

// ---- editor ----

function NoteEditor({ channelId, modalProps }: { channelId: string; modalProps: RenderModalProps; }) {
    const { t } = useI18n();
    const existing = notes[channelId];
    const [text, setText] = useState(existing?.text ?? "");
    const channel = ChannelStore.getChannel(channelId);

    const save = async () => {
        await setNote(channelId, text);
        modalProps.onClose();
    };

    return (
        <Modal
            {...modalProps}
            size="md"
            title={existing ? t("Edit note") : t("Add a note")}
            subtitle={t("Only you can see this note for {channel}.", { channel: channelTitle(channel) })}
            actions={[
                ...(existing ? [{ text: t("Delete note"), variant: "critical-primary", onClick: () => setNote(channelId, "").then(modalProps.onClose) }] : []),
                { text: t("Cancel"), variant: "secondary", onClick: modalProps.onClose },
                { text: t("Save"), variant: "primary", onClick: save },
            ]}
        >
            <textarea
                className={cl("textarea")}
                autoFocus
                value={text}
                maxLength={MAX_LENGTH}
                placeholder={channel?.guild_id ? t("Server rules, who is who, things to remember…") : t("Things to remember about this conversation…")}
                onChange={e => setText(e.currentTarget.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }}
            />
            <div className={cl("hint")}>
                <span>{t("Ctrl+Enter to save")}</span>
                <span>{text.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}</span>
            </div>
        </Modal>
    );
}

export const openNoteEditor = (channelId: string) => openModal(props => <NoteEditor channelId={channelId} modalProps={props} />);

// ---- all notes ----

function AllNotes({ modalProps }: { modalProps: RenderModalProps; }) {
    const { t } = useI18n();
    const all = useNotes();
    const [query, setQuery] = useState("");
    const entries = useMemo(() => Object.entries(all)
        .map(([id, note]) => ({ id, note, channel: ChannelStore.getChannel(id) }))
        .filter(e => !query || e.note.text.toLowerCase().includes(query.toLowerCase()) || channelTitle(e.channel).toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.note.updatedAt - a.note.updatedAt), [all, query]);

    return (
        <Modal {...modalProps} size="md" title={t("Channel notes")} subtitle={t("Private notes you added to channels and conversations.")}>
            <input className={cl("search")} placeholder={t("Search notes")} value={query} onChange={e => setQuery(e.currentTarget.value)} />
            {!entries.length && <p className={cl("empty")}>{Object.keys(all).length ? t("No notes match your search.") : t("No notes yet. Right-click a channel or conversation and choose Add note.")}</p>}
            <div className={cl("list")}>
                {entries.map(({ id, note, channel }) => (
                    <article key={id} className={cl("item")}>
                        <header className={cl("item-head")}>
                            <span className={cl("item-title")}>{channelTitle(channel)}</span>
                            <span className={cl("item-date")}>{new Date(note.updatedAt).toLocaleDateString()}</span>
                        </header>
                        <p className={cl("item-text")}>{note.text}</p>
                        <div className={cl("item-actions")}>
                            {channel && <button className={cl("action")} onClick={() => { NavigationRouter.transitionTo(`/channels/${channel.guild_id ?? "@me"}/${id}`); modalProps.onClose(); }}>{t("Open channel")}</button>}
                            <button className={cl("action")} onClick={() => openNoteEditor(id)}>{t("Edit")}</button>
                        </div>
                    </article>
                ))}
            </div>
        </Modal>
    );
}

// ---- entry points ----

function ToolbarButton() {
    const channelId = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getChannelId());
    const note = useNotes()[channelId];
    if (!channelId) return null;
    const preview = note ? (note.text.length > 140 ? note.text.slice(0, 140) + "…" : note.text) : null;
    return (
        <ChannelToolbarButton
            icon={p => <NoteIcon {...p} hasNote={!!note} />}
            tooltip={preview ?? t("Add a note to this channel")}
            onClick={() => openNoteEditor(channelId)}
        />
    );
}

const menuItem = (channelId: string) => (
    <Menu.MenuItem
        id="ec-channel-note"
        label={notes[channelId] ? t("Edit note") : t("Add note")}
        action={() => openNoteEditor(channelId)}
    />
);

const ChannelContext: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (channel?.id) children.push(<Menu.MenuGroup>{menuItem(channel.id)}</Menu.MenuGroup>);
};

const UserContext: NavContextMenuPatchCallback = (children, { user }: { user?: { id: string; }; }) => {
    // Notes on users belong to Discord's own note field; this adds one for the direct message instead
    const dm = user && ChannelStore.getDMFromUserId(user.id);
    if (dm) children.push(<Menu.MenuGroup>{menuItem(dm)}</Menu.MenuGroup>);
};

export default definePlugin({
    name: "ChannelNotes",
    description: "Keep private notes on any channel, DM or group chat: rules, who is who, things to remember. Notes stay on your device.",
    tags: ["Utility", "Chat"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    searchTerms: ["notes", "memo", "reminder", "not"],
    dependencies: ["HeaderBarAPI"],

    contextMenus: {
        "channel-context": ChannelContext,
        "thread-context": ChannelContext,
        "gdm-context": ChannelContext,
        "user-context": UserContext,
    },

    toolboxActions: {
        "Open channel notes": () => openModal(props => <AllNotes modalProps={props} />),
    },

    async start() {
        notes = await DataStore.get(DS_KEY) ?? {};
        listeners.forEach(l => l());
        addChannelToolbarButton("ChannelNotes", () => <ToolbarButton />, 3);
    },

    stop() {
        removeChannelToolbarButton("ChannelNotes");
    },
});
