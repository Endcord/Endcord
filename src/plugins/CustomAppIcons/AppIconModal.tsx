/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@utils/i18n";
import { localStorage } from "@utils/localStorage";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { findByPropsLazy } from "@webpack";
import { Button, FluxDispatcher, Forms, React, showToast, Text, TextInput, Toasts, useState } from "@webpack/common";

interface AppIcon {
    id: string,
    iconSource: string,
    name: string,
    isPremium: boolean;
}

interface AppIconData {
    UZ: AppIcon[];
    QA: Record<string, AppIcon>;
}

const AppIconStore = findByPropsLazy("getCurrentDesktopIcon");
const AppIconData = findByPropsLazy("UZ", "QA") as AppIconData;

function AppIconModal(props: ModalProps) {
    const [name, setName] = useState("");
    const [imageUrl, setimageUrl] = useState("");

    function addAppIcon(name: string, url: string) {
        const appIcons = JSON.parse(localStorage.getItem("vc_app_icons") ?? "[]") as AppIcon[];
        const id = `${name.replaceAll(" ", "")}_${Date.now()}`; // avoid crashing if repeated name
        const icon = {
            "id": id,
            "iconSource": url,
            "isPremium": false,
            "name": name
        } as AppIcon;

        appIcons.push(icon);
        AppIconData.UZ.push(icon);
        AppIconData.QA[icon.id] = icon;
        showToast("Added custom app icon!", Toasts.Type.SUCCESS);
        props.onClose();
        const oldIcon = AppIconStore.getCurrentDesktopIcon();

        let random_icon = AppIconData.UZ.map(icon => icon.id).filter(icon => icon !== oldIcon) as [];
        random_icon = random_icon[Math.floor(Math.random() * random_icon.length)];

        FluxDispatcher.dispatch({
            type: "APP_ICON_UPDATED",
            id: random_icon
        });
        FluxDispatcher.dispatch({
            type: "APP_ICON_UPDATED",
            id: oldIcon
        });
        localStorage.setItem("vc_app_icons", JSON.stringify(appIcons));
    }

    return <ModalRoot {...props} size={ModalSize.MEDIUM}>
        <ModalHeader>
            <Text color="header-primary" variant="heading-lg/semibold" tag="h1" style={{ flexGrow: 1 }}>{t("Add a custom app icon:")}</Text>
            <ModalCloseButton onClick={props.onClose}></ModalCloseButton>
        </ModalHeader>
        <ModalContent>
            <br />
            <div><Forms.FormTitle tag="h5">{t("Name")}</Forms.FormTitle>
                <Forms.FormText>
                    {t("This name will be shown in the App Icons list.")}</Forms.FormText>
                <TextInput
                    placeholder={t("My awesome Custom App Icon!")}
                    value={name}
                    onChange={setName}
                />
            </div>
            <br />
            <div><Forms.FormTitle tag="h5">{t("Image URL")}</Forms.FormTitle>
                <Forms.FormText>
                    {t("Paste here your image URL to upload your icon (.webp, .jpg, .jpeg, .png, .gif, .ico and Discord Icons, Emojis, PFPs, etc.).")}</Forms.FormText>
                <TextInput
                    placeholder="https://cdn.discordapp.com/emojis/1098881040900173895.gif"
                    value={imageUrl}
                    onChange={setimageUrl}
                />
            </div>
        </ModalContent>
        <ModalFooter>
            <Button
                onClick={() => {
                    addAppIcon(name, imageUrl);
                }}
                disabled={!name || !imageUrl && imageUrl.match(/(https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z]{2,}(\.[a-zA-Z]{2,})(\.[a-zA-Z]{2,})?\/[a-zA-Z0-9]{2,}|((https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z]{2,}(\.[a-zA-Z]{2,})(\.[a-zA-Z]{2,})?)|(https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z0-9]{2,}\.[a-zA-Z0-9]{2,}\.[a-zA-Z0-9]{2,}(\.[a-zA-Z0-9]{2,})?/) !== undefined}
            >
                {t("Add Icon")}</Button>
            <Button
                onClick={props.onClose}
                color={Button.Colors.PRIMARY}
                look={Button.Looks.LINK}
            >
                {t("Cancel")}</Button>
        </ModalFooter>
    </ModalRoot>;
}

export default AppIconModal;
