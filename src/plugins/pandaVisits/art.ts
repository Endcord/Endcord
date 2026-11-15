/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The visiting panda, head to toe, in the pixel style of the logo. Every frame is COLUMNS × ROWS: the head in the
// middle, three free columns on each side for raised arms

export const COLUMNS = 23;
export const ROWS = 25;
const HEAD_LEFT = 3;

// The logo's head (PANDA_ROWS in @components/settings/SpecialCard). Copied: a new import from the core would grow the
// script every start runs
const HEAD = [
    "..kkk.......kkk..",
    ".kKKKk.....kKKKk.",
    ".KKKKKWWWWWKKKKK.",
    "..KKKWWWWWWWKKK..",
    "..WWWWWWWWWWWWW..",
    ".WWWWWWWWWWWWWWw.",
    ".WWKKKWWWWWKKKWw.",
    "WWKKEKKWWWKKEKKWw",
    "WWKKKKKWWWKKKKKWw",
    "WWWKKKWWWWWKKKWWw",
    "WWPPWWWKKKWWWPPWw",
    "WWPPWWWWKWWWWPPWw",
    ".WWWWWWKWKWWWWWw.",
    "..WWWWWWWWWWWWw..",
    "...wWWWWWWWWWw...",
    ".....wwwwwww.....",
];
const SLEEPING_HEAD = HEAD.map((row, y) => y === 7 ? row.replaceAll("E", "K") : y === 8 ? "WWKEEEKWWWKEEEKWw" : row);

// Arms down, from the shoulders, which the chin overlaps
const STAND = [
    ".....KKKKKKKKKKKKK.....",
    "....KKKKKKKKKKKKKKK....",
    "....KKKKWWWWWWWKKKK....",
    "....KKKWWWWWWWWwKKK....",
    "....KKKWWWWWWWWwKKK....",
    "....KKKWWWWWWWWwKKK....",
    ".....KKWWWWWWWWwKK.....",
    "......WWWWWWWWWWw......",
    ".....KKKKwwwwwKKKK.....",
    ".....KKKKK...KKKKK.....",
    ".....KKKKK...KKKKK.....",
];

// Knees pulled up and hugged, soles out: the shape it flips in
const TUCK = [
    ".....KKKKKKKKKKKKK.....",
    "....KKKKKKKKKKKKKKK....",
    "....KKKKKKWWWKKKKKK....",
    "....KKKKKKKWKKKKKKK....",
    "....KKKKKKKKKKKKKKK....",
    ".....KPPPKK.KKPPPK.....",
    "......KKK.....KKK......",
];

// Both arms up, from the paws down
const CHEER = [
    ".kk.................kk.",
    ".KK.................KK.",
    ".KK.................KK.",
    ".KK.................KK.",
    ".KK.................KK.",
    ".KK.................KK.",
    ".KK.................KK.",
    "..KK...............KK..",
    "..KK...............KK..",
    "...KK.............KK...",
    "...KKKKKKKKKKKKKKKKK...",
    "....KKKKKKKKKKKKKKK....",
    ".....KKKWWWWWWWKKK.....",
    ".....KWWWWWWWWWWwK.....",
    "......WWWWWWWWWWw......",
    "......WWWWWWWWWWw......",
    "......WWWWWWWWWWw......",
    "......WWWWWWWWWWw......",
    ".....KKKKwwwwwKKKK.....",
    ".....KKKKK...KKKKK.....",
    ".....KKKKK...KKKKK.....",
];

const BLANK = ".".repeat(COLUMNS);
const from = (top: number, rows: string[]) => Array.from({ length: ROWS }, (_, y) => rows[y - top] ?? BLANK);

const standing = from(14, STAND);
const cheering = from(4, CHEER);
// The right arm up, then with its paw tipped out
const waving = standing.map((row, y) => row.slice(0, 12) + cheering[y].slice(12));

const BODIES = {
    stand: standing,
    tuck: from(14, TUCK),
    cheer: cheering,
    wave: waving,
    waveOut: waving.map((row, y) => y >= 4 && y <= 8 ? `${row.slice(0, 12)}.${row.slice(12, -1)}` : row)
};

export type Pose = keyof typeof BODIES;

const isHead = (head: string[], x: number, y: number) => (head[y]?.[x - HEAD_LEFT] ?? ".") !== ".";

/**
 * A whole frame: the body with the head over it. The body's black fur gets the rim light the logo's ears have where
 * it meets the background, or arms and legs would vanish on dark blue
 */
export function frame(pose: Pose, asleep: boolean) {
    const head = asleep ? SLEEPING_HEAD : HEAD;
    const rows = BODIES[pose].map((row, y) => [...row].map((cell, x) => isHead(head, x, y) ? head[y][x - HEAD_LEFT] : cell));
    const outside = (x: number, y: number) => (rows[y]?.[x] ?? ".") === ".";

    return rows.map((row, y) => row.map((cell, x) =>
        cell === "K" && !isHead(head, x, y) && (outside(x - 1, y) || outside(x + 1, y) || outside(x, y - 1) || outside(x, y + 1)) ? "k" : cell
    ).join(""));
}

export const FUR: Record<string, string> = { K: "#232C40", k: "#4A5A80", W: "#F3F6FB", w: "#C9D3E4", E: "#FFFFFF", P: "#F4A6B8" };
// One visit in GOLDEN_CHANCE (see the plugin)
export const GOLDEN_FUR: Record<string, string> = { K: "#7A5416", k: "#A97A2A", W: "#FFD66B", w: "#E8B445", E: "#FFF6D8", P: "#F4A6B8" };
