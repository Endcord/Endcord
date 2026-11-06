/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings, migrateRemovedPlugin } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, StreamerModeStore, UserStore } from "@webpack/common";

const ACTIVE_ATTRIBUTE = "data-ec-streamer-shield";
const REVEAL_ATTRIBUTE = "data-ec-streamer-shield-reveal";

// Only undone when the stream ends if this plugin was what turned it on
let enabledStreamerMode = false;

const settings = definePluginSettings({
    enableOnScreenShare: {
        type: OptionType.BOOLEAN,
        description: "Turn on Streamer Mode whenever you share your screen in Discord",
        default: true
    },
    revealOnHover: {
        type: OptionType.BOOLEAN,
        description: "Show a blurred DM when you hover it. Anyone watching the stream sees it too",
        default: false,
        onChange: update
    }
});

function update() {
    const { body } = document;

    body.toggleAttribute(ACTIVE_ATTRIBUTE, StreamerModeStore.enabled);
    body.toggleAttribute(REVEAL_ATTRIBUTE, settings.store.revealOnHover);
}

function setStreamerMode(value: boolean) {
    FluxDispatcher.dispatch({ type: "STREAMER_MODE_UPDATE", key: "enabled", value });
}

const isOwnStream = (streamKey: string) => streamKey.endsWith(UserStore.getCurrentUser().id);

migrateRemovedPlugin("StreamerShield", "StreamerModeOnStream", { settings: { enableOnScreenShare: true } });

export default definePlugin({
    name: "StreamerShield",
    description: "Blurs your DM list while Streamer Mode is on, and can turn Streamer Mode on when you share your screen",
    tags: ["Privacy", "Utility"],
    authors: [Devs.rootpoi],
    settings,

    flux: {
        STREAM_CREATE({ streamKey }: { streamKey: string; }) {
            if (!settings.store.enableOnScreenShare || StreamerModeStore.enabled || !isOwnStream(streamKey)) return;

            enabledStreamerMode = true;
            setStreamerMode(true);
        },

        STREAM_DELETE({ streamKey }: { streamKey: string; }) {
            if (!enabledStreamerMode || !isOwnStream(streamKey)) return;

            enabledStreamerMode = false;
            setStreamerMode(false);
        }
    },

    start() {
        StreamerModeStore.addChangeListener(update);
        update();
    },

    stop() {
        StreamerModeStore.removeChangeListener(update);
        document.body.removeAttribute(ACTIVE_ATTRIBUTE);
        document.body.removeAttribute(REVEAL_ATTRIBUTE);
    }
});
