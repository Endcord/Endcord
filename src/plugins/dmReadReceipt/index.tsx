/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MessageDecorationProps } from "@api/MessageDecorations";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { MessageStore, React, TypingStore, UserStore, useStateFromStores } from "@webpack/common";

function SeenIndicator({ message, channel }: MessageDecorationProps) {
    const recipientId = channel.recipients?.[0];

    const status = useStateFromStores(
        [MessageStore, TypingStore],
        () => {
            if (!recipientId) return null;
            const isTyping = (TypingStore as any).isTyping(channel.id, recipientId);
            if (isTyping) return "typing" as const;

            const msgs = MessageStore.getMessages(channel.id);
            if (!msgs) return null;
            const msgTs = new Date(message.timestamp).getTime();
            const lastMsg = msgs.last();
            const hasSeen = lastMsg && lastMsg.author?.id === recipientId && new Date(lastMsg.timestamp).getTime() > msgTs;
            return hasSeen ? "seen" as const : null;
        }
    );

    if (!status || !recipientId) return null;
    return (
        <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "4px" }}>
            {status === "typing" ? "Seen · typing..." : "Seen ✓"}
        </span>
    );
}

export default definePlugin({
    name: "DmReadReceipt",
    description: "Shows a Seen indicator on your messages in DMs when the other person has read them.",
    tags: ["Chat", "Utility"],
    authors: [Devs.ewlle, Devs.kraethis, Devs.Sharp],
    dependencies: ["MessageDecorationsAPI"],

    renderMessageDecoration: props => {
        const me = UserStore.getCurrentUser()?.id;
        if (!me || props.message.author.id !== me || !props.channel.isDM()) return null;
        return <SeenIndicator {...props} />;
    },
});
