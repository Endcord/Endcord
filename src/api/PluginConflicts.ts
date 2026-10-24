/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "./PluginManager";

/**
 * Plugins that change the same part of Discord in ways that don't combine: with both on, one of them silently
 * stops working. Found by applying each plugin's patches to Discord's code and checking whether the other
 * plugin's patches still match, plus pairs that do the same job. Turning one on offers to turn the other off.
 */
const ConflictPairs: ReadonlyArray<readonly [string, string]> = [
    ["MusicControls", "SpotifyControls"],
    ["CustomTimestamps", "RealtimeTimestamps"],
    ["MessageLogger", "MessageLoggerEnhanced"],
    ["AnonymiseFileNames", "ClipUpload"],
    ["BetterActivities", "ReviewDB"],
    ["BetterRoleContext", "RoleColorEverywhere"],
    ["BetterScreenShare", "FakeNitro"],
    ["CleanerChannelGroups", "ShowHiddenChannels"],
    ["ContentWarning", "PinIcon"],
    ["CustomUserColors", "IrcColors"],
    ["RoleColorEverywhere", "VoiceFakeDetector"],
];

/** Every plugin that conflicts with `pluginName`. */
export function getConflictingPlugins(pluginName: string): string[] {
    return ConflictPairs.flatMap(([a, b]) => a === pluginName ? [b] : b === pluginName ? [a] : []);
}

/** The plugins conflicting with `pluginName` that are turned on right now. */
export function getEnabledConflicts(pluginName: string): string[] {
    return getConflictingPlugins(pluginName).filter(name => isPluginEnabled(name));
}
