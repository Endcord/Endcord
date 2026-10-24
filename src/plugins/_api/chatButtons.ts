/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "ChatInputButtonAPI",
    description: "API to add buttons to the chat input",
    authors: [Devs.Ven],

    patches: [
        {
            find: '"sticker")',
            replacement: [
                {
                    match: /0===(\i)\.length(?=.{0,25}?\(0,\i\.jsxs?\)\(.{0,75}?children:\1)/,
                    replace: "(Endcord.Api.ChatButtons._injectButtons($1,arguments[0]),$&)"
                },
                {
                    // Lets plugins wrap the whole button row (HideChatButtons, CollapsibleUI)
                    match: /(?<="submit"\)\).{0,100}"div",\{className:\i\.\i,children:)(\i)\}/,
                    replace: "Endcord.Api.ChatButtons._wrapButtons($1)}"
                }
            ]
        }
    ]
});
