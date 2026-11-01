/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getIsEndcordHidden, setEndcordHidden } from "@api/EndcordVisibility";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "HideEndcord",
    description: "Press F8 to toggle visibility of all Endcord-related settings entries. Plugins remain active.",
    authors: [Devs.ewlle],
    required: false,

    start() {
        document.addEventListener("keydown", this._onKeyDown);
    },

    stop() {
        document.removeEventListener("keydown", this._onKeyDown);
        setEndcordHidden(false);
    },

    _onKeyDown(e: KeyboardEvent) {
        if (e.key === "F8" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
            e.preventDefault();
            setEndcordHidden(!getIsEndcordHidden());
        }
    }
});
