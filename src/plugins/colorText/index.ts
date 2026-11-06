/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption } from "@api/Commands";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

// Discord colors the text of an "ansi" code block with these escape codes, the only colored text it shows
const COLORS = {
    gray: 30, red: 31, green: 32, yellow: 33, blue: 34, pink: 35, cyan: 36, white: 37
} as const;
const BACKGROUNDS = {
    navy: 40, orange: 41, slate: 42, teal: 43, gray: 44, indigo: 45, silver: 46, white: 47
} as const;
const STYLES = { bold: 1, underline: 4 } as const;

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

const choices = (names: readonly string[]) => names.map(name => ({ name, label: name, value: name }));

export function colorize(text: string, color: string, background?: string, style?: string) {
    const codes: number[] = [STYLES[style as keyof typeof STYLES] ?? 0, COLORS[color as keyof typeof COLORS] ?? COLORS.white];
    const bg = BACKGROUNDS[background as keyof typeof BACKGROUNDS];
    if (bg) codes.push(bg);

    // Three backticks would end the block early, so they get a zero width space between them
    const safe = text.replace(/`(?=``)/g, `\`${ZERO_WIDTH_SPACE}`);
    const lines = safe.split("\n").map(line => `\u001b[${codes.join(";")}m${line}\u001b[0m`);
    return `\`\`\`ansi\n${lines.join("\n")}\n\`\`\``;
}

export default definePlugin({
    name: "ColorText",
    description: "/color writes your message in color, using the colored code blocks Discord can show.",
    tags: ["Chat", "Commands", "Fun"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    commands: [
        {
            name: "color",
            description: "Send your message in color",
            inputType: ApplicationCommandInputType.BUILT_IN_TEXT,
            options: [
                { name: "message", description: "What to write", type: ApplicationCommandOptionType.STRING, required: true },
                { name: "color", description: "The color of the text", type: ApplicationCommandOptionType.STRING, required: true, choices: choices(Object.keys(COLORS)) },
                { name: "background", description: "A color behind the text", type: ApplicationCommandOptionType.STRING, choices: choices(Object.keys(BACKGROUNDS)) },
                { name: "style", description: "Bold or underlined", type: ApplicationCommandOptionType.STRING, choices: choices(Object.keys(STYLES)) }
            ],
            execute: opts => ({
                content: colorize(
                    findOption(opts, "message", ""),
                    findOption(opts, "color", "white"),
                    findOption<string>(opts, "background"),
                    findOption<string>(opts, "style")
                )
            })
        }
    ]
});
