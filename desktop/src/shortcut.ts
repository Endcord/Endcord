/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Windows only shows an app's notifications when a Start menu shortcut carries its app id, which is what an installer
// would make. Endcord Desktop comes as a folder, so it keeps its own shortcut, and points it at wherever it now runs from

import { app, shell } from "electron";
import { join } from "path";

import { APP_ID, ICON, TEST_PROFILE } from "./common";

export const startMenuShortcut = () => join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Endcord Desktop.lnk");

export function ensureStartMenuShortcut() {
    if (process.platform !== "win32" || TEST_PROFILE || !app.isPackaged) return;
    const link = startMenuShortcut();
    try {
        const current = shell.readShortcutLink(link);
        if (current.target === process.execPath && current.appUserModelId === APP_ID) return;
    } catch { }
    shell.writeShortcutLink(link, {
        target: process.execPath,
        appUserModelId: APP_ID,
        description: "Endcord",
        icon: ICON,
        iconIndex: 0
    });
}
