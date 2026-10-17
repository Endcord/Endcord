/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    directColor: {
        type: OptionType.STRING,
        description: "Color for direct mentions (hex, rgb, or css variable)",
        default: "#23a55a",
    },
    includeGuilds: {
        type: OptionType.BOOLEAN,
        description: "Apply green badge to servers in the server list when directly mentioned",
        default: true,
    },
    includeChannels: {
        type: OptionType.BOOLEAN,
        description: "Apply green badge to channels in the channel list when directly mentioned",
        default: true,
    },
});
