/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const STYLE_ID = "ec-custom-cursor-style";

// Every cursor is drawn on a 32x32 grid and scaled to the chosen size.
interface CursorImage {
    body: string;
    hotspot: [number, number];
}

interface CursorPreset {
    label: string;
    value: string;
    arrow: CursorImage;
    /** Shown over links and buttons, where Discord normally shows a hand */
    pointer: CursorImage;
}

const ARROW = "M4 2.5v21.6l5.4-5 3.6 8.2 3.9-1.7-3.6-8h7.6z";
const HAND = "M11.5 4.2a2 2 0 0 1 4 0V12.6a1.9 1.9 0 0 1 3.7.4v.6a1.9 1.9 0 0 1 3.6.6v.7a1.9 1.9 0 0 1 3.6.7V21c0 4.6-3.3 8-7.8 8h-1.8c-2.7 0-4.6-1.1-6.1-3.2l-4.4-6.1a2 2 0 0 1 3-2.6l2.2 2.2z";
const SHADOW = '<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-color="#000" flood-opacity=".38"/></filter>';

const svg = (inner: string, defs = "") =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs>${SHADOW}${defs}</defs><g filter="url(#s)">${inner}</g></svg>`;

const outlined = (d: string, fill: string, stroke: string) =>
    `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>`;

const arrowAndHand = (fill: string, stroke: string, defs = ""): Pick<CursorPreset, "arrow" | "pointer"> => ({
    arrow: { body: svg(outlined(ARROW, fill, stroke), defs), hotspot: [4, 3] },
    pointer: { body: svg(outlined(HAND, fill, stroke), defs), hotspot: [13, 3] }
});

const PIXEL_PALETTE: Record<string, string> = { K: "#10182a", W: "#f3f6fb", I: "#9ccbff" };

// 16x16 pixel grid drawn from rows of characters ("." is transparent), shown at 2px per pixel
function pixelSvg(rows: string[]) {
    let rects = "";
    rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            const fill = PIXEL_PALETTE[row[x]];
            if (fill) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
        }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>`;
}

const PRESETS: CursorPreset[] = [
    {
        label: "Endcord",
        value: "endcord",
        ...arrowAndHand("url(#g)", "#f3f6fb", '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ccbff"/><stop offset="1" stop-color="#3d74e0"/></linearGradient>')
    },
    {
        label: "Classic Light",
        value: "light",
        ...arrowAndHand("#ffffff", "#111318")
    },
    {
        label: "Classic Dark",
        value: "dark",
        ...arrowAndHand("#16181d", "#ffffff")
    },
    {
        label: "Blurple",
        value: "blurple",
        ...arrowAndHand("#5865f2", "#ffffff")
    },
    {
        label: "Sakura",
        value: "sakura",
        ...arrowAndHand("url(#g)", "#ffffff", '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd1dc"/><stop offset="1" stop-color="#f27ea0"/></linearGradient>')
    },
    {
        // Hard-edged cursors in the pixel style of the Endcord logo
        label: "Pixel",
        value: "pixel",
        arrow: {
            body: pixelSvg([
                "K...........",
                "KK..........",
                "KIK.........",
                "KIWK........",
                "KIWWK.......",
                "KIWWWK......",
                "KIWWWWK.....",
                "KIWWWWWK....",
                "KIWWWWWWK...",
                "KIWWWWKKKK..",
                "KIWKWWK.....",
                "KIK.KWWK....",
                "KK..KWWK....",
                "K....KWWK...",
                ".....KWWK...",
                "......KK....",
            ]),
            hotspot: [1, 1]
        },
        pointer: {
            body: pixelSvg([
                "....KK........",
                "...KWWK.......",
                "...KWWK.......",
                "...KWWK.......",
                "...KWWKKK.....",
                "...KWWKWWKKK..",
                ".KKKWWKWWKWWK.",
                "KWWKWWWWWKWWKK",
                "KWWKWWWWWWWWWK",
                "KWWWWWWWWWWWWK",
                ".KWWWWWWWWWWWK",
                ".KWWWWWWWWWWWK",
                "..KWWWWWWWWWK.",
                "..KWWWWWWWWWK.",
                "...KIIIIIIIK..",
                "...KKKKKKKKK..",
            ]),
            hotspot: [9, 1]
        }
    },
    {
        label: "Dot",
        value: "dot",
        arrow: {
            body: svg('<circle cx="16" cy="16" r="5" fill="#fff" stroke="#111318" stroke-width="2"/>'),
            hotspot: [16, 16]
        },
        pointer: {
            body: svg('<circle cx="16" cy="16" r="9" fill="rgba(255,255,255,.18)" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="3" fill="#fff" stroke="#111318" stroke-width="1.5"/>'),
            hotspot: [16, 16]
        }
    },
    {
        label: "Ring",
        value: "ring",
        arrow: {
            body: svg('<circle cx="16" cy="16" r="9" fill="none" stroke="#111318" stroke-width="4"/><circle cx="16" cy="16" r="9" fill="none" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="#fff" stroke="#111318" stroke-width="1"/>'),
            hotspot: [16, 16]
        },
        pointer: {
            body: svg('<circle cx="16" cy="16" r="11" fill="none" stroke="#111318" stroke-width="4"/><circle cx="16" cy="16" r="11" fill="none" stroke="#9ccbff" stroke-width="2"/><circle cx="16" cy="16" r="2.5" fill="#9ccbff" stroke="#111318" stroke-width="1"/>'),
            hotspot: [16, 16]
        }
    },
    {
        label: "Crosshair",
        value: "crosshair",
        arrow: {
            body: svg('<path d="M16 3v9M16 20v9M3 16h9M20 16h9" stroke="#111318" stroke-width="4" stroke-linecap="round"/><path d="M16 3v9M16 20v9M3 16h9M20 16h9" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="1.6" fill="#fff" stroke="#111318" stroke-width="1"/>'),
            hotspot: [16, 16]
        },
        pointer: {
            body: svg('<path d="M16 3v9M16 20v9M3 16h9M20 16h9" stroke="#111318" stroke-width="4" stroke-linecap="round"/><path d="M16 3v9M16 20v9M3 16h9M20 16h9" stroke="#f0776b" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="2" fill="#f0776b" stroke="#111318" stroke-width="1"/>'),
            hotspot: [16, 16]
        }
    },
];

