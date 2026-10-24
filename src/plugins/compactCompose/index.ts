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
    name: "CompactCompose",
    description: "Slims down the message box and hides the upload/gift clutter until you focus it.",
    authors: [Devs.ewlle, Devs.kraethis, Devs.Sharp],
    tags: ["Appearance"],
    start: () => enableStyle(style),
    stop: () => disableStyle(style),
});
