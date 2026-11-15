/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PANDA_PALETTE, PANDA_ROWS, PixelArt, SLEEPING_PANDA_ROWS } from "@components/settings/SpecialCard";
import { classes } from "@utils/misc";
import type { IconProps } from "@utils/types";
import type { ReactNode } from "react";

/**
 * Endcord's icons come in two styles and the page shows one (see endcordUi.css): smooth lines on a 24 grid, or
 * pixels like the logo when pixel style is on. In the pixel rows "#" is solid and "+" a quieter second tone. The
 * smooth drawing is a function because React isn't there yet when this file loads
 */
export function pixelIcon(rows: string[], smooth: () => ReactNode) {
    const size = rows.length;
    const tone = (mark: string) => rows.flatMap((row, y) => [...row].map((cell, x) => cell === mark ? `M${x} ${y}h1v1h-1z` : "")).join("");
    const solid = tone("#");
    const soft = tone("+");

    return function PixelIcon({ width = size * 2, className }: IconProps) {
        // Whole pixels only, or the grid goes uneven
        const scale = Math.max(1, Math.floor(Number(width) / size));
        const side = size * scale;

        return (
            <>
                <svg className={classes(className, "ec-icon-smooth")} width={side} height={side} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {smooth()}
                </svg>
                <svg className={classes(className, "ec-icon-pixel")} width={side} height={side} viewBox={`0 0 ${size} ${size}`} fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
                    <path d={solid} />
                    {soft && <path d={soft} opacity={0.45} />}
                </svg>
            </>
        );
    };
}

// The quieter second tone in the smooth drawings
export const SOFT = 0.45;

export const GamepadIcon = pixelIcon([
    "..........",
    "..######..",
    ".########.",
    "##.####.##",
    "#...##.#.#",
    "##.####.##",
    "##########",
    "###....###",
    "##......##",
    ".........."
], () => (
    <>
        <path d="M7.5 7h9a5 5 0 0 1 4.9 5.9l-.7 3.8a2.4 2.4 0 0 1-4.2 1.1L14.3 16H9.7l-2.2 1.8a2.4 2.4 0 0 1-4.2-1.1l-.7-3.8A5 5 0 0 1 7.5 7Z" />
        <path d="M8 10v4M6 12h4" />
        <circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </>
));

export const BroadcastIcon = pixelIcon([
    "..........",
    ".#......#.",
    "#..+..+..#",
    "#.+....+.#",
    "#.+.##.+.#",
    "#.+.##.+.#",
    "#.+....+.#",
    "#..+..+..#",
    ".#......#.",
    ".........."
], () => (
    <>
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" opacity={SOFT} />
        <path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
    </>
));

export const AppsIcon = pixelIcon([
    "####..++++",
    "####..++++",
    "####..++++",
    "####..++++",
    "..........",
    "..........",
    "++++..####",
    "++++..####",
    "++++..####",
    "++++..####"
], () => (
    <g fill="currentColor" stroke="none">
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <rect x="13" y="3" width="8" height="8" rx="2" opacity={SOFT} />
        <rect x="3" y="13" width="8" height="8" rx="2" opacity={SOFT} />
        <rect x="13" y="13" width="8" height="8" rx="2" />
    </g>
));

export const DropletIcon = pixelIcon([
    "....##....",
    "....##....",
    "...####...",
    "..######..",
    ".##+#####.",
    ".#+######.",
    ".#+######.",
    ".##+#####.",
    "..######..",
    "...####..."
], () => (
    <path d="M12 3s6.5 6.6 6.5 11.2a6.5 6.5 0 0 1-13 0C5.5 9.6 12 3 12 3Z" fill="currentColor" stroke="none" />
));

export const PulseIcon = pixelIcon([
    "..........",
    "...#......",
    "...#......",
    "..#.#..#..",
    "..#.#..#..",
    "##..#.#.##",
    "....#.#...",
    ".....#....",
    "..........",
    ".........."
], () => (
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
));

export const SparkleIcon = pixelIcon([
    "...##.....",
    "...##.....",
    "..####....",
    "######....",
    "######....",
    "..####..+.",
    "...##..+++",
    "...##...+.",
    "..........",
    ".........."
], () => (
    <>
        <path d="M10 3.5 11.7 8l4.5 1.7-4.5 1.7L10 16l-1.7-4.6L3.8 9.7 8.3 8 10 3.5Z" fill="currentColor" />
        <path d="M18 14.5v5M15.5 17h5" opacity={SOFT} />
    </>
));

