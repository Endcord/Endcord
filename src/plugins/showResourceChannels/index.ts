/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "ShowResourceChannels",
    description: "Shows the channels hidden behind Server Resources in the channel list.",
    tags: ["Servers"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    patches: [
        {
            find: ".GUILD_DIRECTORY:null",
            replacement: [
                {
                    match: /\i\.hideResourceChannels&&/,
                    replace: "false&&"
                }
            ]
        }
    ]
});
