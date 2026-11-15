/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoRoleHeaders",
    description: "Removes the role headers from the member list, so everyone is listed together.",
    tags: ["Appearance", "Fun", "Roles"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    patches: [
        {
            find: "this.updateMaxContentFeedRowSeen()",
            replacement: {
                match: /return \i===\i\.\i\.UNKNOWN/,
                replace: "return null;$&"
            }
        }
    ]
});
