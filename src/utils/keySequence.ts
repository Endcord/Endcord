/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** Feed it keys as they're pressed. It calls onMatch whenever the latest ones are the sequence, whatever came before */
export function createKeySequence(sequence: string[], onMatch: () => void) {
    let recent: string[] = [];

    return (key: string) => {
        recent = [...recent, key].slice(-sequence.length);

        if (recent.length === sequence.length && recent.every((pressed, index) => pressed === sequence[index])) {
            recent = [];
            onMatch();
        }
    };
}
