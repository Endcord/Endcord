/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addSuspects, beginBoot, BootRecord, BootState, confirmBoot, readBootRecord } from "@shared/bootGuard";
import { IpcEvents } from "@shared/IpcEvents";
import { app, type IpcMainEvent } from "electron";
import { basename, join } from "path";

import { SETTINGS_DIR } from "./utils/constants";
import { readJsonDurably, writeFileDurably } from "./utils/durableFile";
import { handleIpc } from "./utils/ipc";

// Stable, PTB and Canary share the settings folder but crash on their own, so each keeps its own count
const BOOT_FILE = join(SETTINGS_DIR, `boot-${basename(app.getPath("userData"))}.json`);

let current: BootState | undefined;

function read() {
    try {
        return readBootRecord(readJsonDurably(BOOT_FILE));
    } catch {
        return readBootRecord(null);
    }
}

function write(record: BootRecord) {
    try {
        writeFileDurably(BOOT_FILE, JSON.stringify(record));
    } catch (err) {
        console.error("[Endcord] Failed to write the start record", err);
    }
}

// Popouts and the overlay load the same page, but only the main window's start says whether Discord came up
function isMainPage(url: string) {
    try {
        return !/^\/(?:popout|overlay)/.test(new URL(url).pathname);
    } catch {
        return false;
    }
}

/** Asked for by the page as it starts, through the settings channel (see GET_SETTINGS in ./settings) */
export function beginBootFor(event: IpcMainEvent): BootState {
    if (current && !isMainPage(event.sender.getURL())) return current;

    const [record, state] = beginBoot(read());
    // The page waits for this answer, and a durable write takes tens of milliseconds on Windows. This process
    // outlives a crashing page, so the record still reaches the disk when written right after answering
    setImmediate(() => write(record));
    return current = state;
}

handleIpc(IpcEvents.BOOT_CONFIRM, (_, enabledPlugins: unknown) => {
    write(confirmBoot(read(), current?.safeMode || !Array.isArray(enabledPlugins) ? null : enabledPlugins));
});

handleIpc(IpcEvents.BOOT_REPORT_CRASH, (_, plugins: unknown) => write(addSuspects(read(), plugins)));

handleIpc(IpcEvents.BOOT_REQUEST_SAFE_MODE, () => write({ ...read(), safeNext: true }));

/** An update that never started was undone. The starts it failed were its doing, not the plugins' */
export function forgetFailedStarts() {
    write({ ...read(), pending: 0 });
}
