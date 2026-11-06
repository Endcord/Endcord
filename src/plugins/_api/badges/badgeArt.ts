/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Endcord's two badges are pixel art on a 22 grid, the size of a badge, so every pixel lands on a screen pixel in the
// badge row, and are kept as squares so they stay sharp on the badge page too
const SIZE = 22;

function pixelArt(rows: string[], palette: Record<string, string>) {
    const left = (SIZE - rows[0].length) / 2;
    const top = Math.floor((SIZE - rows.length) / 2);
    const pixels = rows.flatMap((row, y) => [...row].map((cell, x) => palette[cell] ? `<rect x="${left + x}" y="${top + y}" width="1" height="1" fill="${palette[cell]}"/>` : ""));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">${pixels.join("")}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// The developer badge: Endcord's panda, 20 by 17, about the size of the art in Discord's own badges. Its outline is
// Endcord's ice blue: in navy it vanished on dark profiles, which left a white face with two dark holes that read as a
// skull from a distance
export const DEVELOPER_ICON = pixelArt([
    "..LLL..........LLL..",
    ".LKKKL........LKKKL.",
    ".LKKKKLLLLLLLLKKKKL.",
    ".LKKKWWWWWWWWWWKKKL.",
    "..LKWWWWWWWWWWWWKL..",
    ".LWWWWWWWWWWWWWWWWL.",
    ".LWWKKKWWWWWWKKKWWL.",
    "LWWKKKKKWWWWKKKKKWWL",
    "LWWKEKKKWWWWKEKKKWWL",
    "LWWKKKKKWWWWKKKKKWWL",
    "LWWWKKKWWKKWWKKKWWWL",
    ".LWWWWWWWKKWWWWWWWL.",
    ".LWPPWWWKWWKWWWPPWL.",
    "..LWWWWWWKKWWWWWWL..",
    "...LWWWWWWWWWWWWL...",
    "....LLWWWWWWWWLL....",
    "......LLLLLLLL......"
], { L: "#9ccbff", K: "#1e2740", W: "#f8fafe", E: "#ffffff", P: "#ff9db3" });

// The contributor badge: a stalk of bamboo, what keeps the panda going. Endcord's bamboo green, with a lighter edge
// where the light catches it and darker rings at its joints, 18 by 18
export const CONTRIBUTOR_ICON = pixelArt([
    "......OOOOOO....OO",
    "......OHFFFO...OLO",
    "......OHFFFO..OLLO",
    "......OHFFFO.OLLO.",
    "......OHFFFOOLLO..",
    ".....ONNNNNNOLO...",
    "......OHFFFO.O....",
    "OO....OHFFFO......",
    "OLO...OHFFFO......",
    "OLLO..OHFFFO......",
    ".OLLO.OHFFFO......",
    "..OLLONNNNNNO.....",
    "...OO.OHFFFO......",
    "......OHFFFO......",
    "......OHFFFO......",
    "......OHFFFO......",
    "......OHFFFO......",
    "......OOOOOO......"
], { O: "#1f5c3f", H: "#c6f6d8", F: "#74d49a", N: "#3f9e6c", L: "#5cc489" });
