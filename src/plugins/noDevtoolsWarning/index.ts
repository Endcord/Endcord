/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoDevtoolsWarning",
    required: true,
    description: "Disables the 'HOLD UP' banner in the console. As a side effect, also prevents Discord from hiding your token, which prevents random logouts.",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    tags: ["Developers", "Console"],
    patches: [{
        find: "setDevtoolsCallbacks",
        replacement: {
            match: /if\(null==\i\|\|"0\.0\.0"!==\i\.app\.getVersion\(\)\)/,
            replace: "if(false)"
        }
    }]
});
