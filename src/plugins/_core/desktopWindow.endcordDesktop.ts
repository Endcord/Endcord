/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Endcord Desktop's main window has no frame of its own (desktop/src/main.ts): Discord's title bar takes its place, as
// in Discord's app. Discord's page draws the window buttons and back/forward only for its own app, so they are turned
// on here for the main window. Popouts keep a system frame: their bars carry a windowKey and stay as on the web

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

// macOS keeps its system frame and buttons (desktop/src/main.ts)
const ownButtons = !navigator.userAgent.includes("Macintosh");

export default definePlugin({
    name: "DesktopWindow",
    description: "Discord's own title bar, window buttons and back/forward in Endcord Desktop",
    authors: [Devs.rootpoi],
    required: true,

    window(action: "minimize" | "maximize" | "close") {
        EndcordDesktopNative.window?.[action]();
    },

    patches: [
        {
            find: '"refresh-title-bar-small"',
            predicate: () => ownButtons,
            replacement: [
                {
                    // The title bar above the app
                    match: /(windowKey:(\i),.{0,200}?\i=)\i===\i\.\i\.WINDOWS\|\|\i===\i\.\i\.LINUX/,
                    replace: "$1null==$2"
                },
                {
                    // The bar over full-screen layers (settings) and the login page, which the web leaves out
                    match: /(windowKey:(\i),isLayerOpen:.{0,300}?)if\(\i===\i\.\i\.WEB\)return null;let (\i)=\i\|\|\i===\i\.\i\.LINUX/,
                    replace: "$1let $3=null==$2"
                }
            ]
        },
        {
            find: "showBackForwardButtons:",
            predicate: () => ownButtons,
            replacement: {
                // Discord's app has back and forward in the title bar; they work from the page's own history
                match: /(?<=\i=)\(0,\i\.\i\)\(\)(?=,\i=function\(\i\)\{let\{showBackForwardButtons:)/,
                replace: "!0"
            }
        },
        {
            find: '"DISCORD_APP_BADGE_SET"',
            predicate: () => ownButtons,
            replacement: {
                // The buttons call Discord's app, which isn't here
                match: /(minimize|maximize|close)\((\i)\)\{\i\.window\.\1\(\2\)\}/g,
                replace: '$1($2){$self.window("$1")}'
            }
        }
    ]
});
