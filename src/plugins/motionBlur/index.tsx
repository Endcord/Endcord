/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { FluxDispatcher } from "@webpack/common";

import { settings } from "./settings";

let currentBlur = 0;
let targetBlur = 0;
let rafId: number | null = null;
let lastScrollTime = 0;
let lastPointerTime = 0;
let lastPointerX = 0;
let lastPointerY = 0;

function updateMotionBlur() {
    // Fast, buttery spring interpolation
    currentBlur += (targetBlur - currentBlur) * 0.38;
    targetBlur *= 0.75;

    const appMount = document.getElementById("app-mount");

    if (currentBlur > 0.08) {
        if (appMount) {
            appMount.style.setProperty("--ec-motion-blur", `${currentBlur.toFixed(2)}px`);
            if (!appMount.classList.contains("ec-motion-active")) {
                appMount.classList.add("ec-motion-active");
            }
        }
        rafId = requestAnimationFrame(updateMotionBlur);
    } else {
        currentBlur = 0;
        targetBlur = 0;
        if (appMount) {
            appMount.classList.remove("ec-motion-active");
            appMount.style.removeProperty("--ec-motion-blur");
        }
        rafId = null;
    }
}

function startLoop() {
    if (rafId === null) {
        rafId = requestAnimationFrame(updateMotionBlur);
    }
}

function triggerBlurPulse(amount: number) {
    const intensity = settings.store.intensity || 1.0;
    const maxBlur = Math.min(6, settings.store.maxBlur || 4);
    const added = Math.min(maxBlur, amount * intensity);
    targetBlur = Math.max(targetBlur, added);
    startLoop();
}

function onWheel(event: WheelEvent) {
    const now = performance.now();
    const dt = Math.max(1, now - lastScrollTime);
    lastScrollTime = now;

    const speed = Math.hypot(event.deltaX, event.deltaY) / dt;
    triggerBlurPulse(speed * 0.9);
}

function onScroll() {
    triggerBlurPulse(1.4);
}

function onPointerMove(event: PointerEvent) {
    const now = performance.now();
    const dt = now - lastPointerTime;
    if (dt > 16) {
        const dx = event.clientX - lastPointerX;
        const dy = event.clientY - lastPointerY;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        lastPointerTime = now;

        const speed = Math.hypot(dx, dy) / dt;
        if (speed > 2.2) {
            triggerBlurPulse(speed * 0.35);
        }
    }
}

function onTransition() {
    triggerBlurPulse(2.2);
}

const TRANSITION_EVENTS = [
    "CHANNEL_SELECT",
    "GUILD_SELECT",
    "MODAL_PUSH",
    "MODAL_POP",
    "LAYER_PUSH",
    "LAYER_POP"
];

export default definePlugin({
    name: "MotionBlur",
    description: "Adds lightweight, hardware-accelerated 60+ FPS motion blur across the entire Discord app during scrolling and navigation.",
    tags: ["Appearance", "Customisation", "Fun"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,

    start() {
        window.addEventListener("wheel", onWheel, { passive: true, capture: true });
        window.addEventListener("scroll", onScroll, { passive: true, capture: true });
        window.addEventListener("pointermove", onPointerMove, { passive: true, capture: true });
        window.addEventListener("resize", onTransition, { passive: true });

        for (const evt of TRANSITION_EVENTS) {
            try {
                FluxDispatcher.subscribe(evt, onTransition);
            } catch { }
        }
    },

    stop() {
        window.removeEventListener("wheel", onWheel, true);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("pointermove", onPointerMove, true);
        window.removeEventListener("resize", onTransition);

        for (const evt of TRANSITION_EVENTS) {
            try {
                FluxDispatcher.unsubscribe(evt, onTransition);
            } catch { }
        }

        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        const appMount = document.getElementById("app-mount");
        if (appMount) {
            appMount.classList.remove("ec-motion-active");
            appMount.style.removeProperty("--ec-motion-blur");
        }
        currentBlur = 0;
        targetBlur = 0;
    },
});
