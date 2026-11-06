/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Icon } from "@endcord/discord-types";
import { iconsModule, loadAllIcons } from "@plugins/_core/concatenatedModules";

export function getDiscordFolderIcon(name?: string): Icon | undefined {
    if (!name) return;

    const icon = iconsModule[name];
    // An icon Discord hasn't shown yet isn't loaded: fetch them, and the folder shows it the next time it draws
    if (icon === undefined) void loadAllIcons();
    return typeof icon === "function" && name.endsWith("Icon") ? icon : undefined;
}

export function getDiscordFolderIconNames(): string[] {
    return Object.keys(iconsModule)
        .filter(name => name.endsWith("Icon") && typeof iconsModule[name] === "function")
        .sort((a, b) => a.localeCompare(b));
}
