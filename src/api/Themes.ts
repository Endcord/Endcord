/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IS_SAFE_MODE } from "@api/SafeMode";
import { Settings, SettingsStore } from "@api/Settings";
import { ThemeStore } from "@endcord/discord-types";
import { createAndAppendStyle } from "@utils/css";
import { PopoutWindowStore } from "@webpack/common";

import { endcordRootNode,userStyleRootNode } from "./Styles";

let style: HTMLStyleElement | undefined;
let themesStyle: HTMLStyleElement | undefined;
let watchingQuickCss = false;

// Empty Custom CSS and no themes, as on most installs, need no stylesheet on the page at all
function applyQuickCss(css: string) {
    if (!style && !css) return;

    style ??= createAndAppendStyle("endcord-custom-css", userStyleRootNode);
    style.textContent = css;
    // At the time of writing this, changing textContent resets the disabled state
    style.disabled = !Settings.useQuickCss;
    updatePopoutWindows();
}

async function toggle(isEnabled: boolean) {
    if (!watchingQuickCss) {
        if (isEnabled) {
            watchingQuickCss = true;
            EndcordNative.quickCss.addChangeListener(applyQuickCss);
            applyQuickCss(await EndcordNative.quickCss.get());
        }
    } else if (style)
        style.disabled = !isEnabled;
}

async function initThemes() {
    const { themeLinks, enabledThemes } = Settings;

    const { ThemeStore } = require("@webpack/common/stores") as typeof import("@webpack/common/stores");

    // "darker" and "midnight" both count as dark
    // This function is first called on DOMContentLoaded, so ThemeStore may not have been loaded yet
    const activeTheme = ThemeStore == null
        ? undefined
        : ThemeStore.theme === "light" ? "light" : "dark";

    const links = themeLinks
        .map(rawLink => {
            const match = /^@(light|dark) (.*)/.exec(rawLink);
            if (!match) return rawLink;

            const [, mode, link] = match;
            return mode === activeTheme ? link : null;
        })
        .filter(link => link !== null);

    if (IS_WEB) {
        for (const theme of enabledThemes) {
            const themeData = await EndcordNative.themes.getThemeData(theme);
            if (!themeData) continue;
            const blob = new Blob([themeData], { type: "text/css" });
            links.push(URL.createObjectURL(blob));
        }
    } else {
        const localThemes = enabledThemes.map(theme => `endcord:///themes/${theme}?v=${Date.now()}`);
        links.push(...localThemes);
    }

    if (!themesStyle && !links.length) return;

    if (!themesStyle) {
        themesStyle = createAndAppendStyle("endcord-themes", userStyleRootNode);
        // Custom CSS stays last, so it can still override a theme
        if (style) userStyleRootNode.insertBefore(themesStyle, style);
    }
    themesStyle.textContent = links.map(link => `@import url("${link.trim()}");`).join("\n");
    updatePopoutWindows();
}

function applyToPopout(popoutWindow: Window | undefined, key: string) {
    if (!popoutWindow?.document) return;
    // skip game overlay cuz it needs to stay transparent, themes broke it
    if (key === "DISCORD_OutOfProcessOverlay") return;

    const doc = popoutWindow.document;

    doc.querySelector("endcord-root")?.remove();

    doc.documentElement.appendChild(endcordRootNode.cloneNode(true));
}

function updatePopoutWindows() {
    if (!PopoutWindowStore) return;

    for (const key of PopoutWindowStore.getWindowKeys()) {
        applyToPopout(PopoutWindowStore.getWindow(key), key);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // A theme can hide the very button that would turn it off, so safe mode leaves them all out
    if (IS_USERSCRIPT || IS_SAFE_MODE) return;

    initThemes();

    toggle(Settings.useQuickCss);
    SettingsStore.addChangeListener("useQuickCss", toggle);

    SettingsStore.addChangeListener("themeLinks", initThemes);
    SettingsStore.addChangeListener("enabledThemes", initThemes);

    window.addEventListener("message", event => {
        if (event.origin !== window.location.origin) return;
        const { discordPopoutEvent } = event.data || {};
        if (discordPopoutEvent?.type !== "loaded") return;

        applyToPopout(PopoutWindowStore.getWindow(discordPopoutEvent.key), discordPopoutEvent.key);
    });

    if (!IS_WEB) {
        EndcordNative.quickCss.addThemeChangeListener(initThemes);
    }
}, { once: true });

export function initQuickCssThemeStore(themeStore: ThemeStore) {
    if (IS_USERSCRIPT || IS_SAFE_MODE) return;

    initThemes();

    let currentTheme = themeStore.theme;
    themeStore.addChangeListener(() => {
        if (currentTheme === themeStore.theme) return;

        currentTheme = themeStore.theme;
        initThemes();
    });
}
