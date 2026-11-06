/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoDraftLengthLimit",
    description: "Removes the 4500 character saved draft message truncation",
    tags: ["Chat", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    patches: [
        {
            find: "ApplicationLauncherCommand=3",
            replacement: {
                // The limit as a constant, or on Canary the number written where drafts are cut
                match: /(let \i=)\i\(\d+\)\.CS1\+500|(?<=\.length>)\d+(?=&&\(\i=\i\.substr\(0,\d+\)\))/,
                replace: (_, constant) => `${constant ?? ""}Number.MAX_SAFE_INTEGER`
            }
        }
    ]
});
