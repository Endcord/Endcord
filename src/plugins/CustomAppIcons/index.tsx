/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Link } from "@components/Link";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import { localStorage } from "@utils/localStorage";
import { closeAllModals, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Button, FluxDispatcher, Forms, React, showToast, Toasts } from "@webpack/common";

import AppIconModal from "./AppIconModal";

interface AppIcon {
    id: string;
    iconSource: string;
    name: string;
    isPremium: boolean;
}

interface AppIconData {
    UZ: AppIcon[];
    QA: Record<string, AppIcon>;
}

const AppIconData = findByPropsLazy("UZ", "QA") as AppIconData;

const AppIconStore = findByPropsLazy("getCurrentDesktopIcon");

function removeAppIcon() {
    const current_icon = AppIconStore.getCurrentDesktopIcon();
    let icons = JSON.parse(localStorage.getItem("vc_app_icons") || "[]") as AppIcon[];
    const index = icons.findIndex(icon => current_icon === icon.id);
    if (index !== -1) {
        icons = icons.filter(icon => icon.id !== current_icon);
        delete AppIconData.QA[current_icon];
        delete AppIconData.UZ[AppIconData.UZ.findIndex(icon => current_icon === icon?.id)];
        localStorage.setItem("vc_app_icons", JSON.stringify(icons));
        showToast("Icon successfully deleted!", Toasts.Type.SUCCESS);
        FluxDispatcher.dispatch({
            type: "APP_ICON_UPDATED",
            id: "AppIcon"
        });
    } else {
        showToast("Cannot delete native App Icons!", Toasts.Type.FAILURE);
        return;
    }

}

export default definePlugin({
    name: "CustomAppIcons",
    description: "Add/upload your own custom (In-)App Icon(s).",
    tags: ["Customisation", "Appearance"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    patches: [
        {
            find: /\i\.\i\.APP_ICON_UPSELL/,
            replacement: [
                {
                    match: /\w+\.jsx\)\(\w+,{markAsDismissed:\w+,isCoachmark:\w+}\)/,
                    replace(str) {
                        return str + ",$self.addButtons()";
                    }
                }
            ]
        }
    ],

    start() {
        console.log("Well hello there!, CustomAppIcons has started :)");
        const appIcons = JSON.parse(localStorage.getItem("vc_app_icons") ?? "[]");
        for (const icon of appIcons) {
            AppIconData.UZ.push(icon);
            AppIconData.QA[icon.id] = icon;
        }
    },
    stop() {

    },
    addButtons() {

        return (
            <>
                <Button color={Button.Colors.BRAND} size={Button.Sizes.MEDIUM} onClick={() => {
                    openModal(props => <AppIconModal {...props as any} />);
                }}>
                    {t("Add Custom App Icon")}</Button>
                <Button color={Button.Colors.RED} size={Button.Sizes.MEDIUM} onClick={removeAppIcon}>
                    {t("Remove Custom selected App Icon")}</Button>
            </>
        );
    },

    settingsAboutComponent: () => {
        return (
            <>
                <Forms.FormTitle>
                    <Forms.FormTitle>{t("How to use?")}</Forms.FormTitle>
                </Forms.FormTitle>
                <Forms.FormText>
                    <Forms.FormText>{t("Go to")}{" "}<Link href="/settings/appearance" onClick={e => { e.preventDefault(); closeAllModals(); FluxDispatcher.dispatch({ type: "USER_SETTINGS_MODAL_SET_SECTION", section: "Appearance" }); }}>{t("Appearance Settings")}</Link> tab.</Forms.FormText>
                    <Forms.FormText>{t("Scroll down to \"In-app Icons\" and click on \"Preview App Icon\".")}</Forms.FormText>
                    <Forms.FormText>{t("And upload your own custom icon!")}</Forms.FormText>
                    <Forms.FormText>{t("You can only use links when you are uploading your Custom Icon.")}</Forms.FormText>
                </Forms.FormText>
            </>
        );
    }
});
