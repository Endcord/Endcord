/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findOption, RequiredMessageOption } from "@api/Commands";
import { migrateRemovedPlugin } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

migrateRemovedPlugin("ReverseText", "TalkInReverse");

export default definePlugin({
    name: "ReverseText",
    description: "/reverse flips your message backwards.",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "reverse",
            description: "Reverse your text",
            options: [RequiredMessageOption],
            execute: opts => ({
                content: [...findOption(opts, "message", "")].reverse().join("")
            })
        }
    ]
});
