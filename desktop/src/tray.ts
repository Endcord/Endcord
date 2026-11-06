/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, type BrowserWindow, Menu, Tray } from "electron";

import { ICON, TEST_PROFILE } from "./common";
import { getSettings, setSetting } from "./settings";
import { strings } from "./strings";

// Started by the system at sign-in: the window stays in the tray until it's opened
export const HIDDEN_ARG = "--hidden";
const loginItem = { args: [HIDDEN_ARG] };

export function showWindow(win: BrowserWindow) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

/** The tray icon: a click opens or hides the window, the menu holds the app's settings and quitting */
export function createTray(win: BrowserWindow, quit: () => void) {
    if (!ICON) return null;
    const tray = new Tray(ICON);
    const s = strings();
    tray.setToolTip("Endcord");
    tray.on("click", () => {
        if (win.isVisible() && !win.isMinimized() && win.isFocused()) win.hide();
        else showWindow(win);
    });

    const menu = () => Menu.buildFromTemplate([
        { label: s.show, click: () => showWindow(win) },
        { type: "separator" },
        {
            label: s.closeToTray,
            type: "checkbox",
            checked: getSettings().closeToTray,
            click: item => setSetting("closeToTray", item.checked)
        },
        {
            label: process.platform === "win32" ? s.startWithSystem : s.startAtLogin,
            type: "checkbox",
            // A test profile never touches the system's startup list
            enabled: !TEST_PROFILE && process.platform !== "linux",
            checked: !TEST_PROFILE && app.getLoginItemSettings(loginItem).openAtLogin,
            click: item => app.setLoginItemSettings({ ...loginItem, openAtLogin: item.checked })
        },
        { type: "separator" },
        { label: s.quit, click: quit }
    ]);
    tray.setContextMenu(menu());
    return tray;
}
