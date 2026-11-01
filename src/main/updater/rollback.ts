/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readJsonDurably, writeFileDurably } from "@main/utils/durableFile";
import { isDiscordOrigin } from "@shared/trustedOrigins";
import { app } from "electron";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

import { ENDCORD_FILES } from "./common";

// A release that starts but never reaches a working Discord must not stay installed: every client would be stuck
// with it, unable to fetch the fix. So an update counts as unproven until the renderer says it came up.

const STATE_FILE = join(__dirname, "update-state.json");
const REJECTED_FILE = join(__dirname, "update-rejected.json");
const PREVIOUS_DIR = join(__dirname, "previous");

// Discord reloads itself now and then, so one failed load proves nothing
const MAX_UNCONFIRMED_LOADS = 3;

interface UpdateState {
    hash: string;
    /** Still true on disk means the files were being swapped when the process died, so they may be from two releases */
    swapping: boolean;
    loads: number;
}

const readState = () => readJsonDurably<UpdateState>(STATE_FILE);
const writeState = (state: UpdateState) => writeFileDurably(STATE_FILE, JSON.stringify(state));

function restorePreviousVersion(state: UpdateState) {
    for (const name of ENDCORD_FILES) {
        const previous = join(PREVIOUS_DIR, name);
        if (existsSync(previous)) copyFileSync(previous, join(__dirname, name));
    }

    writeFileDurably(REJECTED_FILE, JSON.stringify({ hash: state.hash }));
    rmSync(STATE_FILE, { force: true });
    console.error(`[Endcord] Update ${state.hash} never started properly, went back to the previous version`);
}

export function isRejectedUpdate(hash: string) {
    return readJsonDurably<{ hash: string; }>(REJECTED_FILE)?.hash === hash;
}

/** Call before the installed files are replaced */
export function keepPreviousVersion(hash: string) {
    mkdirSync(PREVIOUS_DIR, { recursive: true });
    for (const name of ENDCORD_FILES) {
        const current = join(__dirname, name);
        if (existsSync(current)) copyFileSync(current, join(PREVIOUS_DIR, name));
    }

    writeState({ hash, swapping: true, loads: 0 });
}

/** Call once every file is in place */
export function finishSwap(hash: string) {
    writeState({ hash, swapping: false, loads: 0 });
}

/** Called by the renderer once Endcord is running */
export function confirmUpdate() {
    rmSync(STATE_FILE, { force: true });
}

/** Returns whether the previous version was put back */
export function recoverInterruptedUpdate() {
    const state = readState();
    if (!state?.swapping) return false;

    restorePreviousVersion(state);
    return true;
}

/** Returns whether the previous version was put back, in which case the page needs loading again */
export function recordUnconfirmedLoad() {
    const state = readState();
    if (!state) return false;

    if (++state.loads < MAX_UNCONFIRMED_LOADS) {
        writeState(state);
        return false;
    }

    restorePreviousVersion(state);
    return true;
}

export function initUpdateRollback() {
    recoverInterruptedUpdate();

    // Counting page loads rather than process starts ignores second instances and starting up offline
    app.on("browser-window-created", (_, win) => {
        win.webContents.on("did-finish-load", () => {
            let origin: string;
            try {
                ({ origin } = new URL(win.webContents.getURL()));
            } catch {
                return;
            }

            if (isDiscordOrigin(origin) && recordUnconfirmedLoad()) win.webContents.reload();
        });
    });
}
