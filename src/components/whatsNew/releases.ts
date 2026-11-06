/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BroadcastIcon, DropletIcon, EndcordMark, GamepadIcon, PulseIcon, ShieldCheckIcon } from "@components/EndcordIcons";
import type { IconProps } from "@utils/types";
import type { ComponentType } from "react";

export interface Release {
    version: string;
    summary: string;
    highlights: {
        Icon: ComponentType<IconProps>;
        title: string;
        description: string;
    }[];
}

/**
 * Newest first. Only big releases belong here: anything listed greets people with a card after they update,
 * so a bug fix release stays out, and whether a release gets one is decided when it ships.
 */
export const RELEASES: Release[] = [
    {
        version: "4.1.0",
        summary: "Endcord is easier to reach, easier to make your own, and open about what it's doing.",
        highlights: [
            {
                Icon: EndcordMark,
                title: "Control Center",
                description: "The panda in the title bar now opens your themes, memory use and settings in one place."
            },
            {
                Icon: DropletIcon,
                title: "Theme Studio",
                description: "Pick a color and Discord changes as you drag, with no code. Export it when you like the result."
            },
            {
                Icon: PulseIcon,
                title: "Diagnostics",
                description: "See how long each plugin took to start and how much memory Discord uses, measured on your PC."
            },
            {
                Icon: ShieldCheckIcon,
                title: "Security status",
                description: "Endcord checks its release signature and installed files, and shows you the result."
            },
            {
                Icon: GamepadIcon,
                title: "Game Mode",
                description: "While you play, Discord redraws at 15 FPS and pauses its animations, so your game keeps more of your PC."
            },
            {
                Icon: BroadcastIcon,
                title: "Streamer Shield",
                description: "Blurs your DM list while Streamer Mode is on, and can turn it on when you share your screen."
            }
        ]
    }
];
