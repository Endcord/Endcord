/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId } from "@api/ContextMenu";
import { get, set } from "@api/DataStore";
import { updateMessage } from "@api/MessageUpdater";
import ErrorBoundary from "@components/ErrorBoundary";
import { Flex } from "@components/Flex";
import { Devs } from "@utils/constants";
import { t as translateText } from "@utils/i18n";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Message, RenderModalProps } from "@vencord/discord-types";
import { Button, Menu, MessageActions, React, Text, TextInput } from "@webpack/common";

const KEY = "Testcord_MessageTags";
const PRESET_TAGS = ["TODO", "Important", "Question", "Funny"];

interface TaggedMessage {
    channelId: string;
    author: string;
    content: string;
    tags: string[];
    time?: number;
}

let store: Record<string, TaggedMessage> = {};

async function load() {
    store = (await get<Record<string, TaggedMessage>>(KEY)) ?? {};
}

async function persist() {
    await set(KEY, store);
}

const getTags = (id: string) => store[id]?.tags ?? [];

async function toggleTag(msg: Message, tag: string) {
    const entry = store[msg.id] ?? {
        channelId: msg.channel_id,
        author: msg.author?.username ?? "Unknown",
        content: (msg.content || "").slice(0, 140),
        tags: [],
        time: Date.now()
    };

    if (entry.tags.includes(tag)) entry.tags = entry.tags.filter(t => t !== tag);
    else entry.tags = [...entry.tags, tag];

    if (entry.tags.length === 0) delete store[msg.id];
    else store[msg.id] = entry;

    await persist();
    updateMessage(msg.channel_id, msg.id);
}

function TagsModal({ rootProps }: { rootProps: RenderModalProps; }) {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    const [query, setQuery] = React.useState("");
    const [active, setActive] = React.useState<string[]>([]);

    const entries = Object.entries(store);
    const allTags = [...new Set(entries.flatMap(([, e]) => e.tags))].sort();

    function toggleFilter(tag: string) {
        setActive(a => (a.includes(tag) ? a.filter(t => t !== tag) : [...a, tag]));
    }

    function removeAll(id: string) {
        delete store[id];
        persist();
        forceUpdate();
    }

    const needle = query.toLowerCase();
    const shown = entries
        .filter(([, e]) =>
            (!needle || e.author.toLowerCase().includes(needle) || e.content.toLowerCase().includes(needle))
            && (active.length === 0 || active.some(t => e.tags.includes(t))))
        .sort((a, b) => (b[1].time ?? 0) - (a[1].time ?? 0));

    return (
        <ModalRoot {...rootProps} size={ModalSize.LARGE}>
            <ModalHeader>
                <Flex style={{ flexDirection: "column", gap: 8, width: "100%" }}>
                    <Flex style={{ alignItems: "center" }}>
                        <Text variant="heading-lg/semibold" style={{ flexGrow: 1 }}>{translateText("Tagged messages (")}{shown.length}/{entries.length})</Text>
                        <ModalCloseButton onClick={rootProps.onClose} />
                    </Flex>
                    <TextInput value={query} onChange={setQuery} placeholder={translateText("Search by author or text…")} />
                    {allTags.length > 0 && (
                        <Flex style={{ gap: 6, flexWrap: "wrap" }}>
                            {allTags.map(t => (
                                <span
                                    key={t}
                                    onClick={() => toggleFilter(t)}
                                    style={{ cursor: "pointer", background: "var(--brand-500)", color: "var(--white)", borderRadius: 8, padding: "2px 8px", fontSize: 12, opacity: active.includes(t) ? 1 : 0.4 }}
                                >{t}</span>
                            ))}
                        </Flex>
                    )}
                </Flex>
            </ModalHeader>
            <ModalContent>
                {shown.length === 0
                    ? <Text variant="text-md/normal" style={{ padding: "16px 0" }}>{entries.length === 0 ? "No tagged messages yet. Right-click a message → Tags." : "Nothing matches your search."}</Text>
                    : shown.map(([id, e]) => (
                        <Flex key={id} style={{ padding: "8px 0", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <Text variant="text-sm/semibold">{e.author} {e.tags.map(t => (
                                    <span key={t} style={{ background: "var(--brand-500)", color: "var(--white)", borderRadius: 8, padding: "1px 6px", fontSize: 11, marginLeft: 4 }}>{t}</span>
                                ))}</Text>
                                <Text variant="text-sm/normal" style={{ opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {e.content || "(no text)"}
                                </Text>
                            </div>
                            <Button size={Button.Sizes.SMALL} onClick={() => {
                                MessageActions.jumpToMessage({ channelId: e.channelId, messageId: id, flash: true });
                                rootProps.onClose();
                            }}>{translateText("Jump")}</Button>
                            <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => removeAll(id)}>{translateText("Remove")}</Button>
                        </Flex>
                    ))}
            </ModalContent>
        </ModalRoot>
    );
}

function TagChipsInner({ message }: { message: Message; }) {
    const tags = getTags(message.id);
    if (!tags.length) return null;

    return (
        <Flex style={{ gap: 4, alignItems: "center" }}>
            {tags.map(t => (
                <span key={t} style={{ background: "var(--brand-500)", color: "var(--white)", borderRadius: 8, padding: "1px 6px", fontSize: 11 }}>{t}</span>
            ))}
        </Flex>
    );
}

const TagChips = ErrorBoundary.wrap(TagChipsInner, { noop: true });

export default definePlugin({
    name: "MessageTags",
    description: "Tag messages with private local labels (TODO, Important, ...), see them as chips, and browse/jump to them from the Endcord Toolbox in the title bar.",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    tags: ["Utility", "Organisation"],
    dependencies: ["ContextMenuAPI", "MessageAccessoriesAPI", "MessageUpdaterAPI"],

    contextMenus: {
        "message"(children, { message }: { message: Message; }) {
            if (!message?.id) return;
            const current = getTags(message.id);
            const group = findGroupChildrenByChildId("copy-text", children) ?? children;
            group.push(
                <Menu.MenuItem id="tc-tags" label={translateText("Tags")}>
                    {PRESET_TAGS.map(t => (
                        <Menu.MenuCheckboxItem
                            key={t}
                            id={"tc-tag-" + t}
                            label={t}
                            checked={current.includes(t)}
                            action={() => toggleTag(message, t)}
                        />
                    ))}
                </Menu.MenuItem>
            );
        }
    },

    renderMessageAccessory({ message }) {
        return <TagChips message={message} />;
    },

    toolboxActions: {
        "Open Tagged Messages"() {
            openModal(props => <TagsModal rootProps={props} />);
        }
    },

    async start() {
        await load();
    },

    stop() {
        store = {};
    }
});
