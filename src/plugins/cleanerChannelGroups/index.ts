/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "CleanerChannelGroups",
    description: "Hides all channels in collapsed categories, even if they have unread messages.",
    tags: ["Appearance", "Customisation", "Chat", "Organisation", "Servers"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    patches: [
        {
            find: '"placeholder-channel-id"',
            replacement: [
                {
                    match: /this\.category\.isCollapsed&&\(.{0,600}?\)\?\{renderLevel:3,threadIds:/,
                    replace: "this.category.isCollapsed?{renderLevel:3,threadIds:"
                },
                {
                    match: /(?<=!this.category.isCollapsed.{0,50}\i=)(\i\(this\.record,.{0,5},\i\.hideMutedChannels\);)/,
                    replace: "this.category.isCollapsed?[]:$1"
                }
            ]
        }
    ]
});