const settings = definePluginSettings({
    preset: {
        type: OptionType.SELECT,
        description: "Built-in cursor style",
        options: PRESETS.map((preset, index) => ({
            label: preset.label,
            value: preset.value,
            default: index === 0
        })),
        onChange: applyCursor,
    },
    customUrl: {
        type: OptionType.STRING,
        description: "Custom cursor image URL. Overrides the preset when set. Use a PNG/GIF/CUR (GitHub or Discord CDN works best).",
        default: "",
        placeholder: "https://...",
        onChange: applyCursor,
    },
    size: {
        type: OptionType.SLIDER,
        description: "Cursor size",
        markers: [16, 24, 32, 48, 64],
        default: 32,
        stickToMarkers: false,
        onChange: applyCursor,
    },
    applyToTextFields: {
        type: OptionType.BOOLEAN,
        description: "Also replace the I-beam cursor in text boxes",
        default: false,
        onChange: applyCursor,
    },
});

function cursorValue(image: CursorImage, size: number, fallback: string) {
    const scale = size / 32;
    const sized = image.body.replace('width="32" height="32"', `width="${size}" height="${size}"`);
    return `url("data:image/svg+xml,${encodeURIComponent(sized)}") ${Math.round(image.hotspot[0] * scale)} ${Math.round(image.hotspot[1] * scale)}, ${fallback}`;
}

// Everything Discord renders as clickable; these get the pointer variant
const CLICKABLE = [
    "a", "button", "select", "summary", "label[for]",
    '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
    '[role="option"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]', '[role="treeitem"]',
    '[class*="clickable"]', '[class*="Clickable"]'
].map(s => `#app-mount ${s}, #app-mount ${s} *`).join(", ");

function applyCursor() {
    document.getElementById(STYLE_ID)?.remove();

    const size = Math.max(16, Math.min(64, Number(settings.store.size) || 32));
    const customUrl = String(settings.store.customUrl ?? "").trim();
    const preset = PRESETS.find(item => item.value === settings.store.preset) ?? PRESETS[0];

    let arrow: string, pointer: string;
    if (customUrl) {
        arrow = pointer = `url("${customUrl.replace(/["\\]/g, "")}") 0 0, auto`;
    } else {
        arrow = cursorValue(preset.arrow, size, "auto");
        pointer = cursorValue(preset.pointer, size, "pointer");
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        html, body, #app-mount, #app-mount * { cursor: ${arrow} !important; }
        ${CLICKABLE} { cursor: ${pointer} !important; }
        ${settings.store.applyToTextFields ? "" : '#app-mount input, #app-mount textarea, #app-mount [contenteditable="true"], #app-mount [contenteditable="true"] *, #app-mount [role="textbox"], #app-mount [role="textbox"] * { cursor: text !important; }'}
    `;
    document.documentElement.appendChild(style);
}

function removeCursor() {
    document.getElementById(STYLE_ID)?.remove();
}

export default definePlugin({
    name: "CustomCursor",
    description: "Replace Discord's cursor with a custom image or a built-in style.",
    tags: ["Appearance", "Customisation", "Fun"],
    authors: [Devs.ewlle],
    settings,
    searchTerms: ["cursor", "imlec", "mouse", "pointer"],

    start() {
        applyCursor();
    },

    stop() {
        removeCursor();
    },
});
