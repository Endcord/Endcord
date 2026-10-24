/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    restoreGuildSettings: {
        type: OptionType.BOOLEAN,
        description: "Restore server-level settings (verification level, system channel, locale, ...) when restoring a backup.",
        default: true
    },
    restoreName: {
        type: OptionType.BOOLEAN,
        description: "Also overwrite the target server's name with the name stored in the backup.",
        default: false
    },
    includeHiddenChannels: {
        type: OptionType.BOOLEAN,
        description: "Also export channels you cannot view, including their permission overwrites. Requires a plugin that reveals hidden channels (e.g. ShowHiddenChannels), otherwise the channel data may be obfuscated.",
        default: true
    },
    includeMemberOverwrites: {
        type: OptionType.BOOLEAN,
        description: "Copy channel permission overwrites that target individual members. The member must already be in the target server.",
        default: false
    },
    deleteExisting: {
        type: OptionType.BOOLEAN,
        description: "Delete the target server's existing channels and roles before restoring. This cannot be undone.",
        default: false
    },
    requestDelay: {
        type: OptionType.SLIDER,
        description: "Delay in milliseconds between write requests. Higher values are slower but safer against rate limits.",
        markers: [0, 100, 250, 500, 1000],
        default: 250,
        stickToMarkers: true
    }
});
