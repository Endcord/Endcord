/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const STYLE_ID = "equicord-smooth-ui";

const settings = definePluginSettings({
    transitionDuration: {
        type: OptionType.NUMBER,
        description: "Transition duration (ms)",
        default: 180,
        onChange: () => applyCSS(),
    },
    animationType: {
        type: OptionType.SELECT,
        description: "Animation easing",
        options: [
            { label: "Ease", value: "ease", default: true },
            { label: "Ease-in-out", value: "ease-in-out" },
            { label: "Ease-out", value: "ease-out" },
            { label: "Linear", value: "linear" },
        ],
        onChange: () => applyCSS(),
    },
    animatePopouts: {
        type: OptionType.BOOLEAN,
        description: "Animate menus, profiles, tooltips and popouts",
        default: true,
        onChange: () => applyCSS(),
    },
    animateHover: {
        type: OptionType.BOOLEAN,
        description: "Add smooth transitions to buttons and interactive elements",
        default: true,
        onChange: () => applyCSS(),
    },
    animateMessages: {
        type: OptionType.BOOLEAN,
        description: "Fade messages in when they appear (may use more resources)",
        default: false,
        onChange: () => applyCSS(),
    },
});

function buildCSS(): string {
    const duration = Math.max(0, Math.min(settings.store.transitionDuration ?? 180, 600));
    const easing = settings.store.animationType ?? "ease";

    return `
@keyframes equicord-smooth-ui-pop-in {
    from {
        opacity: 0;
        transform: translateY(4px) scale(0.985);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@keyframes equicord-smooth-ui-message-in {
    from {
        opacity: 0;
        transform: translateY(3px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

:root {
    --smooth-ui-duration: ${duration}ms;
    --smooth-ui-easing: ${easing};
}

${settings.store.animatePopouts !== false ? `
[role="dialog"],
[role="menu"],
[role="tooltip"] {
    animation: equicord-smooth-ui-pop-in var(--smooth-ui-duration) var(--smooth-ui-easing) both;
    transform-origin: top center;
}
` : ""}

${settings.store.animateHover !== false ? `
button,
[role="button"] {
    transition:
        background-color var(--smooth-ui-duration) var(--smooth-ui-easing),
        border-color var(--smooth-ui-duration) var(--smooth-ui-easing),
        color var(--smooth-ui-duration) var(--smooth-ui-easing),
        opacity var(--smooth-ui-duration) var(--smooth-ui-easing);
}
` : ""}

${settings.store.animateMessages === true ? `
[id^="chat-messages-"] {
    animation: equicord-smooth-ui-message-in var(--smooth-ui-duration) var(--smooth-ui-easing) both;
}
` : ""}

`;
}

function applyCSS() {
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = buildCSS();
    document.head.appendChild(style);
}

function removeCSS() {
    document.getElementById(STYLE_ID)?.remove();
}

export default definePlugin({
    name: "SmoothUI",
    description: "Adds soft, configurable animations and transitions to Discord's interface.",
    authors: [Devs.vpg],
    enabledByDefault: false,
    settings,

    start() {
        applyCSS();
    },

    stop() {
        removeCSS();
    },
});
