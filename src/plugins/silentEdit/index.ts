/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { FluxDispatcher } from "@webpack/common";

const edited = new Set<string>();

function onMessageUpdate({ message }: any) {
    if (!message?.id || !message?.edited_timestamp) return;
    const me = (Endcord as any).Webpack?.findByStoreName?.("UserStore")?.getCurrentUser?.();
    if (me && message.author?.id === me.id) {
        edited.add(message.id);
        if (edited.size > 500) {
            const first = edited.values().next().value;
            if (first) edited.delete(first);
        }
    }
}

export default definePlugin({
    name: "SilentEdit",
    description: "Hides the '(edited)' label on your own edited messages. The message stays — nothing is deleted or resent.",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    tags: ["Chat", "Utility"],

    patches: [
        {
            // "(edited)" label next to the message content
            find: '"AFTER_ACCESSORIES"',
            replacement: {
                match: /return (\i)\.isEdited\(\)&&null!=\1\.editedTimestamp/,
                replace: "return !$self.shouldHide($1.id)&&$1.isEdited()&&null!=$1.editedTimestamp",
            },
        },
    ],

    start() {
        FluxDispatcher.subscribe("MESSAGE_UPDATE", onMessageUpdate);
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_UPDATE", onMessageUpdate);
        edited.clear();
    },

    shouldHide(id: string): boolean {
        return edited.has(id);
    },
});
