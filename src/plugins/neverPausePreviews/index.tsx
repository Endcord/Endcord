/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Notice } from "@components/Notice";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NeverPausePreviews",
    description: "Prevents in-call/PiP previews (screenshare, streams, etc) from pausing even if the client loses focus",
    tags: ["Media"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settingsAboutComponent: () => (
        <Notice.Warning>
            {t("This plugin will cause discord to use more resources than normal")}</Notice.Warning>
    ),
    patches: [
        {
            find: "streamerPaused()",
            replacement: {
                match: /streamerPaused\(\)\{/,
                replace: "$&return false;"
            }
        },
        {
            find: "StreamTile",
            replacement: {
                match: /\i\.\i\.isFocused\(\)/,
                replace: "true"
            }
        }
    ],
});
