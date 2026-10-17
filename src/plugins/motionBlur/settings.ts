/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    intensity: {
        type: OptionType.SLIDER,
        description: "Intensity of the motion blur effect",
        markers: [0.5, 1.0, 1.5, 2.0, 3.0],
        default: 1.0,
        stickToMarkers: false,
    },
    maxBlur: {
        type: OptionType.SLIDER,
        description: "Maximum blur radius (in pixels)",
        markers: [2, 4, 6, 8, 12, 16],
        default: 6,
        stickToMarkers: false,
    },
    applyToWholeApp: {
        type: OptionType.BOOLEAN,
        description: "Apply motion blur to the entire Discord window during scroll and movement",
        default: true,
    },
});
