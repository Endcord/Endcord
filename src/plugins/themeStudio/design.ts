/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { hexToHSL } from "@plugins/clientTheme/utils/colorUtils";

export interface ThemeDesign {
    /** "#rrggbb", or empty to keep Discord's */
    accent: string;
    background: string;
    /** Multiplies Discord's corner sizes */
    radius: number;
    /** Blur behind menus in pixels */
    glass: number;
    /** A typeface from FONTS, or empty for Discord's */
    font?: FontName | "";
    /** Takes the shadows off, for a flat look */
    flat?: boolean;
    /** Scrollbars in the accent color, or hidden */
    scrollbars?: "" | "accent" | "hidden";
}

/** Typefaces every Windows PC has, so a theme never waits on a download */
export const FONTS = {
    system: 'system-ui, "Segoe UI", sans-serif',
    geometric: '"Bahnschrift", "Segoe UI", sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: '"Cascadia Code", Consolas, ui-monospace, monospace'
} as const;
export type FontName = keyof typeof FONTS;

/** Lightness of each step of a Discord color scale, by variable name */
export type ColorScale = Record<string, number>;

export interface DiscordScales {
    neutrals: ColorScale;
    blurples: ColorScale;
}

export const DISCORD_ACCENT = "#5865f2";
export const DISCORD_BACKGROUND = "#2b2d31";

export const DISCORD_DESIGN: ThemeDesign = { accent: "", background: "", radius: 1, glass: 0, font: "", flat: false, scrollbars: "" };

export const PRESETS: { name: string; design: ThemeDesign; }[] = ([
    { name: "Discord", design: DISCORD_DESIGN },
    { name: "Midnight", design: { accent: "#7aa2ff", background: "#0d1424", radius: 1, glass: 10 } },
    { name: "Neon", design: { accent: "#ff3d9a", background: "#140b1f", radius: 0.75, glass: 14 } },
    { name: "Forest", design: { accent: "#74d49a", background: "#102018", radius: 1, glass: 8 } },
    { name: "Soft", design: { accent: "#c4a7e7", background: "#232136", radius: 1.4, glass: 12 } },
    { name: "Endcord", design: { accent: "#3d74e0", background: "#10182a", radius: 1, glass: 10, font: "geometric" } },
    { name: "Ocean", design: { accent: "#4fc3f7", background: "#0b1a24", radius: 1.2, glass: 12, scrollbars: "accent" } },
    { name: "Sunset", design: { accent: "#ff8a5c", background: "#1f1418", radius: 1, glass: 8 } },
    { name: "Rose", design: { accent: "#f38ba8", background: "#1e1e2e", radius: 1.4, glass: 12 } },
    { name: "Mono", design: { accent: "#d8d8d8", background: "#121212", radius: 0.5, glass: 0, flat: true, font: "mono" } }
] satisfies { name: string; design: Partial<ThemeDesign>; }[]).map(({ name, design }) => ({ name, design: { ...DISCORD_DESIGN, ...design } }));

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/**
 * A design with every field present and in range. Everything ends up in CSS, so a design read from a share code or
 * an old settings file keeps only values that can't carry anything else
 */
export function normalizeDesign(input: unknown): ThemeDesign {
    const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const color = (field: unknown) => typeof field === "string" && HEX.test(field) ? field.toLowerCase() : "";

    return {
        accent: color(value.accent),
        background: color(value.background),
        radius: clamp(value.radius, 0, 2, 1),
        glass: Math.round(clamp(value.glass, 0, 24, 0)),
        font: typeof value.font === "string" && value.font in FONTS ? value.font as FontName : "",
        flat: value.flat === true,
        scrollbars: value.scrollbars === "accent" || value.scrollbars === "hidden" ? value.scrollbars : ""
    };
}

export const isSameDesign = (a: unknown, b: unknown) => JSON.stringify(normalizeDesign(a)) === JSON.stringify(normalizeDesign(b));

const SHARE_PREFIX = "ECS1:";

/** A short code someone can paste into their own Theme Studio */
export const toShareCode = (design: ThemeDesign) => SHARE_PREFIX + btoa(JSON.stringify(normalizeDesign(design)));

export function fromShareCode(code: string): ThemeDesign | undefined {
    const text = code.trim();
    if (!text.startsWith(SHARE_PREFIX)) return undefined;

    try {
        return normalizeDesign(JSON.parse(atob(text.slice(SHARE_PREFIX.length))));
    } catch {
        return undefined;
    }
}

const hex = (value: number) => Math.round(value).toString(16).padStart(2, "0");

