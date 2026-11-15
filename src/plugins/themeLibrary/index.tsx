/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { filled, pixelIcon, SOFT } from "@components/EndcordIcons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";
import { SettingsRouter } from "@webpack/common";

import { settings } from "./utils/settings";

// Icon: stacked theme cards, the front one with a header and a line of text
const ThemeLibraryTabIcon = pixelIcon([
    "...+++++++",
    "...+++++++",
    "...+++++++",
    "########++",
    "#......#++",
    "#.####.#++",
    "#......#..",
    "#.##...#..",
    "########..",
    ".........."
], filled(() => (
    <>
        <rect opacity={SOFT} x="8" y="3" width="13" height="11" rx="2.4" />
        <path fillRule="evenodd" d="M5.4 9h10.2A2.4 2.4 0 0 1 18 11.4v7.2a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 18.6v-7.2A2.4 2.4 0 0 1 5.4 9Zm.6 3a.8.8 0 0 0 0 1.6h5a.8.8 0 0 0 0-1.6H6Zm0 3.4a.8.8 0 0 0 0 1.6h3a.8.8 0 0 0 0-1.6H6Z" />
    </>
)));

export default definePlugin({
    name: "ThemeLibrary",
    description: "A library of themes for Endcord.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    enabledByDefault: true,
    settings,
    toolboxActions: {
        "Open Theme Library": () => {
            SettingsRouter.openUserSettings("endcord_theme_library_panel");
        },
    },

    start() {
        SettingsPlugin.customEntries.push({
            key: "endcord_theme_library",
            title: "Theme Library",
            Component: require("./components/ThemeTab").default,
            Icon: ThemeLibraryTabIcon
        });
    },

    stop() {
        removeFromArray(SettingsPlugin.customEntries, e => e.key === "endcord_theme_library");
    },
});
