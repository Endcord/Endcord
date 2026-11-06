/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { registerCommands } from "@plugins/commandPalette/api/registry";

import { loadCustomCommands, registerCustomCommands } from "./custom";
import { discordCommands } from "./discordActions";
import { endcordCommands } from "./endcord";
import { navigationCommands } from "./navigation";
import { pluginCommands } from "./pluginManagement";
import { sendDmCommand } from "./sendDm";

export async function registerBuiltinCommands() {
    registerCommands("CommandPalette.builtin", [
        ...navigationCommands,
        ...discordCommands,
        ...pluginCommands,
        ...endcordCommands,
        sendDmCommand
    ]);

    await loadCustomCommands();
    registerCustomCommands();
}
