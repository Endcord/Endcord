/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Screen sharing. Discord's page calls getDisplayMedia; the preload shows Endcord's picker first (desktop/src/preload.ts),
// tells this process what was picked, and only then lets the call through, which gets exactly that

import { desktopCapturer, type DesktopCapturerSource, ipcMain, type Session, type WebFrameMain } from "electron";
import { release } from "os";

import { fromDiscord } from "./common";
import { DesktopIpc, type ShareSource } from "./ipc";

// Windows 10 2004 and later can leave one program's sound out of what the computer plays: this one's. The option is
// Chromium's, which Electron passes on without documenting it
const LOOPBACK = process.platform === "win32" && Number(release().split(".")[2]) >= 19041 ? "loopbackWithoutChrome" : "loopback";

const frameKey = (frame: WebFrameMain) => `${frame.processId}:${frame.routingId}`;

/** The sources the picker showed, and the one picked from them, until Chromium asks for it */
let share: { frame: string; sources: DesktopCapturerSource[]; picked?: { source: DesktopCapturerSource; audio: boolean; at: number; }; } | null = null;

export function setUpScreenShare(ses: Session) {
    // Anything that asks without a pick first gets nothing
    ses.setDisplayMediaRequestHandler((request, callback) => {
        const picked = share?.picked;
        const fresh = picked && request.frame && frameKey(request.frame) === share!.frame && Date.now() - picked.at < 15_000;
        share = null;
        if (!fresh) return callback(null as never);

        // The page only asks for sound when it was picked. It gets what the computer plays minus this app's own sound:
        // Discord's voice would go out with the stream otherwise, and everyone in the call would hear themselves
        const audio = request.audioRequested && picked.audio ? LOOPBACK : undefined;
        callback({ video: picked.source, audio: audio as never });
    });
}

ipcMain.handle(DesktopIpc.GET_SOURCES, async (event): Promise<ShareSource[] | null> => {
    if (!fromDiscord(event)) return null;
    try {
        const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 } });
        share = { frame: frameKey(event.senderFrame!), sources };
        return sources.map(source => ({
            id: source.id,
            name: source.name,
            screen: source.id.startsWith("screen:"),
            thumbnail: `data:image/jpeg;base64,${source.thumbnail.toJPEG(72).toString("base64")}`
        }));
    } catch {
        return null;
    }
});

ipcMain.handle(DesktopIpc.PICK_SOURCE, (event, id: unknown, audio: unknown) => {
    if (!fromDiscord(event) || !share || share.frame !== frameKey(event.senderFrame!)) return false;
    const source = share.sources.find(s => s.id === id);
    if (!source) return false;
    // Only Windows can share the computer's sound along with the picture
    share.picked = { source, audio: audio === true && process.platform === "win32", at: Date.now() };
    return true;
});