function hslToHex(hue: number, saturation: number, lightness: number) {
    const s = saturation / 100;
    const l = lightness / 100;
    const k = (n: number) => (n + hue / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return `#${hex(f(0) * 255)}${hex(f(8) * 255)}${hex(f(4) * 255)}`;
}

/** A random look that still reads well: a lively accent on a dark background of a nearby hue */
export function randomDesign(random = Math.random): ThemeDesign {
    const hue = random() * 360;
    const fonts = ["", ...Object.keys(FONTS)] as ThemeDesign["font"][];

    return normalizeDesign({
        accent: hslToHex(hue, 65 + random() * 30, 60 + random() * 12),
        background: hslToHex((hue + 20 + random() * 20) % 360, 25 + random() * 25, 8 + random() * 6),
        radius: [0.5, 0.75, 1, 1.25, 1.5][Math.floor(random() * 5)],
        glass: Math.round(random() * 16),
        font: fonts[Math.floor(random() * fonts.length)],
        flat: random() < 0.25,
        scrollbars: random() < 0.4 ? "accent" : ""
    });
}

const RADII = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
// The step of Discord's accent scale its buttons use
const ACCENT_BASE = "--blurple-50-hsl";
// The step of Discord's neutral scale each dark theme paints its background with, in the order they have to override each other
const THEME_BASES = { ".theme-dark": "--neutral-69-hsl", ".theme-darker": "--neutral-86-hsl", ".theme-midnight": "--neutral-100-hsl" };
// Past this the scale runs out of room above it, and text stops standing out from the background
const LIGHTEST_BACKGROUND = 30;
// Text sits on the same scale, and shouldn't take on the background's color
const TEXT_LIGHTNESS = 50;
const TEXT_TINT = 0.25;

// Above this, dark text has more contrast on a color than white does
const DARK_TEXT_LUMINANCE = 0.2;
const DARK_TEXT = "#10182a";

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

function relativeLuminance(hex: string) {
    const [red, green, blue] = [1, 3, 5].map(start => {
        const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

const onAccentVariables = (accent: string) => relativeLuminance(accent) <= DARK_TEXT_LUMINANCE
    ? []
    : ["text-default", "text-hover", "text-active", "icon-default", "icon-hover", "icon-active"].map(part => `--control-primary-${part}: ${DARK_TEXT}`);

// Discord's brand colors and buttons all come from this one scale
function accentVariables(accent: string, blurples: ColorScale) {
    const base = blurples[ACCENT_BASE];
    if (base === undefined) return [];

    const { hue, saturation, lightness } = hexToHSL(accent.slice(1));

    return [
        ...Object.entries(blurples).map(([name, own]) => `${name}: ${hue.toFixed(1)} ${saturation.toFixed(1)}% ${clampPercent(lightness + own - base).toFixed(1)}%`),
        "--text-link: var(--blurple-30)",
        ...onAccentVariables(accent)
    ];
}

function neutralVariables(background: string, base: number, neutrals: ColorScale) {
    const { hue, saturation, lightness } = hexToHSL(background.slice(1));
    const target = Math.min(lightness, LIGHTEST_BACKGROUND);

    return Object.entries(neutrals).map(([name, own]) => {
        const shade = clampPercent(target + own - base);
        const tint = shade > TEXT_LIGHTNESS ? saturation * TEXT_TINT : saturation;

        return `${name}: ${hue.toFixed(1)} ${tint.toFixed(1)}% ${shade.toFixed(1)}%`;
    });
}

const block = (selector: string, declarations: string[]) => `${selector} {\n${declarations.map(line => `    ${line} !important;`).join("\n")}\n}`;

export function generateThemeCss(design: ThemeDesign, { neutrals, blurples }: DiscordScales) {
    const { accent, background, radius, glass, font, flat, scrollbars } = normalizeDesign(design);
    const blocks = [] as string[];

    const shared = accent ? accentVariables(accent, blurples) : [];
    if (radius !== 1) shared.push(...Object.entries(RADII).map(([size, pixels]) => `--radius-${size}: ${(pixels * radius).toFixed(1)}px`));
    if (font) shared.push(...["--font-primary", "--font-display", "--font-headline"].map(name => `${name}: ${FONTS[font]}`));
    if (flat) shared.push(...["--elevation-low", "--elevation-medium", "--elevation-high", "--elevation-stroke", "--shadow-low", "--shadow-medium", "--shadow-high", "--shadow-border"].map(name => `${name}: none`));
    if (scrollbars === "accent") shared.push("--scrollbar-thin-thumb: var(--brand-500)", "--scrollbar-auto-thumb: color-mix(in oklab, var(--brand-500) 70%, transparent)");
    if (shared.length) blocks.push(block("html, .theme-dark, .theme-light, .theme-darker, .theme-midnight", shared));

    // Only the dark themes: a dark background on a light theme would leave its dark text unreadable
    if (background) {
        for (const [theme, step] of Object.entries(THEME_BASES)) {
            if (neutrals[step] !== undefined) blocks.push(block(theme, neutralVariables(background, neutrals[step], neutrals)));
        }
    }

    if (glass) {
        blocks.push(block('[class^="menu_"], [class*=" menu_"]', [
            "background: color-mix(in oklab, var(--background-surface-high) 72%, transparent)",
            `backdrop-filter: blur(${glass}px) saturate(1.2)`
        ]));
    }

    if (scrollbars === "hidden") blocks.push(block("::-webkit-scrollbar", ["width: 0", "height: 0"]));

    return blocks.join("\n\n");
}

export const toThemeFile = (css: string) => `/**
 * @name Endcord Studio Theme
 * @description Made with Endcord's Theme Studio
 * @author Endcord
 * @version 1.0.0
 */

${css}
`;
