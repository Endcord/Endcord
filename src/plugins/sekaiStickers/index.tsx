/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import definePlugin, { OptionType } from "@utils/types";
import { openModal, showToast, Toasts } from "@webpack/common";

import { loadCharacters } from "./characters";
import SekaiStickersModal from "./Components/SekaiStickersModal";
import { kanadeSvg } from "./kanade.svg";

const settings = definePluginSettings({
    AutoCloseModal: {
        type: OptionType.BOOLEAN,
        description: "Auto close modal when done",
        default: true
    }
});

async function openStickerMaker() {
    try {
        await loadCharacters();
    } catch {
        showToast(t("Couldn't load the Sekai stickers. Check your connection and try again."), Toasts.Type.FAILURE);
        return;
    }
    openModal(props => <SekaiStickersModal modalProps={props} settings={settings} />);
}

const SekaiStickerChatButton: ChatBarButtonFactory = () => {
    return (
        <ChatBarButton onClick={openStickerMaker} tooltip={t("Sekai Stickers")}>
            {kanadeSvg()}
        </ChatBarButton>
    );
};

let IS_FONTS_LOADED = false;
export default definePlugin({
    name: "SekaiStickers",
    description: "Sekai Stickers built in discord originally from github.com/TheOriginalAyaka",
    dependencies: ["ChatInputButtonAPI"],
    tags: ["Chat", "Emotes"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,
    chatBarButton: {
        icon: kanadeSvg,
        render: SekaiStickerChatButton
    },
    async start() {
        const fonts = [{ name: "YurukaStd", url: "https://raw.githubusercontent.com/TheOriginalAyaka/sekai-stickers/47a2ca33b8cb35f59800e8faad48980e4ce5ea71/src/fonts/YurukaStd.woff2" }, { name: "SSFangTangTi", url: "https://raw.githubusercontent.com/TheOriginalAyaka/sekai-stickers/main/src/fonts/ShangShouFangTangTi.woff2" }];
        if (!IS_FONTS_LOADED) {
            fonts.forEach(n => {
                new FontFace(n.name, `url(${n.url})`).load().then(
                    font => { document.fonts.add(font); },
                    err => { console.debug(err); }
                );
            });
            IS_FONTS_LOADED = true;
        }
    },
});
