/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { filled, pixelIcon, SOFT } from "@components/EndcordIcons";
import { openSettingsTabModal } from "@components/settings/tabs/BaseTab";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import { removeFromArray } from "@utils/misc";
import definePlugin, { OptionType, StartAt } from "@utils/types";

import { ColorScale, DISCORD_DESIGN, DiscordScales, generateThemeCss, isSameDesign, PRESETS, ThemeDesign } from "./design";
import { LookPreview } from "./LookPreview";

// Brush icon: the handle at low opacity, the bristles solid
const ThemeStudioTabIcon = pixelIcon([
    ".......+++",
    "......++++",
    ".....++++.",
    "....++++..",
    "...##++...",
    "..####....",
    ".#####....",
    ".####.....",
    "####......",
    "##........"
], filled(() => (
    <>
        <path opacity={SOFT} d="M20.3 3.7a1.6 1.6 0 0 1 0 2.3l-7.2 7.2-2.3-2.3 7.2-7.2a1.6 1.6 0 0 1 2.3 0Z" />
        <path d="M9.6 12.1 11.9 14.4c.6.6.6 1.6 0 2.2-1.6 1.6-3 3.9-6.7 3.9-1 0-1.7-.3-2.2-.6 1-.6 1.6-1.6 1.6-3 0-1.3.6-2.7 2.1-3.7 1.2-.8 2.3-1.3 2.9-1.1Z" />
    </>
)));

const STYLE_ID = "ec-theme-studio";

export const settings = definePluginSettings({
    design: {
        type: OptionType.CUSTOM,
        default: DISCORD_DESIGN as ThemeDesign
    }
});

let style: HTMLStyleElement | undefined;
let scales: DiscordScales | undefined;

function readScale(prefix: string) {
    const computed = getComputedStyle(document.documentElement);
    const scale: ColorScale = {};

    for (let step = 1; step <= 100; step++) {
        const name = `--${prefix}-${step}-hsl`;
        const lightness = computed.getPropertyValue(name).match(/([\d.]+)%\s*$/)?.[1];
        if (lightness) scale[name] = Number(lightness);
    }

    return scale;
}

// Read once and kept, because afterwards the page reports this plugin's own values back
function readScales() {
    if (scales) return scales;

    const read = { neutrals: readScale("neutral"), blurples: readScale("blurple") };
    if (Object.keys(read.neutrals).length) scales = read;

    return read;
}

export const getThemeCss = (design: ThemeDesign) => generateThemeCss(design, readScales());

export function applyDesign(design: ThemeDesign) {
    // The default look needs no stylesheet, and no reading of Discord's colors at startup
    if (!style && isSameDesign(design, DISCORD_DESIGN)) return;

    style ??= createAndAppendStyle(STYLE_ID, managedStyleRootNode);
    style.textContent = getThemeCss(design);
}

export function saveDesign(design: ThemeDesign) {
    settings.store.design = design;
    applyDesign(design);
}

export default definePlugin({
    name: "ThemeStudio",
    description: "Design your own Discord colors, corners and glass menus without writing any code",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.rootpoi],
    enabledByDefault: true,
    settings,

    // For Endcord's welcome screen, which can't import a plugin and does without the looks when this one is off
    presets: PRESETS,
    LookPreview,
    saveDesign,
    isSameDesign,
    useDesign: () => settings.use(["design"]).design,
    openStudio: (onClosed?: () => void) => openSettingsTabModal(require("./StudioTab").default, onClosed),

    startAt: StartAt.DOMContentLoaded,

    start() {
        SettingsPlugin.customEntries.push({
            key: "endcord_theme_studio",
            title: "Theme Studio",
            Component: require("./StudioTab").default,
            Icon: ThemeStudioTabIcon
        });

        applyDesign(settings.store.design);
        // Discord's styles can still be loading this early, and the background is worked out from them
        if (!scales) window.addEventListener("load", () => applyDesign(settings.store.design), { once: true });
    },

    stop() {
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === "endcord_theme_studio");
        style?.remove();
        style = undefined;
    }
});
