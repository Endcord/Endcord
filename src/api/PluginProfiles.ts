/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { pluginRequiresRestart, startDependenciesRecursive, startPlugin, stopPlugin } from "@api/PluginManager";
import { getChosenPlugins, IS_SAFE_MODE, isChoosablePlugin } from "@api/SafeMode";
import { PluginProfile, Settings } from "@api/Settings";
import { takeSnapshot } from "@api/SettingsSnapshots";
import { BroadcastIcon, GamepadIcon, HeartIcon, PawIcon, ShieldCheckIcon, SlidersIcon, SparkleIcon } from "@components/EndcordIcons";
import { BAN_RISK } from "@utils/banRisk";
import { Logger } from "@utils/Logger";
import type { IconProps } from "@utils/types";
import type { ComponentType } from "react";

import Plugins from "~plugins";

const logger = new Logger("PluginProfiles", "#9ccbff");

export interface StarterPack {
    id: string;
    name: string;
    description: string;
    Icon: ComponentType<IconProps>;
    plugins: string[];
    /** Shown first and picked to begin with */
    recommended?: boolean;
}

/** Most-enabled plugins, in order. Marked in the Plugins tab and used for the Popular pack, minus the ones below */
export const POPULAR_PLUGIN_ORDER: readonly string[] = [
    "CustomProfile",
    "MessageLogger",
    "HideEndcord",
    "FakeNitro",
    "SmoothType",
    "ViewIcons",
    "ThemeLibrary",
    "SpotifyLyricsStatus",
    "oneko",
    "PlatformIndicators",
    "RelationshipNotifier",
    "SilentTyping",
    "FakeMute",
];

/**
 * Popular, but left for each person to turn on: SpotifyLyricsStatus changes the custom status everyone sees, and needs
 * Spotify connected first
 */
const POPULAR_BY_CHOICE: readonly string[] = ["SpotifyLyricsStatus"];

/**
 * Fun plugins (pets, sparkles, effects). Never part of a preselected pack, so a fresh install stays clean; they
 * get a pack of their own instead
 */
export const FUN_PLUGINS: readonly string[] = ["oneko", "ClickSparkles", "NeonGlow", "WigglyText", "petpet"];

// Packs add to what's already enabled. Plugins missing from this build (desktop-only ones on web) are skipped
const PACKS: StarterPack[] = [
    {
        id: "popular",
        name: "Popular",
        description: "What Endcord users turn on most: your own profile look, deleted messages kept, Nitro emoji and silent typing.",
        Icon: HeartIcon,
        // Preselected packs never include plugins that break Discord's ToS or are just for fun
        plugins: POPULAR_PLUGIN_ORDER.filter(name => !BAN_RISK[name] && !FUN_PLUGINS.includes(name) && !POPULAR_BY_CHOICE.includes(name)),
        recommended: true
    },
    {
        id: "essentials",
        name: "Essentials",
        description: "The small fixes most people keep: bigger images, link previews, who reacted, cleaner links.",
        Icon: SparkleIcon,
        plugins: [
            "CommandPalette", "ViewIcons", "PlatformIndicators", "MessageLinkEmbeds", "ClearURLs", "FixImagesQuality", "ImageZoom",
            "ReverseImageSearch", "MemberCount", "TypingTweaks", "WhoReacted", "PermissionsViewer", "CallTimer", "ValidUser",
            "VolumeBooster", "FavoriteEmojiFirst", "ReadAllNotificationsButton"
        ]
    },
    {
        id: "privacy",
        name: "Privacy",
        description: "Typing without showing it, links without trackers, fake links pointed out, no password sent by mistake, a shield while you stream.",
        Icon: ShieldCheckIcon,
        plugins: ["SilentTyping", "ClearURLs", "AnonymiseFileNames", "ZeroWidthSanitizer", "SecretGuard", "SuspiciousLinks", "StreamerShield", "BlurNSFW"]
    },
    {
        id: "power",
        name: "Power user",
        description: "Tabs, a command palette, keyboard replies, deleted messages kept, and the raw data behind everything.",
        Icon: SlidersIcon,
        plugins: [
            "CommandPalette", "ChannelTabs", "MessageLogger", "ShowHiddenChannels", "PermissionsViewer", "ViewRaw", "QuickReply",
            "DraftList", "Bookmarks", "FullSearchContext", "BetterRoleContext", "ServerInfo", "PinDMs"
        ]
    },
    {
        id: "gaming",
        name: "Gaming",
        description: "Game Mode, Do Not Disturb while you play, louder friends and a call timer.",
        Icon: GamepadIcon,
        plugins: [
            "GameMode", "AutoDNDWhilePlaying", "GameActivityToggle", "CallTimer", "VoiceChatDoubleClick", "VolumeBooster",
            "BiggerStreamPreview", "WhosWatching", "NoTypingAnimation"
        ]
    },
    {
        id: "streaming",
        name: "Streaming",
        description: "Streamer Mode the moment you go live, no DM pop-ups on stream, and who's watching.",
        Icon: BroadcastIcon,
        plugins: ["StreamerShield", "NoDMWhileStreaming", "StreamProof", "WhosWatching", "BiggerStreamPreview", "CallTimer"]
    },
    {
        id: "fun",
        name: "Just for fun",
        description: "A pixel panda that follows your mouse, sparkles where you click, a soft neon glow and wiggly text.",
        Icon: PawIcon,
        plugins: [...FUN_PLUGINS]
    }
];

