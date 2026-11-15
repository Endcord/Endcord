/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { classNameFactory } from "@utils/css";
import { UserStore } from "@webpack/common";

import { ChromeIcon, DiscordIcon, EdgeIcon, FirefoxIcon, IEIcon, MobileIcon, OperaIcon, SafariIcon, UnknownIcon } from "./components/icons";
import { SessionInfo } from "./types";

// Per account. Before anyone has signed in there is no account, and nothing to load or save
const getDataKey = () => {
    const id = UserStore.getCurrentUser()?.id;
    return id ? `BetterSessions_savedSessions_${id}` : null;
};

export const cl = classNameFactory("vc-betterSessions-");
export const savedSessionsCache: Map<string, { name: string, isNew: boolean; }> = new Map();

export function getDefaultName(clientInfo: SessionInfo["session"]["client_info"]) {
    return `${clientInfo.os} · ${clientInfo.platform}`;
}

export async function saveSessionsToDataStore() {
    const key = getDataKey();
    if (key) await DataStore.set(key, savedSessionsCache);
}

export async function fetchNamesFromDataStore() {
    const key = getDataKey();
    if (!key) return;
    const savedSessions = await DataStore.get<Map<string, { name: string, isNew: boolean; }>>(key) || new Map();
    savedSessions.forEach((data, idHash) => {
        savedSessionsCache.set(idHash, data);
    });
}

export function GetOsColor(os: string) {
    switch (os) {
        case "Windows Mobile":
        case "Windows":
            return "#55a6ef"; // Light blue
        case "Linux":
            return "#cdcd31"; // Yellow
        case "Android":
            return "#7bc958"; // Green
        case "Mac OS X":
        case "iOS":
            return ""; // Default to white/black (theme-dependent)
        default:
            return "#f3799a"; // Pink
    }
}

export function GetPlatformIcon(platform: string) {
    switch (platform) {
        case "Discord Android":
        case "Discord iOS":
        case "Discord Client":
            return DiscordIcon;
        case "Android Chrome":
        case "Chrome iOS":
        case "Chrome":
            return ChromeIcon;
        case "Edge":
            return EdgeIcon;
        case "Firefox":
            return FirefoxIcon;
        case "Internet Explorer":
            return IEIcon;
        case "Opera Mini":
        case "Opera":
            return OperaIcon;
        case "Mobile Safari":
        case "Safari":
            return SafariIcon;
        case "BlackBerry":
        case "Facebook Mobile":
        case "Android Mobile":
            return MobileIcon;
        default:
            return UnknownIcon;
    }
}
