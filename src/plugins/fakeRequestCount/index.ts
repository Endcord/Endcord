/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { RelationshipStore } from "@webpack/common";

const MessageRequestStore = findStoreLazy("MessageRequestStore");

const settings = definePluginSettings({
    friendRequests: {
        type: OptionType.NUMBER,
        description: "How many friend requests the Friends badge shows",
        default: 3,
        onChange: refresh
    },
    messageRequests: {
        type: OptionType.NUMBER,
        description: "How many message requests the Message Requests badge shows",
        default: 2,
        onChange: refresh
    },
    addToReal: {
        type: OptionType.BOOLEAN,
        description: "Add these to your real requests instead of showing them alone",
        default: false,
        onChange: refresh
    }
});

// Only the numbers change: the lists behind them stay as they are, and nobody else sees a thing
const fake = (real: number, wanted: number) => {
    const count = Math.max(0, Math.min(9999, Math.round(Number(wanted) || 0)));
    return settings.store.addToReal ? real + count : count;
};

const restores: (() => void)[] = [];

function wrapCount(store: any, method: string, wanted: () => number) {
    const original = store?.[method];
    if (typeof original !== "function") return;

    const counted = function (this: unknown, ...args: unknown[]) {
        return fake(original.apply(this, args), wanted());
    };
    store[method] = counted;
    // Another plugin may have wrapped it since; then it keeps its wrapper and this one just passes through
    restores.push(() => {
        if (store[method] === counted) store[method] = original;
    });
}

function refresh() {
    for (const store of [RelationshipStore as any, MessageRequestStore]) {
        try {
            store?.emitChange();
        } catch { }
    }
}

export default definePlugin({
    name: "FakeRequestCount",
    description: "Shows as many friend and message requests as you like on Discord's badges. Only the numbers, only on your screen.",
    tags: ["Fun"],
    authors: [Devs.rootpoi],
    settings,

    start() {
        wrapCount(RelationshipStore, "getPendingCount", () => settings.store.friendRequests);
        wrapCount(MessageRequestStore, "getMessageRequestsCount", () => settings.store.messageRequests);
        refresh();
    },

    stop() {
        restores.splice(0).forEach(restore => restore());
        refresh();
    }
});
