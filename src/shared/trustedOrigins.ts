/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// discordapp.com is what Discord itself still loads for a Stable profile that never moved to discord.com
const DISCORD_ORIGIN = /^https:\/\/(?:discordapp\.com|(?:(?:ptb|canary)\.)?discord\.com)$/;

/** The only pages that get Endcord's native API. Discord's windows can show other pages too, such as its splash screen */
export const isDiscordOrigin = (origin: string) => DISCORD_ORIGIN.test(origin);
