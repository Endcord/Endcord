/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Pet } from "./pet";

// The Endcord panda, the one asleep on the logo. It follows the puppy, and falls asleep sooner than anyone

const PALETTE: Record<string, string> = {
    o: "#0e1220", // outline
    w: "#f3f6fb", // white fur
    s: "#c3ccdb", // white fur in shade
    k: "#262b38", // black fur
    e: "#f3f6fb", // shine in the eyes
    z: "#9ccbff" // the logo's ice-blue z
};

const FRAMES: Pet["frames"] = {
    run1: [
        "................",
        "........kk...kk.",
        "........kooooko.",
        ".......owwwwwwwo",
        ".......owkkwkkwo",
        ".......okekwkeko",
        "..oooooowwwowwwo",
        ".owwwwwkowwwwwo.",
        ".owwwwwkkooooo..",
        ".osswwwwkkkko...",
        ".okkswwwwkkko...",
        "okkkooooooookkko",
        "okko........okko",
        "ooo..........ooo",
        "................",
        "................",
    ],
    run2: [
        "................",
        "................",
        "........kk...kk.",
        "........kooooko.",
        ".......owwwwwwwo",
        ".......owkkwkkwo",
        ".......okekwkeko",
        "..oooooowwwowwwo",
        ".owwwwwkowwwwwo.",
        ".owwwwwkkooooo..",
        ".osswwwwkkkko...",
        ".okkswwwwkkko...",
        "..okkooooookko..",
        "...okko..okko...",
        "...ooo...ooo....",
        "................",
    ],
    sit: [
        "................",
        "...kkk....kkk...",
        "...kooooooook...",
        "...owwwwwwwwo...",
        "..owwkkwwkkwwo..",
        "..owkekwwkekwo..",
        "..owkkwoowkkwo..",
        "...owwwwwwwwo...",
        "...okkwwwwkko...",
        "..okkkwwwwkkko..",
        "..okkwwwwwwkko..",
        "..owswwwwwwswo..",
        "..okkkwwwwkkko..",
        "..okkkooookkko..",
        "...ooo....ooo...",
        "................",
    ],
    sleep1: [
        "...........zzzz.",
        "..............z.",
        ".............z..",
        "............z...",
        "...........zzzz.",
        "................",
        "........kk...kk.",
        "........kooooko.",
        ".......owwwwwwwo",
        ".......owkkwkkwo",
        "...oooooswwowwwo",
        "..owwwwkkowwwwo.",
        ".oswwwwkkkkoooo.",
        ".okkswwwkkkkkkko",
        "..oooooooooooooo",
        "................",
    ],
    sleep2: [
        "............zzzz",
        "...............z",
        "..............z.",
        ".............z..",
        "............zzzz",
        "................",
        "........kk...kk.",
        "........kooooko.",
        ".......owwwwwwwo",
        ".......owkkwkkwo",
        "...oooooswwowwwo",
        "..owwwwkkowwwwo.",
        ".oswwwwkkkkoooo.",
        ".okkswwwkkkkkkko",
        "..oooooooooooooo",
        "................",
    ]
};

export const panda: Pet = {
    id: "ec-oneko-panda",
    palette: PALETTE,
    frames: FRAMES,
    follows: ["ec-oneko-puppy", "oneko"],
    speed: 9,
    sleepAfter: 50
};
