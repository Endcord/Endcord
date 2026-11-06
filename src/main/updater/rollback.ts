/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { forgetFailedStarts } from "@main/bootGuard";
import { readJsonDurably, writeFileDurably } from "@main/utils/durableFile";
import { isDiscordOrigin } from "@shared/trustedOrigins";
import { createHash } from "crypto";
import { app } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { join } from "path";

import { ENDCORD_FILES } from "./common";

// A release that starts but never reaches a working Discord must not stay installed: every client would be stuck
// with it, unable to fetch the fix. So an update counts as unproven until the renderer says it came up.

const STATE_FILE = join(__dirname, "update-state.json");
const REJECTED_FILE = join(__dirname, "update-rejected.json");
const PREVIOUS_DIR = join(__dirname, "previous");

// Discord reloads itself now and then, so one failed load proves nothing
const MAX_UNCONFIRMED_LOADS = 3;
// A failed start can be Discord's doing rather than the release's, so the release gets another chance after a day
const REJECTION_TTL = 24 * 60 * 60_000;

interface UpdateState {
    hash: string;
    /** Still true on disk means the files were being swapped when the process died, so they may be from two releases */
    swapping: boolean;
    loads: number;
    /** SHA-256 of each kept file. Missing in a state written by an older Endcord */
    previous?: Record<string, string>;
}

interface Rejection {
    hash: string;
    at?: number;
    notified?: boolean;
}

const readState = () => readJsonDurably<UpdateState>(STATE_FILE);
const writeState = (state: UpdateState) => writeFileDurably(STATE_FILE, JSON.stringify(state));
const readRejection = () => readJsonDurably<Rejection>(REJECTED_FILE);
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Returns whether the kept files were put back. A kept copy that changed on disk since it was saved stays out */
function restorePreviousVersion(state: UpdateState) {
    const kept = ENDCORD_FILES.filter(name => existsSync(join(PREVIOUS_DIR, name)));
    const changed = state.previous ? kept.filter(name => sha256(join(PREVIOUS_DIR, name)) !== state.previous![name]) : [];

    if (changed.length) {
        console.error(`[Endcord] Update ${state.hash} never started properly, but ${changed.join(", ")} changed since it was kept, so nothing was put back`);
    } else {
        for (const name of kept) copyFileSync(join(PREVIOUS_DIR, name), join(__dirname, name));
        console.error(`[Endcord] Update ${state.hash} never started properly, went back to the previous version`);
    }

    writeFileDurably(REJECTED_FILE, JSON.stringify({ hash: state.hash, at: Date.now(), notified: false }));
    rmSync(STATE_FILE, { force: true });
    // Or the next start would be a safe one, blaming the plugins for what the release did
    forgetFailedStarts();
    return !changed.length;
}

export function isRejectedUpdate(hash: string) {
    const rejection = readRejection();
    return rejection?.hash === hash && Date.now() - (rejection.at ?? 0) < REJECTION_TTL;
}

/** Call before the installed files are replaced */
export function keepPreviousVersion(hash: string) {
    mkdirSync(PREVIOUS_DIR, { recursive: true });
    const previous: Record<string, string> = {};
    for (const name of ENDCORD_FILES) {
        const current = join(__dirname, name);
        if (!existsSync(current)) continue;

        copyFileSync(current, join(PREVIOUS_DIR, name));
        previous[name] = sha256(current);
    }

    writeState({ hash, swapping: true, loads: 0, previous });
}

/** Call once every file is in place */
export function finishSwap(hash: string) {
    writeState({ ...readState(), hash, swapping: false, loads: 0 });
}

/** Called by the renderer once Endcord is running. Returns whether this is the first start of an update */
export function confirmUpdate() {
    const justUpdated = existsSync(STATE_FILE);
    const state = readState();

    // A later release that starts makes the rejection of an earlier one old news
    if (state && readRejection()?.hash !== state.hash) rmSync(REJECTED_FILE, { force: true });
    rmSync(STATE_FILE, { force: true });
    return justUpdated;
}

/** The release that was undone, handed out once so the renderer can say so */
export function takeRollbackNotice() {
    const rejection = readRejection();
    if (!rejection || rejection.notified) return null;

    writeFileDurably(REJECTED_FILE, JSON.stringify({ ...rejection, notified: true }));
    return { hash: rejection.hash };
}

export function getRollbackStatus() {
    return {
        pending: existsSync(STATE_FILE),
        hasPrevious: ENDCORD_FILES.every(name => existsSync(join(PREVIOUS_DIR, name))),
        rejected: readRejection()?.hash ?? null
    };
}

/** Returns whether the previous version was put back */
export function recoverInterruptedUpdate() {
    const state = readState();
    if (!state?.swapping) return false;

    return restorePreviousVersion(state);
}

/** Returns whether the previous version was put back, in which case the page needs loading again */
export function recordUnconfirmedLoad() {
    const state = readState();
    if (!state) return false;

    if (++state.loads < MAX_UNCONFIRMED_LOADS) {
        writeState(state);
        return false;
    }

    return restorePreviousVersion(state);
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
