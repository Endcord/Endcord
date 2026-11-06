/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { PlainSettings } from "@api/Settings";
import { exportSettings, importSettings } from "@api/SettingsSync/offline";
import { Logger } from "@utils/Logger";

// Copies of the settings to go back to: one a day while Discord runs fine, and one before anything that changes many
// plugins at once. They stay on this device, without the keys and tokens a backup file leaves out too
const STORE_KEY = "Endcord_settingsSnapshots";
const MAX_SNAPSHOTS = 14;
const MAX_DAILY = 7;
const DAILY_EVERY = 20 * 60 * 60_000;

const logger = new Logger("SettingsSnapshots", "#9ccbff");

export type SnapshotKind = "daily" | "manual" | "profile" | "pack" | "welcome" | "restore";

export interface SnapshotInfo {
    id: string;
    at: number;
    kind: SnapshotKind;
    /** The profile or packs it was taken for */
    subject?: string;
    pluginsOn: number;
}

interface Snapshot extends SnapshotInfo {
    data: string;
}

const read = async () => (await DataStore.get<Snapshot[]>(STORE_KEY))?.filter(snapshot => typeof snapshot?.data === "string") ?? [];

const countPluginsOn = () => Object.values(PlainSettings.plugins).filter(plugin => plugin?.enabled).length;

export async function takeSnapshot(kind: SnapshotKind, subject?: string) {
    try {
        const snapshot: Snapshot = { id: crypto.randomUUID(), at: Date.now(), kind, subject, pluginsOn: countPluginsOn(), data: await exportSettings({ minify: true }) };

        // Newest first. Dailies make way for each other, so a week of them can't push out the one before a big change
        let snapshots = [snapshot, ...await read()];
        const dailies = snapshots.filter(s => s.kind === "daily");
        if (dailies.length > MAX_DAILY) {
            const dropped = new Set(dailies.slice(MAX_DAILY));
            snapshots = snapshots.filter(s => !dropped.has(s));
        }

        await DataStore.set(STORE_KEY, snapshots.slice(0, MAX_SNAPSHOTS));
    } catch (err) {
        logger.error("Couldn't take a snapshot", err);
    }
}

export async function listSnapshots(): Promise<SnapshotInfo[]> {
    return (await read()).map(({ data, ...info }) => info);
}

/** Called after a start that came up fine, so the daily one is a set of settings known to work */
export async function maybeTakeDailySnapshot() {
    const latest = (await read()).find(snapshot => snapshot.kind === "daily");
    if (!latest || Date.now() - latest.at > DAILY_EVERY) await takeSnapshot("daily");
}

/** Puts a snapshot's settings back, after saving the current ones so this can be undone too. Needs a restart */
export async function restoreSnapshot(id: string) {
    const snapshot = (await read()).find(s => s.id === id);
    if (!snapshot) throw new Error("That snapshot is gone");

    await takeSnapshot("restore");
    await importSettings(snapshot.data);
}

export async function deleteSnapshot(id: string) {
    await DataStore.set(STORE_KEY, (await read()).filter(snapshot => snapshot.id !== id));
}
