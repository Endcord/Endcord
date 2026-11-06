/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// A browser gives text fields a menu of its own: spelling fixes, cut, copy, paste. Electron gives none, so without this a
// right click in the message box does nothing. Discord's own menus (messages, users, channels) stop the event in the
// page, so this only ever shows where Discord has none

import { isSafeExternalUrl } from "@shared/externalLinks";
import { BrowserWindow, clipboard, Menu, type MenuItemConstructorOptions, type WebContents } from "electron";

import { strings } from "./strings";

export function addTextMenu(contents: WebContents) {
    contents.on("context-menu", (_event, params) => {
        const s = strings();
        const items: MenuItemConstructorOptions[] = [];

        if (params.isEditable) {
            if (params.misspelledWord) {
                for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
                    items.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) });
                }
                items.push(
                    { label: s.addToDictionary, click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord) },
                    { type: "separator" }
                );
            }
            items.push(
                { role: "cut", label: s.cut, enabled: params.editFlags.canCut },
                { role: "copy", label: s.copy, enabled: params.editFlags.canCopy },
                { role: "paste", label: s.paste, enabled: params.editFlags.canPaste },
                { type: "separator" },
                { role: "selectAll", label: s.selectAll }
            );
        } else if (params.linkURL && isSafeExternalUrl(params.linkURL)) {
            items.push({ label: s.copyLink, click: () => clipboard.writeText(params.linkURL) });
            if (params.selectionText.trim()) items.push({ role: "copy", label: s.copy });
        } else if (params.selectionText.trim()) {
            items.push({ role: "copy", label: s.copy });
        }

        if (items.length) Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(contents) ?? undefined });
    });
}
