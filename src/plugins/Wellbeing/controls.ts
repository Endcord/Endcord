/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    breakReminders: {
        type: OptionType.BOOLEAN,
        description: "Show a gentle nudge to take a break after a while",
        default: true
    },
    breakInterval: {
        type: OptionType.SELECT,
        description: "Nudge me after this much continuous time",
        options: [
            { label: "45 minutes", value: 45 },
            { label: "1 hour", value: 60 },
            { label: "1.5 hours", value: 90, default: true },
            { label: "2 hours", value: 120 }
        ]
    },
    dailyGoalMin: {
        type: OptionType.SELECT,
        description: "A soft daily time goal — only a gentle note, never a limit",
        options: [
            { label: "No goal", value: 0, default: true },
            { label: "1 hour", value: 60 },
            { label: "2 hours", value: 120 },
            { label: "3 hours", value: 180 }
        ]
    }
});

const StatusSetting = getUserSettingLazy<string>("status", "status");

let breakRestore: string | null = null;
let breakTimer: ReturnType<typeof setTimeout> | null = null;

export const currentStatus = (): string => StatusSetting?.getSetting?.() ?? "online";

export function setStatus(status: string) {
    StatusSetting?.updateSetting(status);
}

export function takeBreak(minutes: number) {
    if (!StatusSetting) return;
    if (breakTimer) clearTimeout(breakTimer);
    if (breakRestore == null) breakRestore = StatusSetting.getSetting?.() ?? "online";
    StatusSetting.updateSetting("dnd");
    breakTimer = setTimeout(() => {
        if (breakRestore != null) StatusSetting.updateSetting(breakRestore);
        breakRestore = null;
        breakTimer = null;
    }, minutes * 60_000);
}

export function cancelBreak() {
    if (breakTimer) clearTimeout(breakTimer);
    breakTimer = null;
    if (breakRestore != null) {
        StatusSetting?.updateSetting(breakRestore);
        breakRestore = null;
    }
}
