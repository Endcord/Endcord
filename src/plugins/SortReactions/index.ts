/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Copyright (c) 2024 HAHALOSAH. All rights reserved.
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "SortReactions",
    description: "Sorts reactions by count in chat.",
    tags: ["Reactions", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    patches: [
        {
            find: "visibleReactionsCount:",
            replacement: [
                {
                    match: /\{reactions:(\i),(?=message:\i,readOnly:)/,
                    replace: "{reactions:[...$1].sort((a,b)=>b.count-a.count),",
                },
            ],
        },
    ],
});