export const HeartIcon = pixelIcon([
    "..........",
    ".##...##..",
    "####.####.",
    "#########.",
    "#########.",
    ".#######..",
    "..#####...",
    "...###....",
    "....#.....",
    ".........."
], () => <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" fill="currentColor" />);

export const PawIcon = pixelIcon([
    "..........",
    "..##..##..",
    "..##..##..",
    "##......##",
    "##......##",
    "....##....",
    "..######..",
    ".########.",
    ".###..###.",
    ".........."
], () => (
    <>
        <circle cx="8.5" cy="6.5" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="6.5" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="4.8" cy="11.2" r="1.7" fill="currentColor" stroke="none" opacity={SOFT} />
        <circle cx="19.2" cy="11.2" r="1.7" fill="currentColor" stroke="none" opacity={SOFT} />
        <path d="M12 11.5c-2.6 0-5.5 3.6-5.5 5.9 0 1.7 1.3 2.6 2.8 2.6 1 0 1.8-.5 2.7-.5s1.7.5 2.7.5c1.5 0 2.8-.9 2.8-2.6 0-2.3-2.9-5.9-5.5-5.9Z" fill="currentColor" stroke="none" />
    </>
));

export const SlidersIcon = pixelIcon([
    "...##.....",
    "...##.....",
    "+++##+++++",
    "...##.....",
    "...##.....",
    "......##..",
    "......##..",
    "++++++##++",
    "......##..",
    "......##.."
], () => (
    <>
        <path d="M4 7h16M4 17h16" opacity={SOFT} />
        <circle cx="9" cy="7" r="2.5" fill="currentColor" />
        <circle cx="15" cy="17" r="2.5" fill="currentColor" />
    </>
));

export const ShieldCheckIcon = pixelIcon([
    ".########.",
    "##########",
    "#######.##",
    "######..##",
    "##.##..###",
    "##....####",
    ".##..####.",
    ".#######..",
    "..#####...",
    "...###...."
], () => (
    <>
        <path d="M12 3 19 6v5.2c0 4.4-2.9 8.2-7 9.8-4.1-1.6-7-5.4-7-9.8V6l7-3Z" />
        <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </>
));

export const ChevronRightIcon = pixelIcon([
    "........",
    "..##....",
    "...##...",
    "....##..",
    "....##..",
    "...##...",
    "..##....",
    "........"
], () => (
    <path d="m9 6 6 6-6 6" />
));

export const ListIcon = pixelIcon([
    "..........",
    "##.+++++++",
    "##.+++++++",
    "..........",
    "##.+++++++",
    "##.+++++++",
    "..........",
    "##.+++++++",
    "##.+++++++",
    ".........."
], () => (
    <>
        <g fill="currentColor" stroke="none">
            <circle cx="5" cy="6" r="1.5" />
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="5" cy="18" r="1.5" />
        </g>
        <path d="M10 6h10M10 12h10M10 18h10" opacity={SOFT} />
    </>
));

export const CodeIcon = pixelIcon([
    "..........",
    "...#..#...",
    "..#....#..",
    ".#......#.",
    "#........#",
    "#........#",
    ".#......#.",
    "..#....#..",
    "...#..#...",
    ".........."
], () => (
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
));

export const RestartPixelIcon = pixelIcon([
    "..#####.##",
    ".#.....###",
    "#.....####",
    "#.........",
    "#.........",
    "#........#",
    "#........#",
    ".#......#.",
    "..######..",
    ".........."
], () => (
    <>
        <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
        <path d="M4.5 4.5V9H9" />
    </>
));

export const FolderPixelIcon = pixelIcon([
    "..........",
    "####......",
    "#####.....",
    "##########",
    "#++++++++#",
    "#++++++++#",
    "#++++++++#",
    "#++++++++#",
    "##########",
    ".........."
], () => (
    <>
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
        <path d="M3.5 10.5h17" opacity={SOFT} />
    </>
));

export const PowerIcon = pixelIcon([
    "....##....",
    ".##.##.##.",
    "##..##..##",
    "#...##...#",
    "#...##...#",
    "#........#",
    "##......##",
    ".##....##.",
    "..######..",
    ".........."
], () => (
    <>
        <path d="M12 3.5v8" />
        <path d="M7.1 6.6a7.5 7.5 0 1 0 9.8 0" />
    </>
));

export const SleepIcon = pixelIcon([
    ".....#####",
    "........#.",
    ".......#..",
    "......#...",
    ".....#####",
    "+++.......",
    "..+.......",
    ".+........",
    "+++.......",
    ".........."
], () => (
    <>
        <path d="M12 4h8l-8 8h8" />
        <path d="M4 14h5l-5 5h5" opacity={SOFT} />
    </>
));

// Corner icon, stepped in pixel style and rounded otherwise. Used for the pixel style setting
export const CornerIcon = pixelIcon([
    "......####",
    "......####",
    "....##....",
    "....##....",
    "..##......",
    "..##......",
    "##........",
    "##........",
    "##........",
    "##........"
], () => (
    <>
        <path d="M4 20v-6a10 10 0 0 1 10-10h6" />
        <path d="M9 20v-3a6 6 0 0 1 6-6h5" opacity={SOFT} />
    </>
));

// ---- The settings sidebar --------------------------------------------------------------------------------------
// Filled two-tone icons to match Discord's own: the body at 40% opacity, the distinctive part solid

export const filled = (children: () => ReactNode) => () => <g fill="currentColor" stroke="none">{children()}</g>;

export const PluginsTabIcon = pixelIcon([
    "++++...#..",
    "++++..###.",
    "++++.#####",
    "++++..###.",
    ".......#..",
    "..........",
    "++++..++++",
    "++++..++++",
    "++++..++++",
    "++++..++++"
], filled(() => (
    <>
        <g opacity={SOFT}>
            <rect x="3" y="3" width="8" height="8" rx="2.2" />
            <rect x="3" y="13" width="8" height="8" rx="2.2" />
            <rect x="13" y="13" width="8" height="8" rx="2.2" />
        </g>
        <rect x="13.4" y="3.4" width="7.2" height="7.2" rx="1.8" transform="rotate(45 17 7)" />
    </>
)));

export const ThemesTabIcon = pixelIcon([
    "...++++...",
    ".++++++++.",
    "++##++##++",
    "++##++##++",
    "++++++++++",
    "+##+++++..",
    "+##++++...",
    "+++++++...",
    ".+++++++..",
    "...++++..."
], filled(() => (
    <>
        <path opacity={SOFT} d="M12 3a9 9 0 1 0 0 18c1.3 0 2-1 1.7-2.1l-.3-1.2a2 2 0 0 1 1.9-2.6H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3Z" />
        <circle cx="7.5" cy="12.3" r="1.6" />
        <circle cx="9.4" cy="7.8" r="1.6" />
        <circle cx="14.3" cy="7.5" r="1.6" />
    </>
)));

export const UpdaterTabIcon = pixelIcon([
    "...++++...",
    ".++++++++.",
    ".+++##+++.",
    "++++##++++",
    "++++##++++",
    "++######++",
    "+++####+++",
    ".+++##+++.",
    ".++++++++.",
    "...++++..."
], filled(() => (
    <>
        <circle opacity={SOFT} cx="12" cy="12" r="9.5" />
        <path d="M12 6.6a1.1 1.1 0 0 1 1.1 1.1v6.1l2.1-2.1a1.1 1.1 0 1 1 1.6 1.6l-4 4a1.1 1.1 0 0 1-1.6 0l-4-4a1.1 1.1 0 1 1 1.6-1.6l2.1 2.1V7.7A1.1 1.1 0 0 1 12 6.6Z" />
    </>
)));

export const BackupTabIcon = pixelIcon([
    "..........",
    "##########",
    "##########",
    "..........",
    ".++++++++.",
    ".++####++.",
    ".++++++++.",
    ".++++++++.",
    ".++++++++.",
    ".........."
], filled(() => (
    <>
        <rect x="3" y="3.5" width="18" height="5" rx="1.8" />
        <path opacity={SOFT} d="M4.5 10h15v8a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 18v-8Z" />
        <rect x="9" y="12.2" width="6" height="2.2" rx="1.1" />
    </>
)));

export const DiagnosticsTabIcon = pixelIcon([
    "..........",
    "...++++...",
    ".+++++++#.",
    ".++++++#+.",
    "+++++##+++",
    "++++##++++",
    "+++###++++",
    "+++###++++",
    "..........",
    ".........."
], filled(() => (
    <>
        <path opacity={SOFT} d="M12 3.5A9.5 9.5 0 0 0 4.1 18.3a1.5 1.5 0 0 0 1.3.7h13.2a1.5 1.5 0 0 0 1.3-.7A9.5 9.5 0 0 0 12 3.5Z" />
        <path d="M16.9 8.6a1 1 0 0 1 .2 1.4l-3.2 4.5a2.3 2.3 0 1 1-1.6-1.2l3.2-4.5a1 1 0 0 1 1.4-.2Z" />
    </>
)));

// Bandage, for the Patch Helper tab
export const PatchHelperTabIcon = pixelIcon([
    ".......++.",
    "......++++",
    ".....+++++",
    "....##+++.",
    "...####+..",
    "..+####...",
    ".+++##....",
    "+++++.....",
    "++++......",
    ".++......."
], filled(() => (
    <>
        <rect opacity={SOFT} x="2" y="8" width="20" height="8" rx="4" transform="rotate(-45 12 12)" />
        <rect x="8.5" y="8.5" width="7" height="7" rx="1.6" transform="rotate(-45 12 12)" />
    </>
)));

// The logo at icon size, as on the app icon: an E in ice with cobalt below it, the panda asleep on top
const LOGO_ROWS = [
    "................zzzz",
    "......KK....KK....z.",
    "......KWWWWWWK...z..",
    "......WWWWWWWw..zzzz",
    "......WKKWWKKw......",
    "......WKKWWKKw......",
    "......WWWKKWWw......",
    "....KKIIIIIIIIKK....",
    "...IIIIIIIIIIIII....",
    "...IIIIIIIIIIIIIS...",
    "...IIISSSSSSSSSSS...",
    "...IIIS.............",
    "...IIIIIIIIII.......",
    "...IIIIIIIIIIS......",
    "...IIISSSSSSSS......",
    "...IIIS.............",
    "...IIIIIIIIIIIII....",
    "...IIIIIIIIIIIIIS...",
    "....IIIIIIIIIIISS...",
    ".....SSSSSSSSSSS...."
];
const LOGO_PALETTE = { K: "#232C40", W: "#F3F6FB", w: "#C9D3E4", I: "#9CCBFF", S: "#3D74E0", z: "#9CCBFF" };

/** The logo at icon size. Always in the logo's colors, not currentColor */
export function EndcordLogoIcon({ width = 20, className }: IconProps) {
    return <PixelArt className={className} rows={LOGO_ROWS} palette={LOGO_PALETTE} pixel={Math.max(1, Math.floor(Number(width) / 20))} />;
}

/** The panda from the logo. Asleep by default, awake on hover */
export function EndcordMark({ width = 17, className, asleep }: IconProps & { asleep?: boolean; }) {
    return <PixelArt className={className} rows={asleep ? SLEEPING_PANDA_ROWS : PANDA_ROWS} palette={PANDA_PALETTE} pixel={Math.max(1, Math.floor(Number(width) / 17))} />;
}

const LETTERS: Record<string, string[]> = {
    E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
    D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
    O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"]
};

const LETTER_ROWS = LETTERS.E.map((_, y) => `${[..."ENDCORD"].map(letter => LETTERS[letter][y]).join(".")}.`);

// Ice letters with a cobalt pixel to the lower right of each, like the letters in the logo
const WORDMARK_ROWS = [...LETTER_ROWS, ".".repeat(LETTER_ROWS[0].length)].map((row, y, all) =>
    [...row].map((cell, x) => cell === "#" ? "#" : all[y - 1]?.[x - 1] === "#" ? "s" : ".").join("")
);

/** The "Endcord" wordmark, in pixel letters when pixel style is on */
export const EndcordWordmark = ({ className }: { className?: string; }) => (
    <>
        <span className={classes(className, "ec-icon-smooth", "ec-wordmark")}>Endcord</span>
        <PixelArt className={classes(className, "ec-icon-pixel")} rows={WORDMARK_ROWS} palette={{ "#": "#9CCBFF", s: "#3D74E0" }} pixel={2} />
    </>
);

// Pixel style only: the dashes, dots and plus signs around the logo
const SPARK_ROWS = [
    "............#.................",
    "...c.......###.........c......",
    "............#.....cc..........",
    ".......................#......",
    "dddddddd..ccccc...dd..###..ddd",
    ".......................#......",
    "..dddd.......c.....ddddd......",
    "........c........c..........c."
];

export const LogoSparks = ({ className }: { className?: string; }) => (
    <PixelArt className={classes(className, "ec-icon-pixel")} rows={SPARK_ROWS} palette={{ "#": "#9CCBFF", c: "#3D74E0", d: "#33456A" }} pixel={2} />
);
