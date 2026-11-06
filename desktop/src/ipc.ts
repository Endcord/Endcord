/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** What Endcord Desktop's window and its main process say to each other, apart from Endcord's own IPC */
export const enum DesktopIpc {
    /** The screens and windows the share picker shows */
    GET_SOURCES = "EndcordDesktopGetSources",
    /** The one picked from them, for the getDisplayMedia call that follows */
    PICK_SOURCE = "EndcordDesktopPickSource",
    RELAUNCH = "EndcordDesktopRelaunch",
    COPY_IMAGE = "EndcordDesktopCopyImage",
}

export interface ShareSource {
    id: string;
    name: string;
    /** A whole screen rather than one window */
    screen: boolean;
    /** A small JPEG of it, as a data: URL */
    thumbnail: string;
}

export interface PickedSource {
    id: string;
    /** Share the computer's sound too (Windows only) */
    audio: boolean;
}
