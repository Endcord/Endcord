/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addMessagePreSendListener, removeMessagePreSendListener } from "@api/MessageEvents";
import { filled, pixelIcon, SOFT } from "@components/EndcordIcons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";

import { Data } from "./components/data";
import DataUI from "./components/ui";

const EyeTabIcon = pixelIcon([
    "..........",
    "..........",
    "...++++...",
    ".+++##+++.",
    "+++####+++",
    "+++####+++",
    ".+++##+++.",
    "...++++...",
    "..........",
    ".........."
], filled(() => (
    <>
        <path opacity={SOFT} d="M12 5c5 0 8.6 4.2 9.7 6.2.3.5.3 1.1 0 1.6C20.6 14.8 17 19 12 19s-8.6-4.2-9.7-6.2a1.7 1.7 0 0 1 0-1.6C3.4 9.2 7 5 12 5Z" />
        <circle cx="12" cy="12" r="3.6" />
    </>
)));

export default definePlugin({
    name: "IRememberYou",
    description: "Locally saves everyone you've been communicating with (including servers), in case of lose",
    tags: ["Chat", "Servers"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    dependencies: ["MessageEventsAPI"],

    async start() {
        // The tab can open before the saved data has loaded, or after loading it failed: it shows an empty list then
        SettingsPlugin.customEntries.push({
            key: "endcord_i_remember_you",
            title: "I Remember You",
            Component: () => <DataUI usersCollection={(this.dataManager as Data | undefined)?.usersCollection ?? {}} />,
            Icon: EyeTabIcon
        });

        const data = (this.dataManager = await new Data().withStart());

        await data.initializeUsersCollection();
        data.writeGuildsOwnersToCollection();
        data.writeMembersFromUserGuildsToCollection();
        data._onMessagePreSend_preSend = addMessagePreSendListener(
            data.onMessagePreSend.bind(data)
        );
        data.storageAutoSaveProtocol();
    },

    stop() {
        removeFromArray(SettingsPlugin.customEntries, e => e.key === "endcord_i_remember_you");

        const dataManager = this.dataManager as Data | undefined;
        if (!dataManager) return;
        removeMessagePreSendListener(dataManager._onMessagePreSend_preSend);
        clearInterval(dataManager._storageAutoSaveProtocol_interval);
    },
});
