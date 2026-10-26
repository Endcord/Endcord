/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "DisableCameras",
    description: "Disables cameras in a call by default",
    tags: ["Appearance", "Customisation", "Media", "Privacy"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    patches: [
        {
            find: ".identifyStartTime))",
            replacement: {
                match: /\i\.self_video\|\|!1/g,
                replace: "false"
            },
        }
    ]
});
