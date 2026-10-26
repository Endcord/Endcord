/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "StopAutoUnread",
    description: 'Stops Discord from automatically bumping a channels notification setting to "All Messages"',
    tags: ["Notifications"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    patches: [
        {
            find: "}maybeAutoUpgradeChannel(",
            replacement: {
                match: /maybeAutoUpgradeChannel\(\i\){/,
                replace: "$&return !1;"
            }
        }
    ]
});
