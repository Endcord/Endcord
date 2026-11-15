/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { filled, pixelIcon, SOFT } from "@components/EndcordIcons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import definePlugin, { StartAt } from "@utils/types";
import { SettingsRouter } from "@webpack/common";

import IconsTab from "./components/IconsTab";
import { SettingsAbout } from "./components/Modals";

const IconFinderTabIcon = pixelIcon([
    "+++..+++..",
    "+++..+++..",
    "+++..+++..",
    "......###.",
    "+++..#...#",
    "+++..#...#",
    "+++..#...#",
    "......###.",
    ".........#",
    ".........."
], filled(() => (
    <>
        <g opacity={SOFT}>
            <rect x="3" y="3" width="6.5" height="6.5" rx="1.8" />
            <rect x="11.5" y="3" width="6.5" height="6.5" rx="1.8" />
            <rect x="3" y="11.5" width="6.5" height="6.5" rx="1.8" />
        </g>
        <path fillRule="evenodd" d="M15.5 10.5a4.5 4.5 0 1 0 2.5 8.2l2.3 2.3a1.1 1.1 0 0 0 1.6-1.6l-2.3-2.3a4.5 4.5 0 0 0-4.1-6.6Zm-2.5 4.5a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0Z" />
    </>
)));

export default definePlugin({
    name: "IconViewer",
    description: "Adds a new tab to settings to preview all icons.",
    tags: ["Developers"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    dependencies: ["Settings", "ConcatenatedModules"],
    startAt: StartAt.WebpackReady,
    toolboxActions: {
        "Open Icons Tab": function() {
            SettingsRouter.openUserSettings("endcord_icon_viewer_panel");
        },
    },
    settingsAboutComponent: SettingsAbout,
    start() {
        SettingsPlugin.customEntries.push({
            key: "endcord_icon_viewer",
            title: "Icon Finder",
            Component: IconsTab,
            Icon: IconFinderTabIcon
        });
    },
    stop() {
        removeFromArray(SettingsPlugin.customEntries, e => e.key === "endcord_icon_viewer");
    },
});
