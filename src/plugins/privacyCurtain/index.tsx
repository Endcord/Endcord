/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { EndcordMark } from "@components/EndcordIcons";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import { createRoot } from "@webpack/common";
import type { Root } from "react-dom/client";

const settings = definePluginSettings({
    minutes: {
        type: OptionType.SLIDER,
        description: "Minutes without moving the mouse or typing in Discord before it hides",
        markers: makeRange(1, 15, 1),
        default: 5,
        stickToMarkers: true
    },
    whenSwitchingAway: {
        type: OptionType.BOOLEAN,
        description: "Also hide it as soon as you switch to another window",
        default: false
    }
});

const ON = "ec-curtain-on";
const ACTIVITY = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;

let lastActive = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
let host: HTMLDivElement | null = null;
let root: Root | null = null;

function Curtain() {
    return (
        <div className="ec-curtain-card">
            <EndcordMark width={68} asleep />
            <p className="ec-curtain-title">{t("Discord is hidden while you're away")}</p>
            <p className="ec-curtain-hint">{t("Move the mouse or press a key to show it again.")}</p>
        </div>
    );
}

function show() {
    if (document.documentElement.classList.contains(ON)) return;
    if (!host) {
        host = document.createElement("div");
        host.className = "ec-curtain";
        host.setAttribute("aria-live", "polite");
        document.body.appendChild(host);
        root = createRoot(host);
        root.render(<Curtain />);
    }
    document.documentElement.classList.add(ON);
}

function hide() {
    lastActive = Date.now();
    document.documentElement.classList.remove(ON);
}

const onActivity = () => {
    lastActive = Date.now();
    if (document.documentElement.classList.contains(ON)) hide();
};
const onBlur = () => {
    if (!settings.store.whenSwitchingAway) return;
    // Clicking into a video embed moves focus to its frame, which isn't leaving Discord
    setTimeout(() => {
        if (!document.hasFocus() && document.activeElement?.tagName !== "IFRAME") show();
    });
};

// Someone watching a stream or a video isn't away, even without touching anything
const isWatching = () => [...document.querySelectorAll("video")].some(video => !video.paused && !video.ended);

export default definePlugin({
    name: "PrivacyCurtain",
    description: "When you've been away from Discord for a few minutes, it blurs itself so nobody walking by can read your chats. It comes back the moment you move the mouse.",
    tags: ["Privacy"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,

    start() {
        lastActive = Date.now();
        for (const event of ACTIVITY) window.addEventListener(event, onActivity, { capture: true, passive: true });
        window.addEventListener("blur", onBlur);
        window.addEventListener("focus", onActivity);
        timer = setInterval(() => {
            if (Date.now() - lastActive < settings.store.minutes * 60_000) return;
            if (isWatching()) lastActive = Date.now();
            else show();
        }, 10_000);
    },

    stop() {
        for (const event of ACTIVITY) window.removeEventListener(event, onActivity, { capture: true });
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("focus", onActivity);
        clearInterval(timer);
        document.documentElement.classList.remove(ON);
        root?.unmount();
        host?.remove();
        root = host = null;
    }
});
