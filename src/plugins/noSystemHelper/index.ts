/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoSystemHelper",
    required: true,
    hidden: true,
    description: "Stops Discord from asking for administrator permission to install Discord System Helper.",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    patches: [{
        find: "System service installed",
        replacement: {
            // Discord is told the helper can't be installed on this PC, so it never asks, never shows the warning bar
            // and never tries. Skipping only the install call made Discord think it had worked: it then started the
            // helper's input and tool services, which retried a connection to the missing helper for as long as it ran.
            // A helper that is already installed is still used as in Discord itself.
            match: /\i\.\i\.CanSystemServiceBeInstalled\(\)/g,
            replace: "false"
        }
    }]
});
