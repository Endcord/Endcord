/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// A plugin that breaks Discord at startup would leave the person with nothing to click to turn it off. So every start
// counts as failed until Discord has been up for a while, and after three failed starts in a row Endcord starts with
// its plugins, themes and Custom CSS off. The desktop app keeps this record in a file, the browser in localStorage

export const FAILED_STARTS_BEFORE_SAFE_MODE = 3;
/** Sent on the settings channel to begin a start instead of reading settings */
export const BOOT_REQUEST = "EndcordBeginBoot";
/**
 * Sent on the settings channel by the preload: begins a start and reads the settings in one synchronous call, of which
 * each costs a wait while Discord's main process is busy starting up. A main process from before this answers with the
 * plain settings, and the start is then begun as before
 */
export const BOOT_AND_SETTINGS_REQUEST = "EndcordBeginBootWithSettings";
const MAX_SUSPECTS = 8;
const MAX_PLUGINS = 1000;

export interface BootRecord {
    /** Starts since the last one that came up properly, the current one included */
    pending: number;
    /** Someone asked for the next start to be a safe one */
    safeNext: boolean;
    /** The plugins that were on the last time Discord came up properly */
    lastGood: string[];
    /** Plugins whose changes to Discord's code were in a crash since then */
    suspects: string[];
}

export interface BootState {
    safeMode: boolean;
    reason: "crashes" | "manual" | null;
    failedStarts: number;
    suspects: string[];
    lastGood: string[];
}

export const NORMAL_BOOT: BootState = { safeMode: false, reason: null, failedStarts: 0, suspects: [], lastGood: [] };

const names = (value: unknown, limit = MAX_PLUGINS) => Array.isArray(value)
    ? [...new Set(value.filter((name): name is string => typeof name === "string" && name.length < 100))].slice(0, limit)
    : [];

/** Whatever was stored, damaged or written by another version, comes back in this shape */
export function readBootRecord(raw: unknown): BootRecord {
    const record = raw !== null && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const pending = Number(record.pending);

    return {
        pending: Number.isSafeInteger(pending) && pending > 0 ? pending : 0,
        safeNext: record.safeNext === true,
        lastGood: names(record.lastGood),
        suspects: names(record.suspects, MAX_SUSPECTS)
    };
}

/** Records a start and decides whether it's a safe one */
export function beginBoot(record: BootRecord): [BootRecord, BootState] {
    const failedStarts = record.pending;
    const reason = record.safeNext ? "manual" : failedStarts >= FAILED_STARTS_BEFORE_SAFE_MODE ? "crashes" : null;

    return [
        { ...record, pending: record.pending + 1, safeNext: false },
        { safeMode: reason !== null, reason, failedStarts, suspects: record.suspects, lastGood: record.lastGood }
    ];
}

/**
 * Discord came up and stayed up. A safe start says nothing about the plugins, which were off, so it only clears the
 * count of failed starts and keeps what's known about them
 */
export function confirmBoot(record: BootRecord, enabledPlugins: string[] | null): BootRecord {
    return enabledPlugins
        ? { pending: 0, safeNext: false, lastGood: names(enabledPlugins), suspects: [] }
        : { ...record, pending: 0 };
}

export function addSuspects(record: BootRecord, plugins: unknown): BootRecord {
    return { ...record, suspects: names([...names(plugins), ...record.suspects], MAX_SUSPECTS) };
}
