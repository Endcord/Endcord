/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { filled, pixelIcon, SOFT } from "@components/EndcordIcons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { removeFromArray } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { SettingsRouter } from "@webpack/common";

import { loadPresets } from "./utils/storage";

// Icon: two people, the current profile in front and the next one behind
const ProfilesTabIcon = pixelIcon([
    ".......++.",
    "..##..++++",
    ".####.++++",
    ".####..++.",
    "..##......",
    "......+++.",
    ".######+++",
    "########++",
    "########++",
    ".........."
], filled(() => (
    <>
        <g opacity={SOFT}>
            <circle cx="16.5" cy="6.5" r="3" />
            <path d="M12.6 12.3A6 6 0 0 1 22 17.2V18a1 1 0 0 1-1 1h-2.7a7.6 7.6 0 0 0-5.7-6.7Z" />
        </g>
        <circle cx="9" cy="8.5" r="3.5" />
        <path d="M2 19.2C2 15.8 5.1 13 9 13s7 2.8 7 6.2V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-.8Z" />
    </>
)));

export const cl = classNameFactory("vc-profile-presets-");
export const settings = definePluginSettings({
    avatarSize: {
        type: OptionType.SLIDER,
        description: "Avatar size in preset list.",
        markers: [56, 64, 72, 80, 88, 96],
        default: 56,
        stickToMarkers: true
    },
});

export default definePlugin({
    name: "ProfileSets",
    description: "Allows you to save and load different profile presets.",
    tags: ["Appearance", "Customisation", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,
    toolboxActions: {
        "Open Profile Sets": () => {
            SettingsRouter.openUserSettings("endcord_profile_sets_panel");
        },
    },

    start() {
        loadPresets("main");
        SettingsPlugin.customEntries.push({
            key: "endcord_profile_sets",
            title: "Profile Sets",
            Component: require("./components/profileSetsTab").default,
            Icon: ProfilesTabIcon
        });
    },

    stop() {
        removeFromArray(SettingsPlugin.customEntries, e => e.key === "endcord_profile_sets");
    },
});
