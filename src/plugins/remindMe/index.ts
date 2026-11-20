/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

interface Reminder {
    text: string;
    time: number;
    channelId: string;
}

const KEY = "Endcord_reminders";
const UNITS: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
};

const timers = new Set<ReturnType<typeof setTimeout>>();

function fire(r: Reminder) {
    showNotification({
        title: "Reminder",
        body: r.text,
        onClick: () => { }
    });
}

// setTimeout wraps delays above 2^31-1 ms, so long reminders are reached in steps
const MAX_DELAY = 2 ** 31 - 1;

function remove(done: Reminder[]) {
    return DataStore.update<Reminder[]>(KEY, list => (list ?? []).filter(x => !done.some(r => x.time === r.time && x.text === r.text)))
        .catch(e => console.error("[RemindMe] Failed to remove reminder", e));
}

function schedule(r: Reminder) {
    const delay = r.time - Date.now();
    if (delay <= 0) {
        fire(r);
        remove([r]);
        return;
    }
    const id = setTimeout(() => {
        timers.delete(id);
        schedule(r);
    }, Math.min(delay, MAX_DELAY));
    timers.add(id);
}

export default definePlugin({
    name: "RemindMe",
    description: "/remindme <amount> <m|h|d> <text> pings you with a desktop notification later. Survives restarts.",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    dependencies: ["CommandsAPI"],

    async start() {
        const list = (await DataStore.get<Reminder[]>(KEY)) ?? [];
        const now = Date.now();
        // Reminders that came due while Discord was closed are shown once now, then dropped
        const due = list.filter(r => !(r.time > now));
        due.forEach(fire);
        if (due.length) await remove(due);
        list.filter(r => r.time > now).forEach(schedule);
    },

    stop() {
        timers.forEach(clearTimeout);
        timers.clear();
    },

    commands: [
        {
            name: "remindme",
            description: "Set a reminder",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                { name: "amount", description: "How many units from now", type: ApplicationCommandOptionType.INTEGER, required: true },
                {
                    name: "unit", description: "Unit of time", type: ApplicationCommandOptionType.STRING, required: true,
                    choices: [
                        { name: "minutes", value: "m", label: "minutes" },
                        { name: "hours", value: "h", label: "hours" },
                        { name: "days", value: "d", label: "days" }
                    ]
                },
                { name: "text", description: "What to remind you about", type: ApplicationCommandOptionType.STRING, required: true }
            ],
            execute: async (opts, ctx) => {
                const amount = findOption(opts, "amount", 0);
                const unit = findOption(opts, "unit", "m");
                const text = findOption(opts, "text", "");
                if (amount <= 0) {
                    sendBotMessage(ctx.channel.id, { content: "Give me a positive amount of time." });
                    return;
                }
                const reminder: Reminder = { text, time: Date.now() + amount * (UNITS[unit] ?? UNITS.m), channelId: ctx.channel.id };
                if (!Number.isSafeInteger(reminder.time) || reminder.time > 8.64e15) {
                    sendBotMessage(ctx.channel.id, { content: "That is too far in the future." });
                    return;
                }
                await DataStore.update<Reminder[]>(KEY, list => [...(list ?? []), reminder]);
                schedule(reminder);
                sendBotMessage(ctx.channel.id, { content: `⏰ Okay! I'll remind you about **${text}** <t:${Math.floor(reminder.time / 1000)}:R>.` });
            }
        }
    ]
});
