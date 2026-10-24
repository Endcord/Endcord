/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Message, RenderModalProps } from "@endcord/discord-types";
import { classNameFactory } from "@utils/css";
import { t, useI18n } from "@utils/i18n";
import { identity } from "@utils/misc";
import { ChannelStore, ConfirmModal, GuildStore, Modal, NavigationRouter, openModal, React, Select, SelectedChannelStore, SelectedGuildStore, showToast, Toasts, useEffect, useMemo, UserStore, useState } from "@webpack/common";

import { clearMessages, countMessages, countReplies, getSaved, IndexedMessage, removeSaved, SavedMessage, saveMessage, search, SearchQuery } from "./db";

const cl = classNameFactory("ec-vault-");

export function VaultIcon(props: { width?: number; height?: number; }) {
    return (
        <svg viewBox="0 0 24 24" width={props.width ?? 20} height={props.height ?? 20}>
            <path fill="currentColor" d="M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm4 3a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H8Zm0 4a1 1 0 1 0 0 2h5a1 1 0 1 0 0-2H8Zm7.5 3a3.5 3.5 0 1 0 1.97 6.39l1.32 1.32a1 1 0 0 0 1.42-1.42l-1.32-1.32A3.5 3.5 0 0 0 15.5 14Zm-1.5 3.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
        </svg>
    );
}

// ---- helpers ----

function channelLabel(m: IndexedMessage) {
    const channel = ChannelStore.getChannel(m.ch);
    if (!channel) return t("Unknown channel");
    if (m.g) {
        const guild = GuildStore.getGuild(m.g);
        return `#${channel.name}${guild ? ` · ${guild.name}` : ""}`;
    }
    if (channel.name) return channel.name;
    const other = UserStore.getUser(channel.recipients?.[0]);
    return other ? (other.globalName ?? other.username) : t("Direct message");
}

function jumpTo(m: Pick<IndexedMessage, "g" | "ch" | "id">) {
    NavigationRouter.transitionTo(`/channels/${m.g ?? "@me"}/${m.ch}/${m.id}`);
}

