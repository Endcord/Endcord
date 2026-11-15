/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "WebScreenShareFixes",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    description: "Removes the 2500kbps bitrate cap in Chromium browsers and Endcord Desktop.",
    tags: ["Voice"],
    enabledByDefault: true,

    patches: [
        {
            find: "x-google-max-bitrate",
            replacement: [
                {
                    match: /`x-google-max-bitrate=\$\{\i\}`/,
                    replace: '"x-google-max-bitrate=80000"'
                },
                {
                    // Stereo whenever DTX is off too, not only when Discord's own flag asks for it. VoiceSettings' Force
                    // Stereo may already have put its own ${…} in between
                    match: /(;usedtx=\$\{((?:!1===)?\i)\?"0":"1"\}(?:\$\{[^{}]*\})?\$\{)(\i)(?=\?";stereo=1;sprop-stereo=1":""\})/,
                    replace: "$1$3||$2"
                },
            ]
        }
    ]
});
