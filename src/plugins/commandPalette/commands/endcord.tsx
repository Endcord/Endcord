/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IS_SAFE_MODE, restartInSafeMode } from "@api/SafeMode";
import { openShortcutsModal } from "@components/shortcuts";
import { openWhatsNewModal } from "@components/whatsNew";
import type { PaletteCommand } from "@plugins/commandPalette/api/types";
import { BoltIcon, GearIcon, KeyboardIcon, PaintIcon, RestartIcon } from "@plugins/commandPalette/ui/icons";
import { relaunch } from "@utils/native";

import { openSettingsPage } from "./openSettings";

const SECTION = "Endcord";

export const endcordCommands: PaletteCommand[] = [
    {
        id: "endcord.settings",
        title: "Open Endcord Settings",
        section: SECTION,
        keywords: ["endcord", "settings"],
        icon: GearIcon,
        actions: [{
            id: "run",
            label: "Open Endcord Settings",
            run: () => void openSettingsPage("endcord_main")
        }]
    },
    {
        id: "endcord.quickCss",
        title: "Open QuickCSS",
        section: SECTION,
        keywords: ["css", "quickcss", "editor", "style"],
        icon: PaintIcon,
        actions: [{
            id: "run",
            label: "Open QuickCSS",
            run: () => EndcordNative.quickCss.openEditor()
        }]
    },
    {
        id: "endcord.updater",
        title: "Open Updater",
        section: SECTION,
        keywords: ["update", "updater", "version"],
        icon: BoltIcon,
        predicate: () => !IS_UPDATER_DISABLED,
        actions: [{
            id: "run",
            label: "Open Updater",
            run: () => void openSettingsPage("endcord_updater")
        }]
    },
    {
        id: "endcord.changelog",
        title: "What's New",
        section: SECTION,
        keywords: ["changelog", "news", "whats new"],
        icon: BoltIcon,
        actions: [{
            id: "run",
            label: "What's New",
            run: () => void openWhatsNewModal()
        }]
    },
    {
        id: "endcord.shortcuts",
        title: "Keyboard Shortcuts",
        section: SECTION,
        keywords: ["shortcuts", "keybinds", "hotkeys", "keys"],
        icon: KeyboardIcon,
        actions: [{
            id: "run",
            label: "Show Keyboard Shortcuts",
            run: openShortcutsModal
        }]
    },
    {
        id: "endcord.snapshots",
        title: "Settings Snapshots",
        section: SECTION,
        keywords: ["snapshot", "backup", "restore", "undo", "go back"],
        icon: RestartIcon,
        actions: [{
            id: "run",
            label: "Open Snapshots",
            run: () => void openSettingsPage("endcord_backup_restore")
        }]
    },
    {
        id: "endcord.safeMode",
        title: IS_SAFE_MODE ? "Restart Normally" : "Restart in Safe Mode",
        section: SECTION,
        keywords: ["safe mode", "safe", "crash", "troubleshoot", "without plugins"],
        icon: RestartIcon,
        actions: [{
            id: "run",
            label: IS_SAFE_MODE ? "Restart Normally" : "Restart in Safe Mode",
            run: () => void (IS_SAFE_MODE ? relaunch() : restartInSafeMode())
        }]
    },
    {
        id: "endcord.restart",
        title: "Restart Discord",
        section: SECTION,
        keywords: ["restart", "reload", "refresh"],
        icon: RestartIcon,
        actions: [{
            id: "run",
            label: "Restart Discord",
            run: () => window.location.reload()
        }]
    }
];
