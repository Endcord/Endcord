/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "DefaultStatusForever",
    description: "Make statuses default to last forever",
    tags: ["Activity", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    patches: [
        {
            // The custom status window starts "Clear after" at Today when no status is set
            find: '"CLEAR_AFTER"',
            replacement: {
                match: /(?<=""===\i\.expiresAtMs\)return \i\.\i\.)TODAY/,
                replace: "DONT_CLEAR"
            }
        }
    ]
});
