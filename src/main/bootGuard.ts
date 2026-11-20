/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addSuspects, beginBoot, BootRecord, BootState, confirmBoot, isMainPage, isSignedOutPage, readBootRecord } from "@shared/bootGuard";
import { IpcEvents } from "@shared/IpcEvents";
import { app, type IpcMainEvent, type WebContents } from "electron";
import { basename, join } from "path";

import { SETTINGS_DIR } from "./utils/constants";
import { readJsonDurably, writeFileDurably } from "./utils/durableFile";
import { handleIpc } from "./utils/ipc";

// Stable, PTB and Canary share the settings folder but crash on their own, so each keeps its own count
const BOOT_FILE = join(SETTINGS_DIR, `boot-${basename(app.getPath("userData"))}.json`);

let current: BootState | undefined;
/** The main page whose start is in the count and not confirmed yet */
let unconfirmed: WebContents | undefined;
const watched = new WeakSet<WebContents>();

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

/** Asked for by the page as it starts, through the settings channel (see GET_SETTINGS in ./settings) */
export function beginBootFor(event: IpcMainEvent): BootState {
    const url = event.sender.getURL();
    if (current && !isMainPage(url)) return current;

    const [record, state] = beginBoot(read());
    // Signed out, Discord waits on its login page and never confirms
    const signedOut = isSignedOutPage(url);
    if (signedOut) record.pending--;
    unconfirmed = signedOut ? undefined : event.sender;
    watchForSignedOut(event.sender);
    // The page waits for this answer, and a durable write takes tens of milliseconds on Windows. This process
    // outlives a crashing page, so the record still reaches the disk when written right after answering
    setImmediate(() => write(record));
    return current = state;
}

// Signed out, Discord opens /app and only then moves to /login, so that start is taken back out of the count
function watchForSignedOut(page: WebContents) {
    if (watched.has(page)) return;
    watched.add(page);

    page.on("did-navigate-in-page", (_, url, isMainFrame) => {
        if (!isMainFrame || unconfirmed !== page || !isSignedOutPage(url)) return;
        unconfirmed = undefined;
        const record = read();
        if (record.pending) write({ ...record, pending: record.pending - 1 });
    });
}

handleIpc(IpcEvents.BOOT_CONFIRM, (_, enabledPlugins: unknown) => {
    unconfirmed = undefined;
    write(confirmBoot(read(), current?.safeMode || !Array.isArray(enabledPlugins) ? null : enabledPlugins));
});

handleIpc(IpcEvents.BOOT_REPORT_CRASH, (_, plugins: unknown) => write(addSuspects(read(), plugins)));

handleIpc(IpcEvents.BOOT_REQUEST_SAFE_MODE, () => write({ ...read(), safeNext: true }));

/** An update that never started was undone. The starts it failed were its doing, not the plugins' */
export function forgetFailedStarts() {
    write({ ...read(), pending: 0 });
}
