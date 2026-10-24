/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const STYLE_ID = "equicord-cleaner-discord";

const settings = definePluginSettings({
    hideNitroShop: {
        type: OptionType.BOOLEAN,
        description: "Hide Nitro and Shop navigation items",
        default: true,
        onChange: () => applyCSS(),
    },
    hideQuests: {
        type: OptionType.BOOLEAN,
        description: "Hide the Quests navigation item",
        default: true,
        onChange: () => applyCSS(),
    },
    hideComposerButtons: {
        type: OptionType.BOOLEAN,
        description: "Hide GIF, sticker and gift buttons near the message box",
        default: false,
        onChange: () => applyCSS(),
    },
    hideGifButton: {
        type: OptionType.BOOLEAN,
        description: "Hide the GIF button",
        default: false,
        onChange: () => applyCSS(),
    },
    hideStickerButton: {
        type: OptionType.BOOLEAN,
        description: "Hide the sticker button",
        default: false,
        onChange: () => applyCSS(),
    },
    hideGiftButton: {
        type: OptionType.BOOLEAN,
        description: "Hide the gift button",
        default: false,
        onChange: () => applyCSS(),
    },
    hideActivityPanels: {
        type: OptionType.BOOLEAN,
        description: "Hide Active Now and activity panels",
        default: true,
        onChange: () => applyCSS(),
    },
    hideBoostPrompts: {
        type: OptionType.BOOLEAN,
        description: "Hide server boost prompts and promotional cards",
        default: false,
        onChange: () => applyCSS(),
    },
});

function buildCSS(): string {
    const hideNitroShop = settings.store.hideNitroShop !== false;
    const hideQuests = settings.store.hideQuests !== false;
    const hideComposerButtons = settings.store.hideComposerButtons === true;
    const hideGifButton = hideComposerButtons || settings.store.hideGifButton === true;
    const hideStickerButton = hideComposerButtons || settings.store.hideStickerButton === true;
    const hideGiftButton = hideComposerButtons || settings.store.hideGiftButton === true;
    const hideActivityPanels = settings.store.hideActivityPanels !== false;
    const hideBoostPrompts = settings.store.hideBoostPrompts === true;

    return `
${hideNitroShop ? `
body [href="/store"],
body [href="/shop"],
body [aria-label*="Nitro" i],
body [aria-label*="Shop" i],
body [aria-label*="Boutique" i] {
    display: none !important;
}
` : ""}

${hideQuests ? `
body [href="/quest-home"],
body [data-list-item-id*="quest" i],
body [aria-label*="Quests" i],
body [aria-label*="Quêtes" i] {
    display: none !important;
}
` : ""}

${hideGifButton ? `
body button[aria-label*="GIF" i],
body [aria-label*="Send a GIF" i],
body [aria-label*="Envoyer un GIF" i],
body [class*="gifButton_"] {
    display: none !important;
}
` : ""}

${hideStickerButton ? `
body button[aria-label*="sticker" i],
body [aria-label*="Send a sticker" i],
body [aria-label*="Envoyer un sticker" i],
body [class*="stickerButton_"] {
    display: none !important;
}
` : ""}

${hideGiftButton ? `
body button[aria-label*="gift" i],
body button[aria-label*="cadeau" i],
body [aria-label*="Send a gift" i],
body [aria-label*="Envoyer un cadeau" i] {
    display: none !important;
}
` : ""}

${hideActivityPanels ? `
body [class*="nowPlayingColumn_"],
body [class*="activityPanel_"],
body [aria-label*="Active Now" i],
body [aria-label*="Activité en cours" i] {
    display: none !important;
}
` : ""}

${hideBoostPrompts ? `
body [class*="boostPrompt_"],
body [class*="nitroUpsell_"],
body [class*="premiumSubscribe_"],
body [class*="upsell_"] {
    display: none !important;
}
` : ""}
`;
}

function applyCSS() {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
    }
    style.textContent = buildCSS();
}

export default definePlugin({
    name: "CleanerDiscord",
    description: "Hide optional Discord clutter while keeping core navigation and messages visible.",
    authors: [Devs.vpg],
    enabledByDefault: false,
    settings,

    start() {
        applyCSS();
    },

    stop() {
        document.getElementById(STYLE_ID)?.remove();
    },
});
