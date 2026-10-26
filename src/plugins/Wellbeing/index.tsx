/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { disableStyle, enableStyle } from "@api/Styles";
import { ClockIcon } from "@components/Icons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";
import { showToast, UserStore } from "@webpack/common";

import { cancelBreak, settings } from "./controls";
import { WellbeingTab } from "./Dashboard";
import { bump, loadWellbeing } from "./state";
import style from "./style.css?managed";

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
        await loadWellbeing();
        void bump({ sessions: 1 });
        heartbeat = setInterval(tick, 60_000);
        SettingsPlugin.customEntries.push({
            key: "testcord_wellbeing",
            title: "Wellbeing",
            panelTitle: "Wellbeing",
            Component: WellbeingTab,
            Icon: ClockIcon
        });
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
