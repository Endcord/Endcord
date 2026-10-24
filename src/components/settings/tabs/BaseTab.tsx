/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { handleComponentFailed } from "@components/handleComponentFailed";
import { t } from "@utils/i18n";
import { onlyOnce } from "@utils/onlyOnce";
import { Modal, openModal } from "@webpack/common";
import type { ComponentType, PropsWithChildren } from "react";

export function SettingsTab({ children }: PropsWithChildren) {
    return (
        <section className="vc-settings-tab">{children}</section>
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

export function openSettingsTabModal(Tab: ComponentType<any>) {
    // Tabs are usually wrapped already; wrapping again would stack "SettingsTab" onto the name
    const name = (Tab.displayName || "Settings").replace(/(SettingsTab)+$/, "");
    if (!Tab.displayName?.endsWith("SettingsTab")) Tab = wrapTab(Tab, name);

    try {
        openModal(props => (
            <Modal
                {...props}
                size="lg"
                title={t(name)}
            >
                <Tab />
            </Modal>
        ));
    } catch {
        handleSettingsTabError();
    }
}
