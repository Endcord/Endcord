/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PlainSettings } from "@api/Settings";
import { BootState, NORMAL_BOOT } from "@shared/bootGuard";
import { Logger } from "@utils/Logger";
import { relaunch } from "@utils/native";
import { pluginsByModule } from "@webpack/patcher";

import Plugins, { getPluginFlag } from "~plugins";

const logger = new Logger("SafeMode", "#f0b232");

// How long Discord has to stay up, with no crash, before a start counts as a good one
const HEALTHY_AFTER = 15_000;

function begin(): BootState {
    if (IS_REPORTER) return NORMAL_BOOT;

    try {
        return EndcordNative.boot?.begin() ?? NORMAL_BOOT;
    } catch (err) {
        logger.error("Couldn't read the start record", err);
        return NORMAL_BOOT;
    }
}

export const bootState = begin();

/** Plugins, themes and Custom CSS are off for this session, see @shared/bootGuard */
export const IS_SAFE_MODE = bootState.safeMode;

/** Plugins a person turns on and off themselves: not the ones Endcord needs, nor the APIs that come with others */
export const isChoosablePlugin = (name: string) => name in Plugins && !getPluginFlag(name, "required") && !name.endsWith("API");

/** The plugins someone turned on. Read by name, so plugins that are off stay unloaded */
export function getChosenPlugins() {
    return Object.entries(PlainSettings.plugins)
        .filter(([name, plugin]) => plugin?.enabled && isChoosablePlugin(name))
        .map(([name]) => name);
}

/** Turned on since the last start that came up, the likeliest cause when the crash itself named nobody */
export function getPluginsChangedSinceGoodStart() {
    if (!bootState.lastGood.length) return [];

    const lastGood = new Set(bootState.lastGood);
    return getChosenPlugins().filter(name => !lastGood.has(name));
}

let healthyTimer: ReturnType<typeof setTimeout> | undefined;
let onGoodStart: (() => void) | undefined;

function scheduleConfirm() {
    clearTimeout(healthyTimer);
    healthyTimer = setTimeout(() => {
        EndcordNative.boot?.confirm(getChosenPlugins()).catch(() => { });
        onGoodStart?.();
        onGoodStart = undefined;
    }, HEALTHY_AFTER);
}

/** Called once Discord's code is ready. The start counts as good once it stays up, and then the callback runs */
export function watchStart(callback?: () => void) {
    if (IS_REPORTER) return;
    onGoodStart = callback;
    scheduleConfirm();
}

/** The plugins that changed the modules a crash went through */
export function findSuspects(error: unknown) {
    const stack = error instanceof Error ? error.stack ?? "" : String(error ?? "");
    const suspects = new Set<string>();

    for (const [, moduleId] of stack.matchAll(/WebpackModule(\d+)/g)) {
        for (const plugin of pluginsByModule.get(moduleId) ?? []) suspects.add(plugin);
    }

    return [...suspects];
}

/** Discord's crash screen came up. The start isn't a good one unless Discord gets back up and stays there */
export function noteCrash(error: unknown) {
    if (IS_REPORTER) return;

    clearTimeout(healthyTimer);

    const suspects = findSuspects(error);
    if (suspects.length) EndcordNative.boot?.reportCrash(suspects).catch(() => { });
}

/** The crash screen was closed and Discord works again */
export function noteRecovered() {
    if (IS_REPORTER) return;
    scheduleConfirm();
}

export async function restartInSafeMode() {
    await EndcordNative.boot?.requestSafeMode().catch(() => { });
    relaunch();
}
