/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { AppsIcon, EndcordMark, PulseIcon, ShieldCheckIcon, SlidersIcon, SparkleIcon } from "@components/EndcordIcons";
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
        version: "4.1.1",
        summary: "Safer, back in step with Discord, and a little more playful.",
        highlights: [
            {
                Icon: ShieldCheckIcon,
                title: "Security fixes",
                description: "SharePerms, AntiDeleteMessage, settings files and shared profiles can't be pushed past what they're for."
            },
            {
                Icon: PulseIcon,
                title: "Discord's updates",
                description: "Plugins Discord's November updates broke work again, and Endcord's notifications show again."
            },
            {
                Icon: EndcordMark,
                title: "Panda visits",
                description: "Now and then the panda somersaults along the bottom of Discord. Click it to catch it."
            },
            {
                Icon: SparkleIcon,
                title: "Plugins in Endcord's look",
                description: "About 75 plugin windows open in Endcord's colors, and switches and settings move like a hand moved them."
            },
            {
                Icon: SlidersIcon,
                title: "CustomProfile",
                description: "The whole shop is back, typing is quick again, and others see the creation date you pick."
            },
            {
                Icon: AppsIcon,
                title: "Downloads on GitHub",
                description: "Installers come from Endcord's GitHub releases now, with a checksum for every file."
            }
        ]
    }
];
