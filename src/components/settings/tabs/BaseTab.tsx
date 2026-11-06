/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { enableScreenStyles } from "@api/Styles";
import { useIdlePanda } from "@components/delight";
import { EndcordModal } from "@components/EndcordModal";
import ErrorBoundary from "@components/ErrorBoundary";
import { handleComponentFailed } from "@components/handleComponentFailed";
import { ENDCORD_THEME } from "@utils/css";
import { t } from "@utils/i18n";
import { onlyOnce } from "@utils/onlyOnce";
import { openModal } from "@webpack/common";
import type { ComponentType, PropsWithChildren } from "react";

export function SettingsTab({ children }: PropsWithChildren) {
    enableScreenStyles();
    useIdlePanda();

    return (
        <section className={`vc-settings-tab ${ENDCORD_THEME}`}>{children}</section>
    );
}

export const handleSettingsTabError = onlyOnce(handleComponentFailed);

export function wrapTab(component: ComponentType<any>, tab: string) {
    const wrapped = ErrorBoundary.wrap(component, {
        displayName: `${tab}SettingsTab`,
        message: t("The {tab} tab tripped over itself (｡•́︿•̀｡) If it keeps happening, reinstalling Endcord with the installer fixes it.", { tab }),
        onError: handleSettingsTabError,
    });

    return wrapped;
}

/** Opens a settings tab on its own, wherever Discord is. onClosed runs once it's closed */
export function openSettingsTabModal(Tab: ComponentType<any>, onClosed?: () => void) {
    // Tabs are usually wrapped already; wrapping again would stack "SettingsTab" onto the name
    const name = (Tab.displayName || "Settings").replace(/(SettingsTab)+$/, "");
    if (!Tab.displayName?.endsWith("SettingsTab")) Tab = wrapTab(Tab, name);

    try {
        openModal(props => (
            <EndcordModal
                {...props}
                size="lg"
                title={t(name)}
            >
                <Tab />
            </EndcordModal>
        ), { onCloseCallback: onClosed });
    } catch {
        handleSettingsTabError();
    }
}
