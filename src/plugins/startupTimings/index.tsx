/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { filled, pixelIcon, SOFT } from "@components/EndcordIcons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";

import StartupTimingPage from "./StartupTimingPage";

const StopwatchTabIcon = pixelIcon([
    "...####...",
    "..........",
    "..++++++..",
    ".++++#+++.",
    "+++++#++++",
    "+++++##+++",
    "++++++#+++",
    ".++++++++.",
    "..++++++..",
    ".........."
], filled(() => (
    <>
        <circle opacity={SOFT} cx="12" cy="13.5" r="8" />
        <rect x="9" y="2" width="6" height="2.2" rx="1.1" />
        <path d="M12 8.6a1.1 1.1 0 0 1 1.1 1.1v3.4l2 1.6a1.1 1.1 0 0 1-1.4 1.7l-2.4-2a1.1 1.1 0 0 1-.4-.8V9.7A1.1 1.1 0 0 1 12 8.6Z" />
    </>
)));

export default definePlugin({
    name: "StartupTimings",
    description: "Adds Startup Timings to the Settings menu",
    tags: ["Developers"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    start() {
        SettingsPlugin.customEntries.push({
            key: "endcord_startup_timings",
            title: "Startup Timings",
            Component: StartupTimingPage,
            Icon: StopwatchTabIcon
        });
    },
    stop() {
        removeFromArray(SettingsPlugin.customEntries, e => e.key === "endcord_startup_timings");
    },
});
