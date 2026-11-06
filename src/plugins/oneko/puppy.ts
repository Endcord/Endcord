/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Pet } from "./pet";

// A puppy that trots after the cat. Drawn for Endcord

const PALETTE: Record<string, string> = {
    o: "#3a2414", // outline
    b: "#d69650", // coat
    s: "#b0743a", // shade
    d: "#8b5528", // ear
    w: "#f6ead8", // muzzle and chest
    k: "#1a1210", // eye and nose
    p: "#ff8ea0" // tongue
};

const FRAMES: Pet["frames"] = {
    run1: [
        "................",
        "................",
        "..........oooo..",
        ".........obbbbo.",
        "........odbkbbbo",
        "........oddbbwwk",
        ".o......oddbwwwo",
        "obo......odoopo.",
        ".obooooooobbo...",
        "..obbbbbbbbbo...",
        "..obbbbbbbbwo...",
        "..osbbbbbbbwo...",
        ".obsooooooobo...",
        "ob.o......o.bo..",
        "oo..........oo..",
        "................",
    ],
    run2: [
        "................",
        "..........oooo..",
        ".........obbbbo.",
        "........odbkbbbo",
        "........oddbbwwk",
        ".o......oddbwwwo",
        "obo......odoopo.",
        ".obooooooobbo...",
        "..obbbbbbbbbo...",
        "..obbbbbbbbwo...",
        "..osbbbbbbbwo...",
        "..obsooooobwo...",
        "...obo...obo....",
        "...ob....ob.....",
        "...oo....oo.....",
        "................",
    ],
    sit: [
        "................",
        "..........oooo..",
        ".........obbbbo.",
        "........odbkbbbo",
        "........oddbbwwk",
        "........oddbwwwo",
        ".........odoopo.",
        "......ooobbbo...",
        ".....obbbbbwo...",
        "....obbbbbwwo...",
        "o...obbbbbwwo...",
        "bo..osbbbbbwo...",
        "obooosbbbobwo...",
        ".obbbsbbobobo...",
        "..oooooooooo....",
        "................",
    ],
    sleep1: [
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "......oooooooo..",
        ".....obbbbbbbbo.",
        "....obbbbbbbbbbo",
        "..ooobbbbboodbbo",
        ".obbsbbbboddoobo",
        ".obssbbbbodbbwwo",
        "..oooooooooooooo",
        "................",
    ],
    sleep2: [
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "......oooooooo..",
        "....oobbbbbbbbo.",
        "..ooobbbbboodbbo",
        ".obbsbbbboddoobo",
        ".obssbbbbodbbwwo",
        "..oooooooooooooo",
        "................",
    ]
};

export const puppy: Pet = {
    id: "ec-oneko-puppy",
    palette: PALETTE,
    frames: FRAMES,
    follows: ["oneko"],
    speed: 10,
    sleepAfter: 80
};
