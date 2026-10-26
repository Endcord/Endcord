/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { disableStyle, enableStyle } from "@api/Styles";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

import style from "./style.css?managed";

export default definePlugin({
    name: "ReadableSpoilers",
    description: "Gives unrevealed spoilers a subtle neon outline so you can spot them at a glance.",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    tags: ["Appearance", "Accessibility"],
    start: () => enableStyle(style),
    stop: () => disableStyle(style),
});
