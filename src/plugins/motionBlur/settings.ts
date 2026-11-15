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
        // The blur stops at 6 px (see triggerBlurPulse), so the slider does too
        markers: [1, 2, 3, 4, 5, 6],
        default: 6,
        stickToMarkers: false,
    },
});
