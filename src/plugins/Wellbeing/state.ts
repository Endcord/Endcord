/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { get, set } from "@api/DataStore";

const KEY = "Testcord_Wellbeing";
const KEEP_DAYS = 14;

export interface DayStat {
    date: string;
    activeMin: number;
    messages: number;
    sessions: number;
}

interface WellbeingData {
    days: DayStat[];
}

let data: WellbeingData = { days: [] };
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(fn, fn);
    writeQueue = result.then(() => {}, () => {});
    return result;
}

const today = () => new Date().toDateString();
const trim = (days: DayStat[]) => days.slice(-KEEP_DAYS);

export async function loadWellbeing(): Promise<void> {
    const stored = await get<WellbeingData>(KEY);
    data = { days: trim(stored?.days ?? []) };
}

export function recentDays(n: number): DayStat[] {
    const out: DayStat[] = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const dt = new Date(now);
        dt.setDate(now.getDate() - i);
        const key = dt.toDateString();
        out.push(data.days.find(d => d.date === key) ?? { date: key, activeMin: 0, messages: 0, sessions: 0 });
    }
    return out;
}

function ensureToday(): DayStat {
    const key = today();
    let entry = data.days.find(d => d.date === key);
    if (!entry) {
        entry = { date: key, activeMin: 0, messages: 0, sessions: 0 };
        data.days = trim([...data.days, entry]);
    }
    return entry;
}

export function bump(patch: Partial<Pick<DayStat, "activeMin" | "messages" | "sessions">>): Promise<void> {
    return enqueue(async () => {
        const entry = ensureToday();
        entry.activeMin += patch.activeMin ?? 0;
        entry.messages += patch.messages ?? 0;
        entry.sessions += patch.sessions ?? 0;
        await set(KEY, data);
    });
}