function Highlight({ text, terms }: { text: string; terms: string[]; }) {
    if (!terms.length) return <>{text}</>;
    const re = new RegExp(`(${terms.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return <>{text.split(re).map((part, i) => i % 2 ? <mark key={i} className={cl("mark")}>{part}</mark> : part)}</>;
}

const plural = (count: number, one: string, many: string) => count === 1 ? t(one) : t(many, { count: count.toLocaleString() });

const dayKey = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const timeOf = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const toDateInput = (ts?: number) => ts ? new Date(ts - new Date(ts).getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : "";

// ---- message rows grouped by day ----

function MessageRow({ m, terms, replies, actions, onJump }: { m: IndexedMessage; terms: string[]; replies?: number; actions: React.ReactNode; onJump(): void; }) {
    const { t } = useI18n();
    const content = m.c.length > 400 ? m.c.slice(0, 400) + "…" : m.c;
    return (
        <article className={cl("row")}>
            <header className={cl("row-head")}>
                <span className={cl("author")}>{m.an || t("Unknown user")}</span>
                <span className={cl("meta")}>{timeOf(m.ts)} · {channelLabel(m)}</span>
            </header>
            <div className={cl("content")}>
                {content ? <Highlight text={content} terms={terms} /> : <em>{t("Attachment only")}</em>}
                {m.at > 0 && content && <span className={cl("attachments")}> · {plural(m.at, "1 attachment", "{count} attachments")}</span>}
            </div>
            <div className={cl("row-actions")}>
                <button className={cl("action")} onClick={() => { jumpTo(m); onJump(); }}>{t("Jump to message")}</button>
                {!!replies && <span className={cl("replies")}>{plural(replies, "1 reply", "{count} replies")}</span>}
                {actions}
            </div>
        </article>
    );
}

function Timeline({ items, render }: { items: IndexedMessage[]; render: (m: IndexedMessage) => React.ReactNode; }) {
    const groups = useMemo(() => {
        const out: Array<[string, IndexedMessage[]]> = [];
        for (const m of items) {
            const key = dayKey(m.ts);
            const last = out.at(-1);
            if (last?.[0] === key) last[1].push(m);
            else out.push([key, [m]]);
        }
        return out;
    }, [items]);

    return (
        <div className={cl("timeline")}>
            {groups.map(([day, list]) => (
                <section key={day} className={cl("day")}>
                    <h4 className={cl("day-title")}>{day}</h4>
                    {list.map(render)}
                </section>
            ))}
        </div>
    );
}

// ---- search ----

type Scope = "all" | "channel" | "server" | "dms";

function SearchTab({ initial, onClose }: { initial?: { channelId?: string; }; onClose(): void; }) {
    const { t } = useI18n();
    const [text, setText] = useState("");
    const [author, setAuthor] = useState("");
    const [scope, setScope] = useState<Scope>(initial?.channelId ? "channel" : "all");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [replyTo, setReplyTo] = useState<IndexedMessage | null>(null);
    const [result, setResult] = useState<{ results: IndexedMessage[]; scanned: number; replies: Map<string, number>; } | null>(null);
    const [busy, setBusy] = useState(false);

    const channelId = initial?.channelId ?? SelectedChannelStore.getChannelId();
    const guildId = SelectedGuildStore.getGuildId();
    const terms = useMemo(() => text.toLowerCase().split(/\s+/).filter(Boolean), [text]);

    useEffect(() => {
        let cancelled = false;
        const q: SearchQuery = {
            text, author,
            from: from ? new Date(from + "T00:00:00").getTime() : undefined,
            to: to ? new Date(to + "T23:59:59.999").getTime() : undefined,
            replyTo: replyTo?.id,
        };
        if (scope === "channel" && channelId) q.channelId = channelId;
        if (scope === "server") q.guildId = guildId ?? null;
        if (scope === "dms") q.dmsOnly = true;

        // Typing is debounced so a search runs once the user pauses
        const handle = setTimeout(async () => {
            setBusy(true);
            try {
                const res = await search(q);
                const replies = await countReplies(res.results.slice(0, 120).map(m => m.id));
                if (!cancelled) setResult({ ...res, replies });
            } finally {
                if (!cancelled) setBusy(false);
            }
        }, 250);
        return () => { cancelled = true; clearTimeout(handle); };
    }, [text, author, scope, from, to, replyTo, channelId, guildId]);

    const scopes = [
        { label: t("Everywhere"), value: "all" },
        { label: t("This channel"), value: "channel" },
        { label: t("This server"), value: "server" },
        { label: t("Direct messages"), value: "dms" },
    ];

    return (
        <div className={cl("tab")}>
            <div className={cl("filters")}>
                <input className={cl("input", "input-wide")} autoFocus placeholder={t("Search words or phrases")} value={text} onChange={e => setText(e.currentTarget.value)} />
                <input className={cl("input")} placeholder={t("From user (name or ID)")} value={author} onChange={e => setAuthor(e.currentTarget.value)} />
                <div className={cl("select")}>
                    <Select options={scopes} isSelected={v => v === scope} select={v => setScope(v)} serialize={identity} closeOnSelect />
                </div>
                <label className={cl("date")}><span>{t("From")}</span><input className={cl("input")} type="date" value={from} max={to || undefined} onChange={e => setFrom(e.currentTarget.value)} /></label>
                <label className={cl("date")}><span>{t("Until")}</span><input className={cl("input")} type="date" value={to} min={from || undefined} max={toDateInput(Date.now())} onChange={e => setTo(e.currentTarget.value)} /></label>
            </div>

            {replyTo && (
                <div className={cl("context")}>
                    <span>{t("Replies to {author}: {text}", { author: replyTo.an, text: replyTo.c.slice(0, 80) })}</span>
                    <button className={cl("action")} onClick={() => setReplyTo(null)}>{t("Show all results")}</button>
                </div>
            )}

            <div className={cl("summary")} aria-live="polite">
                {busy && !result ? t("Searching…") : result && (
                    result.results.length
                        ? plural(result.results.length, "1 result", "{count} results") + (result.results.length >= 300 ? ` · ${t("showing the newest 300, narrow your search to see more")}` : "")
                        : t("No messages match. Only messages you have opened in Discord are indexed.")
                )}
            </div>

            {result && (
                <Timeline items={result.results} render={m => (
                    <MessageRow key={m.id} m={m} terms={terms} replies={result.replies.get(m.id)} onJump={onClose} actions={<>
                        {!!result.replies.get(m.id) && <button className={cl("action")} onClick={() => setReplyTo(m)}>{t("Show replies")}</button>}
                        <button className={cl("action")} onClick={() => openSaveModal(m)}>{t("Save")}</button>
                    </>} />
                )} />
            )}
        </div>
    );
}

// ---- saved collections ----

function SavedTab({ onClose }: { onClose(): void; }) {
    const { t } = useI18n();
    const [saved, setSaved] = useState<SavedMessage[] | null>(null);
    const [collection, setCollection] = useState<string | null>(null);
    const [tag, setTag] = useState<string | null>(null);

    const reload = () => getSaved().then(setSaved);
    useEffect(() => { reload(); }, []);

    const collections = useMemo(() => [...new Set(saved?.map(s => s.collection))].sort(), [saved]);
    const tags = useMemo(() => [...new Set(saved?.flatMap(s => s.tags))].sort(), [saved]);
    const shown = (saved ?? []).filter(s => (!collection || s.collection === collection) && (!tag || s.tags.includes(tag)));

    if (saved && !saved.length) {
        return <p className={cl("empty")}>{t("Nothing saved yet. Right-click a message and choose Save to Message Vault.")}</p>;
    }

    return (
        <div className={cl("tab")}>
            <div className={cl("chips")} role="group" aria-label={t("Collections")}>
                <button className={cl("chip", !collection && "chip-on")} onClick={() => setCollection(null)}>{t("All collections")}</button>
                {collections.map(c => <button key={c} className={cl("chip", collection === c && "chip-on")} onClick={() => setCollection(c)}>{c}</button>)}
            </div>
            {!!tags.length && (
                <div className={cl("chips")} role="group" aria-label={t("Tags")}>
                    {tags.map(tg => <button key={tg} className={cl("chip", "chip-tag", tag === tg && "chip-on")} onClick={() => setTag(tag === tg ? null : tg)}>#{tg}</button>)}
                </div>
            )}
            <Timeline items={shown} render={m => {
                const s = m as SavedMessage;
                return (
                    <MessageRow key={s.id} m={s} terms={[]} onJump={onClose} actions={<>
                        <span className={cl("in-collection")}>{s.collection}{s.tags.length ? ` · ${s.tags.map(x => "#" + x).join(" ")}` : ""}</span>
                        <button className={cl("action")} onClick={() => openSaveModal(s, reload)}>{t("Edit")}</button>
                        <button className={cl("action", "action-danger")} onClick={() => removeSaved(s.id).then(reload)}>{t("Remove")}</button>
                    </>} />
                );
            }} />
        </div>
    );
}

// ---- modals ----

function Footer() {
    const { t } = useI18n();
    const [count, setCount] = useState<number | null>(null);
    useEffect(() => { countMessages().then(setCount).catch(() => setCount(0)); }, []);

    const clear = () => openModal(props => (
        <ConfirmModal {...props} title={t("Clear the local index?")} subtitle={t("Saved messages are kept. The index fills up again as you read.")}
            confirmText={t("Clear index")} onConfirm={async () => { await clearMessages(); setCount(0); }} />
    ));

    return (
        <div className={cl("footer")}>
            <span>{count == null ? "" : t("{count} messages indexed on this device. Nothing is uploaded.", { count: count.toLocaleString() })}</span>
            <button className={cl("action", "action-danger")} onClick={clear}>{t("Clear index")}</button>
        </div>
    );
}

export function VaultModal({ modalProps, initial }: { modalProps: RenderModalProps; initial?: { channelId?: string; }; }) {
    const { t } = useI18n();
    const [tab, setTab] = useState<"search" | "saved">("search");
    return (
        <Modal {...modalProps} size="lg" title={t("Message Vault")} subtitle={t("Search what you have read and keep what matters. Everything stays on this device.")}>
            <div className={cl("tabs")} role="tablist">
                <button role="tab" aria-selected={tab === "search"} className={cl("tab-button", tab === "search" && "tab-on")} onClick={() => setTab("search")}>{t("Search")}</button>
                <button role="tab" aria-selected={tab === "saved"} className={cl("tab-button", tab === "saved" && "tab-on")} onClick={() => setTab("saved")}>{t("Saved")}</button>
            </div>
            {tab === "search" ? <SearchTab initial={initial} onClose={modalProps.onClose} /> : <SavedTab onClose={modalProps.onClose} />}
            <Footer />
        </Modal>
    );
}

function SaveForm({ message, existing, onDone }: { message: IndexedMessage; existing?: SavedMessage; onDone(): void; }) {
    const { t } = useI18n();
    const [collection, setCollection] = useState(existing?.collection ?? t("General"));
    const [tags, setTags] = useState(existing?.tags.join(", ") ?? "");
    const [known, setKnown] = useState<string[]>([]);
    useEffect(() => { getSaved().then(all => setKnown([...new Set(all.map(s => s.collection))])); }, []);

    const save = async () => {
        await saveMessage({
            ...message,
            collection: collection.trim() || t("General"),
            tags: tags.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean),
            savedAt: existing?.savedAt ?? Date.now(),
        });
        showToast(t("Saved to {collection}", { collection: collection.trim() || t("General") }), Toasts.Type.SUCCESS);
        onDone();
    };

    return (
        <form className={cl("save")} onSubmit={e => { e.preventDefault(); save(); }}>
            <label className={cl("field")}>
                <span>{t("Collection")}</span>
                <input className={cl("input")} list="ec-vault-collections" value={collection} onChange={e => setCollection(e.currentTarget.value)} />
                <datalist id="ec-vault-collections">{known.map(c => <option key={c} value={c} />)}</datalist>
            </label>
            <label className={cl("field")}>
                <span>{t("Tags, separated by commas")}</span>
                <input className={cl("input")} placeholder={t("e.g. recipe, important")} value={tags} onChange={e => setTags(e.currentTarget.value)} />
            </label>
            <button type="submit" hidden />
            <div className={cl("save-actions")}>
                <button type="button" className={cl("action")} onClick={onDone}>{t("Cancel")}</button>
                <button type="submit" className={cl("action", "action-primary")}>{t("Save")}</button>
            </div>
        </form>
    );
}

/** Opens the save dialog for a Discord message or an indexed/saved one */
export function openSaveModal(source: Message | IndexedMessage | SavedMessage, onSaved?: () => void) {
    const record: IndexedMessage = "ch" in source ? source : {
        id: source.id,
        ch: source.channel_id,
        g: ChannelStore.getChannel(source.channel_id)?.guild_id ?? null,
        a: source.author.id,
        an: (source.author as any).globalName ?? source.author.username,
        c: (source.content ?? "").slice(0, 2000),
        ts: new Date(source.timestamp as any).getTime(),
        r: (source as any).messageReference?.message_id ?? null,
        at: source.attachments?.length ?? 0,
    };
    const existing = "collection" in source ? source : undefined;
    openModal(props => (
        <Modal {...props} size="sm" title={existing ? t("Edit saved message") : t("Save message")} subtitle={record.c.slice(0, 120) || t("Attachment only")}>
            <SaveForm message={record} existing={existing} onDone={() => { props.onClose(); onSaved?.(); }} />
        </Modal>
    ));
}