export const getStarterPacks = () => PACKS.map(pack => ({ ...pack, plugins: pack.plugins.filter(isChoosablePlugin) }));

export interface ApplyResult {
    restartNeeded: boolean;
    turnedOn: number;
    turnedOff: number;
}

function turnOn(name: string, result: ApplyResult) {
    const plugin = Plugins[name];
    const settings = Settings.plugins[name];
    settings.enabled = true;
    result.turnedOn++;

    if (IS_SAFE_MODE) return void (result.restartNeeded = true);

    const { restartNeeded, failures } = startDependenciesRecursive(plugin);
    if (failures.length) logger.warn(`${name} is on, but these helpers didn't start: ${failures.join(", ")}`);

    if (restartNeeded || pluginRequiresRestart(plugin)) {
        result.restartNeeded = true;
    } else if (!startPlugin(plugin)) {
        // Starts on the next launch
        result.restartNeeded = true;
    }
}

function turnOff(name: string, result: ApplyResult) {
    const plugin = Plugins[name];
    Settings.plugins[name].enabled = false;
    result.turnedOff++;

    if (IS_SAFE_MODE || pluginRequiresRestart(plugin)) {
        result.restartNeeded = true;
    } else if (plugin.started && !stopPlugin(plugin)) {
        result.restartNeeded = true;
    }
}

/**
 * Enables these plugins. With `exact`, every other plugin the user enabled gets disabled (switching profiles);
 * without it nothing is disabled (adding a starter pack)
 */
export function applyPluginSet(names: Iterable<string>, { exact }: { exact: boolean; }): ApplyResult {
    const wanted = new Set([...names].filter(isChoosablePlugin));
    const result: ApplyResult = { restartNeeded: false, turnedOn: 0, turnedOff: 0 };

    // Disable first, so dependencies of the wanted plugins get re-enabled by them
    if (exact) {
        for (const name of getChosenPlugins()) {
            if (!wanted.has(name)) turnOff(name, result);
        }
    }

    for (const name of wanted) {
        if (!Settings.plugins[name]?.enabled) turnOn(name, result);
    }

    return result;
}

/** What switching would do, for the confirmation */
export function previewPluginSet(names: Iterable<string>) {
    const wanted = new Set([...names].filter(isChoosablePlugin));
    const chosen = new Set(getChosenPlugins());

    return {
        on: [...wanted].filter(name => !chosen.has(name)),
        off: [...chosen].filter(name => !wanted.has(name))
    };
}

export function isProfileActive(profile: PluginProfile) {
    const { on, off } = previewPluginSet(profile.plugins);
    return !on.length && !off.length;
}

export function saveCurrentAsProfile(name: string) {
    const profile: PluginProfile = { id: crypto.randomUUID(), name: name.trim().slice(0, 40), plugins: getChosenPlugins().sort() };
    Settings.pluginProfiles = [...Settings.pluginProfiles, profile];
    return profile;
}

export function updateProfile(id: string, change: Partial<Omit<PluginProfile, "id">>) {
    Settings.pluginProfiles = Settings.pluginProfiles.map(profile => profile.id === id ? { ...profile, ...change } : profile);
}

export function deleteProfile(id: string) {
    Settings.pluginProfiles = Settings.pluginProfiles.filter(profile => profile.id !== id);
}

export async function switchToProfile(profile: PluginProfile) {
    await takeSnapshot("profile", profile.name);
    return applyPluginSet(profile.plugins, { exact: true });
}

export async function addStarterPacks(packs: StarterPack[], snapshotKind: "pack" | "welcome" = "pack") {
    await takeSnapshot(snapshotKind, packs.map(pack => pack.name).join(", "));
    return applyPluginSet(packs.flatMap(pack => pack.plugins), { exact: false });
}

/** The plugins in these packs that adding them would turn on */
export const getPackAdditions = (packs: readonly StarterPack[]) =>
    [...new Set(packs.flatMap(pack => pack.plugins))].filter(name => isChoosablePlugin(name) && !Settings.plugins[name]?.enabled);

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve)));

/**
 * Adds packs one plugin at a time and yields in between, so the progress UI keeps animating instead of freezing
 * while a couple dozen plugins start
 */
export async function addStarterPacksGradually(packs: StarterPack[], onProgress: (done: number, total: number) => void) {
    await takeSnapshot("welcome", packs.map(pack => pack.name).join(", "));
    const names = getPackAdditions(packs);
    const result: ApplyResult = { restartNeeded: false, turnedOn: 0, turnedOff: 0 };

    onProgress(0, names.length);
    for (const [index, name] of names.entries()) {
        await nextFrame();
        // May already be on as a dependency of an earlier plugin
        if (!Settings.plugins[name]?.enabled) {
            try {
                turnOn(name, result);
            } catch (err) {
                logger.error(`Couldn't turn ${name} on`, err);
                // Enabled in settings, starts on the next launch
                result.restartNeeded = true;
            }
        }
        onProgress(index + 1, names.length);
    }

    return result;
}
