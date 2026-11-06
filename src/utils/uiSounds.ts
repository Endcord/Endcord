/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";

// Synthesized rather than recorded, so the sounds cost no download and stay quiet enough to sit under a voice call
const QUIET = 0.05;

let context: AudioContext | undefined;

function tone(frequency: number, startsIn: number, duration: number, volume: number, type: OscillatorType = "sine") {
    context ??= new AudioContext();

    const { currentTime, destination } = context;
    const start = currentTime + startsIn;

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
}

const SOUNDS = {
    on() {
        tone(1400, 0, 0.03, QUIET, "triangle");
        tone(620, 0.012, 0.05, QUIET * 0.8);
    },
    off() {
        tone(1000, 0, 0.03, QUIET, "triangle");
        tone(420, 0.012, 0.05, QUIET * 0.8);
    },
    success() {
        tone(660, 0, 0.16, QUIET * 0.7);
        tone(990, 0.09, 0.22, QUIET * 0.7);
    },
    error() {
        tone(180, 0, 0.16, QUIET * 1.4, "triangle");
    }
};

export function playUiSound(sound: keyof typeof SOUNDS) {
    if (!Settings.uiSounds) return;

    try {
        SOUNDS[sound]();
    } catch { }
}
