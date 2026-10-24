/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId } from "@api/ContextMenu";
import { get, set } from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { Flex } from "@components/Flex";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Message, RenderModalProps } from "@vencord/discord-types";
import { Button, ChannelStore, Menu, MessageActions, React, showToast, Text } from "@webpack/common";

const KEY = "Testcord_Reminders";

interface Reminder {
    id: string;
    messageId: string;
    channelId: string;
    author: string;
    content: string;
    remindAt: number;
}

let reminders: Reminder[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

async function load() {
    reminders = (await get<Reminder[]>(KEY)) ?? [];
}

async function save() {
    await set(KEY, reminders);
}

function atHour(hour: number, dayOffset = 0) {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d.getTime() + dayOffset * 86_400_000;
}

const PRESETS: { label: string; at: () => number; }[] = [
    { label: "In 30 minutes", at: () => Date.now() + 30 * 60_000 },
    { label: "In 1 hour", at: () => Date.now() + 60 * 60_000 },
    { label: "In 3 hours", at: () => Date.now() + 3 * 60 * 60_000 },
    { label: "This evening", at: () => atHour(18) > Date.now() ? atHour(18) : atHour(18, 1) },
    { label: "Tomorrow morning", at: () => atHour(9, 1) }
];

async function addReminder(msg: Message, remindAt: number) {
    reminders = [...reminders, {
        id: `${msg.id}-${remindAt}`,
        messageId: msg.id,
        channelId: msg.channel_id,
        author: msg.author?.username ?? "Unknown",
        content: (msg.content || "").slice(0, 140),
        remindAt
    }];
    await save();
    showToast(`Reminder set for ${new Date(remindAt).toLocaleString()}.`, "success");
}

function fire(r: Reminder) {
    showNotification({
        title: `Reminder: message from ${r.author}`,
        body: r.content || "Jump to the message you saved.",
        onClick: () => MessageActions.jumpToMessage({ channelId: r.channelId, messageId: r.messageId, flash: true })
    });
}

async function checkDue() {
    const now = Date.now();
    const due = reminders.filter(r => r.remindAt <= now);
    if (!due.length) return;
    reminders = reminders.filter(r => r.remindAt > now);
    await save();
    due.forEach(fire);
}

function RemindersModal({ rootProps }: { rootProps: RenderModalProps; }) {
    const [list, setList] = React.useState<Reminder[]>([...reminders].sort((a, b) => a.remindAt - b.remindAt));

    function cancel(id: string) {
        reminders = reminders.filter(r => r.id !== id);
        save();
        setList([...reminders].sort((a, b) => a.remindAt - b.remindAt));
    }

    return (
        <ModalRoot {...rootProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <Flex style={{ alignItems: "center", width: "100%" }}>
                    <Text variant="heading-lg/semibold" style={{ flexGrow: 1 }}>{t("Reminders (")}{list.length})</Text>
                    <ModalCloseButton onClick={rootProps.onClose} />
                </Flex>
            </ModalHeader>
            <ModalContent>
                {list.length === 0
                    ? <Text variant="text-md/normal" style={{ padding: "16px 0" }}>{t("No reminders yet. Right-click a message and choose Remind me.")}</Text>
                    : list.map(r => (
                        <Flex key={r.id} style={{ padding: "8px 0", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <Text variant="text-sm/semibold">{new Date(r.remindAt).toLocaleString()}</Text>
                                <Text variant="text-sm/normal" style={{ opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {r.author}: {r.content || "(no text)"}
                                </Text>
                            </div>
                            <Button size={Button.Sizes.SMALL} onClick={() => {
                                MessageActions.jumpToMessage({ channelId: r.channelId, messageId: r.messageId, flash: true });
                                rootProps.onClose();
                            }}>{t("Jump")}</Button>
                            <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => cancel(r.id)}>{t("Cancel")}</Button>
                        </Flex>
                    ))}
            </ModalContent>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "MessageReminders",
    description: "Right-click a message to be reminded about it later. A notification brings you right back to it.",
    authors: [Devs.ewlle, Devs.kraethis, Devs.Sharp],
    tags: ["Utility", "Chat"],

    contextMenus: {
        "message"(children, { message }: { message: Message; }) {
            if (!message?.id || !ChannelStore.getChannel(message.channel_id)) return;
            const group = findGroupChildrenByChildId("pin", children) ?? children;
            group.push(
                <Menu.MenuItem id="tc-remind" label={t("Remind me")}>
                    {PRESETS.map(p => (
                        <Menu.MenuItem
                            key={p.label}
                            id={"tc-remind-" + p.label}
                            label={p.label}
                            action={() => addReminder(message, p.at())}
                        />
                    ))}
                </Menu.MenuItem>
            );
        }
    },

    toolboxActions: {
        "Open Reminders"() {
            openModal(props => <RemindersModal rootProps={props} />);
        }
    },

    async start() {
        await load();
        await checkDue();
        timer = setInterval(checkDue, 30_000);
    },

    stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        reminders = [];
    }
});
