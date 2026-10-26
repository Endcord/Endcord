/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const SUGGESTED_HEADER_TEXT = "Suggested";

let observer: MutationObserver | null = null;
let scanQueued = false;
const dismissed = new WeakSet<Element>();

function dismissSuggested() {
    const scope = document.querySelector('ul[aria-label="Channels"]') ?? document.body;
    const headers = scope.querySelectorAll("h3");

    for (const h of headers) {
        if (h.textContent?.trim() !== SUGGESTED_HEADER_TEXT) continue;

        const item = h.closest("li");
        if (!item || dismissed.has(item)) continue;

        const dismissBtn = item.querySelector('[role="button"]') as HTMLElement | null;
        if (dismissBtn) {
            dismissed.add(item);
            dismissBtn.click();
        }
    }
}

function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
        scanQueued = false;
        dismissSuggested();
    });
}

export default definePlugin({
    name: "HideSuggestedChannels",
    description: "Automatically dismisses the \"Suggested\" channels section",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    start() {
        dismissSuggested();
        observer = new MutationObserver(queueScan);
        observer.observe(document.body, { childList: true, subtree: true });
    },

    stop() {
        observer?.disconnect();
        observer = null;
    },
});
