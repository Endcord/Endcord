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
function pixelIcon(rows: string[], smooth: () => ReactNode) {
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
const SOFT = 0.45;

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

// A corner: stepped in pixels, round when smooth. It stands for pixel style
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

/** Endcord's panda. It sleeps on the logo, and wakes up when someone's there */
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

/** The name, set in type, or in pixel letters when pixel style is on */
export const EndcordWordmark = ({ className }: { className?: string; }) => (
    <>
        <span className={classes(className, "ec-icon-smooth", "ec-wordmark")}>Endcord</span>
        <PixelArt className={classes(className, "ec-icon-pixel")} rows={WORDMARK_ROWS} palette={{ "#": "#9CCBFF", s: "#3D74E0" }} pixel={2} />
    </>
);

// The dashes, dots and plus signs that fly around the logo, in pixel style only
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
