/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "DisableDeepLinks",
    description: "Disables Discord's stupid deep linking feature which tries to force you to use their Desktop App",
    tags: ["Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    required: true,

    noop: () => { },

    patches: [{
        // Generic route hook plus the quest home and quest preview pages each call it
        find: /\.openNativeAppModal\(.{0,50}?\.DEEP_LINK/,
        all: true,
        replacement: {
            // Starts on the literal: a leading \i makes this global match take ~11 ms on the 900 KB main module
            match: /\.openNativeAppModal(?=\(.{0,50}?\.DEEP_LINK)/g,
            replace: ".openNativeAppModal&&$self.noop",
        }
    }]
});
