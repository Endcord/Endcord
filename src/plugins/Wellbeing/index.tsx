/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { disableStyle, enableStyle } from "@api/Styles";
import { filled, pixelIcon, SOFT } from "@components/EndcordIcons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";
import { showToast, UserStore } from "@webpack/common";

import { cancelBreak, settings } from "./controls";
import { WellbeingTab } from "./Dashboard";
import { bump, loadWellbeing } from "./state";
import style from "./style.css?managed";

// Leaf icon
const LeafTabIcon = pixelIcon([
    ".......###",
    ".....++++#",
    "...+++++#.",
    "..+++++#+.",
    ".+++++#++.",
    ".++++#++..",
    "..+##+++..",
    "..##......",
    ".##.......",
    "##........"
], filled(() => (
    <>
        <path opacity={SOFT} d="M20 4c.5 6.2-1.4 11.6-6.5 13.6-3.7 1.4-7 .2-8.4-1.8C4 11.6 9 4.8 20 4Z" />
        <path d="M15.1 8.3a1 1 0 0 1-.1 1.4c-3.5 3-6.2 6.8-8 11.1a1 1 0 0 1-1.8-.8c1.9-4.6 4.8-8.6 8.5-11.8a1 1 0 0 1 1.4.1Z" />
    </>
)));

let heartbeat: ReturnType<typeof setInterval> | null = null;
let continuousActiveMin = 0;

function tick() {
    if (document.visibilityState !== "visible") {
        continuousActiveMin = 0;
        return;
    }
    void bump({ activeMin: 1 });
    continuousActiveMin++;

    if (settings.store.breakReminders && continuousActiveMin >= (Number(settings.store.breakInterval) || 90)) {
        continuousActiveMin = 0;
        showToast("You've been on Discord for a while. Time to stretch and drink some water.", "message");
    }
}

const logger = new Logger("Wellbeing");

export default definePlugin({
    name: "Wellbeing",
    description: "A gentle, private dashboard of how you use Discord — screen time, messages and calm controls. Everything stays on your computer.",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic: boolean; }) {
            if (optimistic || !message?.author) return;
            const me = UserStore.getCurrentUser();
            if (me && message.author.id === me.id) void bump({ messages: 1 });
        }
    },

    async start() {
        enableStyle(style);
        // The tab is there straight away; its numbers fill in once the saved ones have loaded
        SettingsPlugin.customEntries.push({
            key: "testcord_wellbeing",
            title: "Wellbeing",
            panelTitle: "Wellbeing",
            Component: WellbeingTab,
            Icon: LeafTabIcon
        });
        heartbeat = setInterval(tick, 60_000);
        try {
            await loadWellbeing();
            void bump({ sessions: 1 });
        } catch (e) {
            logger.error("Couldn't load the saved numbers", e);
        }
    },

    stop() {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        continuousActiveMin = 0;
        cancelBreak();
        removeFromArray(SettingsPlugin.customEntries, e => e.key === "testcord_wellbeing");
        disableStyle(style);
    }
});
