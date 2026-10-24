/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { RestAPI, showToast } from "@webpack/common";

const HOUSES = {
    0: "None",
    1: "Bravery",
    2: "Brilliance",
    3: "Balance"
} as const;

const settings = definePluginSettings({
    currentHouse: {
        type: OptionType.SELECT,
        description: "Your current HypeSquad house",
        options: [
            { label: "Remove Badge", value: 0, default: true },
            { label: "House Bravery", value: 1 },
            { label: "House Brilliance", value: 2 },
            { label: "House Balance", value: 3 }
        ],
        onChange: async (newValue: number) => {
            await applyHouse(newValue);
        }
    }
});

// Replies go to the channel the command ran in, or a toast when changed from settings.
async function applyHouse(houseId: number, channelId?: string) {
    const reply = (content: string) => channelId ? sendBotMessage(channelId, { content }) : showToast(content);
    try {
        if (houseId === 0) {
            await RestAPI.del({ url: "/hypesquad/online" });
            reply("✅ HypeSquad badge removed");
            return;
        }

        if (![1, 2, 3].includes(houseId)) {
            reply("❌ Invalid house ID. Use 0 (remove), 1 (Bravery), 2 (Brilliance), or 3 (Balance)");
            return;
        }

        await RestAPI.post({
            url: "/hypesquad/online",
            body: { house_id: houseId }
        });

        reply(`✅ HypeSquad set to ${HOUSES[houseId as keyof typeof HOUSES]}`);
    } catch (error) {
        reply(`❌ Request failed: ${error}`);
    }
}

export default definePlugin({
    name: "HypeSquadSwitcher",
    description: "Easily switch between HypeSquad houses or remove your badge",

    authors: [Devs.vpg],
    settings,

    commands: [
        {
            name: "hypesquad",
            description: "Apply or remove your HypeSquad badge",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "house",
                    description: "0: Remove | 1: Bravery | 2: Brilliance | 3: Balance",
                    type: ApplicationCommandOptionType.INTEGER,
                    required: true,
                    choices: [
                        { label: "Remove Badge", value: "0", name: "Remove Badge" },
                        { label: "House Bravery", value: "1", name: "House Bravery" },
                        { label: "House Brilliance", value: "2", name: "House Brilliance" },
                        { label: "House Balance", value: "3", name: "House Balance" }
                    ]
                }
            ],
            execute: async (args, ctx) => {
                const houseId = Number(args[0].value);
                settings.store.currentHouse = houseId;
                await applyHouse(houseId, ctx.channel.id);
            }
        }
    ]
});
