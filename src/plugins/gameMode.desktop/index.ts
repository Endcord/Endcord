/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { setFrameRate } from "@utils/frameLimiter";
import definePlugin, { OptionType } from "@utils/types";
import { RunningGameStore } from "@webpack/common";

const ACTIVE_ATTRIBUTE = "data-ec-game-mode";
// A game that was only tabbed out of for a moment shouldn't cost a cleanup
const TRIM_DELAY = 60_000;

export const settings = definePluginSettings({
    frameRate: {
        type: OptionType.SELECT,
        description: "How often Discord redraws its interface while Game Mode is active. Video and streams keep their own speed",
        options: [
            { label: "15 FPS", value: 15, default: true },
            { label: "30 FPS", value: 30 },
            { label: "No limit", value: 0 }
        ],
        onChange: update
    },
    activeWhen: {
        type: OptionType.SELECT,
        description: "When Game Mode takes effect",
        options: [
            { label: "While a game is running and Discord is in the background", value: "game", default: true },
            { label: "Whenever Discord is in the background", value: "background" }
        ],
        onChange: update
    }
});

let pausedAnimations: Animation[] = [];
let trimTimer: ReturnType<typeof setTimeout> | undefined;
let trimmedThisGame = false;

// The stylesheet pauses CSS animations, but those started from scripts ignore it
function pauseScriptAnimations(pause: boolean) {
    if (!pause) {
        pausedAnimations.forEach(animation => animation.play());
        pausedAnimations = [];
        return;
    }

    if (pausedAnimations.length) return;

    pausedAnimations = document.getAnimations().filter(animation => animation.playState === "running" && !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition));
    pausedAnimations.forEach(animation => animation.pause());
}

function update() {
    const isGameRunning = RunningGameStore.getVisibleRunningGames().length > 0;
    const isActive = !document.hasFocus() && (isGameRunning || settings.store.activeWhen === "background");

    document.documentElement.toggleAttribute(ACTIVE_ATTRIBUTE, isActive);
    setFrameRate(isActive ? settings.store.frameRate : 0);
    pauseScriptAnimations(isActive);

    if (!isGameRunning) trimmedThisGame = false;

    clearTimeout(trimTimer);
    if (isActive && !trimmedThisGame) {
        trimTimer = setTimeout(() => {
            trimmedThisGame = true;
            EndcordNative.native.trimMemory();
        }, TRIM_DELAY);
    }
}

export default definePlugin({
    name: "GameMode",
    description: "While you play, caps how often Discord redraws, pauses its animations and gives cached memory back",
    tags: ["Utility"],
    authors: [Devs.rootpoi],
    settings,

    flux: {
        RUNNING_GAMES_CHANGE: update
    },

    start() {
        window.addEventListener("focus", update);
        window.addEventListener("blur", update);
        update();
    },

    stop() {
        window.removeEventListener("focus", update);
        window.removeEventListener("blur", update);
        clearTimeout(trimTimer);

        document.documentElement.removeAttribute(ACTIVE_ATTRIBUTE);
        setFrameRate(0);
        pauseScriptAnimations(false);
    }
});
