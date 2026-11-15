/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { FormatSetting } from ".";

export const settings = definePluginSettings({
    format: {
        component: ({ setValue }) => FormatSetting(setValue),
        type: OptionType.COMPONENT,
        default: "{endcordIcon} Endcord {endcordVersion} ({endcordHash})",
        restartNeeded: true
    }
});

export const names: Record<string, string> = {
    stable: "Stable",
    ptb: "PTB",
    canary: "Canary",
    staging: "Staging"
};

export const settingVariables = [
    "Discord Variables:",
    "{discordIcon} - Discord icon",
    "{devbannerIcon} - Dev banner icon",
    "{buildChannel} - Discord build channel (e.g. Stable)",
    "{buildNumber} - Discord build number (e.g. 123456)",
    "{buildHash} - Discord build hash (e.g. 123456789)",
    "",
    "Endcord Variables:",
    "{endcordIcon} - Endcord icon",
    "{endcordName} - Endcord",
    "{endcordVersion} - Version of Endcord (e.g. 1.0.0)",
    "{endcordHash} - Endcord build hash (e.g. 123456789)",
    "{endcordPlatform} - Platform Endcord is running on (e.g. Dev Build)",
    "",
    "Endcord Desktop Variables:",
    "{desktopHash} - Endcord Desktop build hash (e.g. 123456789)",
    "{desktopPlatform} - Platform Endcord Desktop is running on (e.g. Dev Build)",
    "",
    "Client Variables:",
    "{clientIcon} - Desktop icon",
    "{clientName} - The name of your current client",
    "{clientVersion} - Version of your client (e.g. 1.0.0)",
    "",
    "Electron Variables:",
    "{electronIcon} - Electron icon",
    "{electronVersion} - Electron runtime version (e.g. 25.0.0)",
    "",
    "Chromium Variables:",
    "{chromiumIcon} - Chromium icon",
    "{chromiumVersion} - Chromium engine version (e.g. 125.0.0.0)",
    "",
    "Miscellaneous Variables:",
    "{newline} or \\n - Newline character",
    "",
];
