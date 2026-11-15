/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { plugins } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { filled, pixelIcon, SOFT } from "@components/EndcordIcons";
import { Paragraph } from "@components/Paragraph";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { getIntlMessage } from "@utils/discord";
import { t } from "@utils/i18n";
import { removeFromArray } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { Button } from "@webpack/common";

import { preload, unload } from "./images";
import openQrModal from "./ui/modals/QrModal";

const QrCodeTabIcon = pixelIcon([
    "###..+.###",
    "#.#..+.#.#",
    "###....###",
    "..........",
    "++.+..++.+",
    ".........+",
    "###..++.++",
    "#.#..+..+.",
    "###..+++.+",
    ".........."
], filled(() => (
    <>
        <path fillRule="evenodd" d="M3 5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm2.5.5v2h2v-2h-2ZM14 5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V5Zm2.5.5v2h2v-2h-2ZM3 16a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3Zm2.5.5v2h2v-2h-2Z" />
        <g opacity={SOFT}>
            <rect x="14" y="14" width="3" height="3" rx=".8" />
            <rect x="18" y="18" width="3" height="3" rx=".8" />
            <rect x="18" y="14" width="3" height="3" rx=".8" />
            <rect x="14" y="18" width="3" height="3" rx=".8" />
            <rect x="11.5" y="3" width="1.5" height="4" rx=".75" />
            <rect x="11.5" y="11.5" width="4" height="1.5" rx=".75" />
            <rect x="3" y="11.5" width="4" height="1.5" rx=".75" />
        </g>
    </>
)));

const settings = definePluginSettings({
    scanQr: {
        type: OptionType.COMPONENT,
        description: "Scan a QR code",
        component() {
            if (!plugins.LoginWithQR.started)
                return (
                    <Paragraph>
                        {t("Enable the plugin and restart your client to scan a login QR code")}</Paragraph>
                );

            return (
                <Button size={Button.Sizes.SMALL} onClick={openQrModal}>
                    {getIntlMessage("USER_SETTINGS_SCAN_QR_CODE")}
                </Button>
            );
        },
    },
});

export default definePlugin({
    name: "LoginWithQR",
    description: "Lets you sign in on another device by scanning its login QR code, just like on mobile.",
    tags: ["Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    settings,

    patches: [
        // Prevent paste event from firing when the QRModal is open
        {
            find: ".clipboardData&&(",
            replacement: {
                match: /handleGlobalPaste:(\i)(?=\}\))/,
                replace: "handleGlobalPaste:(...args)=>!$self.qrModalOpen&&$1(...args)",
            },
        },
    ],

    qrModalOpen: false,

    start() {
        SettingsPlugin.customEntries.push({
            key: "endcord_login_with_qr",
            title: getIntlMessage("USER_SETTINGS_SCAN_QR_CODE"),
            Component: openQrModal,
            Icon: QrCodeTabIcon
        });
        preload();
    },

    stop() {
        removeFromArray(SettingsPlugin.customEntries, e => e.key === "endcord_login_with_qr");
        unload();
    },
});
