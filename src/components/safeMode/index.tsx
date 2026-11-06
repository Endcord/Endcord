/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css?screen";

import { showNotice } from "@api/Notices";
import { bootState, getPluginsChangedSinceGoodStart } from "@api/SafeMode";
import { Settings } from "@api/Settings";
import { EndcordModal } from "@components/EndcordModal";
import { PluginPickList } from "@components/settings/PluginPickList";
import { RenderModalProps } from "@endcord/discord-types";
import { classNameFactory } from "@utils/css";
import { t, useI18n } from "@utils/i18n";
import { relaunch } from "@utils/native";
import { openModal, useState } from "@webpack/common";

import Plugins from "~plugins";

const cl = classNameFactory("ec-safe-");

function SafeModeModal({ onClose, transitionState }: RenderModalProps) {
    const { t } = useI18n();

    // What the crash went through names the plugin best. Failing that, whatever was turned on since the last good start
    const fromCrash = bootState.suspects.filter(name => name in Plugins && Settings.plugins[name]?.enabled);
    const candidates = fromCrash.length ? fromCrash : getPluginsChangedSinceGoodStart().filter(name => name in Plugins);
    const [keepOn, setKeepOn] = useState(() => new Set<string>());

    const restart = () => {
        for (const name of candidates) Settings.plugins[name].enabled = keepOn.has(name);
        relaunch();
    };

    const offCount = candidates.length - keepOn.size;

    return (
        <EndcordModal
            transitionState={transitionState}
            onClose={onClose}
            size="md"
            title={t("Endcord started in safe mode")}
            subtitle={bootState.reason === "manual"
                ? t("As you asked, Endcord started with its plugins, themes and Custom CSS off. Nothing was changed: everything comes back when you restart.")
                : t("Discord didn't finish starting {count} times in a row, so this time Endcord started with its plugins, themes and Custom CSS off. Nothing was changed.", { count: bootState.failedStarts })}
            actions={bootState.reason === "manual" || !candidates.length
                ? [
                    { text: t("Stay in safe mode"), variant: "secondary", onClick: onClose },
                    { text: t("Restart normally"), variant: "primary", onClick: relaunch }
                ]
                : [
                    { text: t("Stay in safe mode"), variant: "secondary", onClick: onClose },
                    { text: offCount ? t("Turn off {count} and restart", { count: offCount }) : t("Restart normally"), variant: "primary", onClick: restart }
                ]}
        >
            {bootState.reason === "crashes" && (candidates.length
                ? (
                    <section className={cl("section")}>
                        <h3 className={cl("heading")}>
                            {fromCrash.length ? t("These plugins changed the part of Discord that crashed") : t("These plugins were turned on since Discord last started fine")}
                        </h3>
                        <p className={cl("hint")}>{t("They're set to stay off. Switch back on any you're sure about.")}</p>
                        <PluginPickList
                            names={candidates}
                            isOn={name => keepOn.has(name)}
                            onChange={(name, on) => setKeepOn(prev => {
                                const next = new Set(prev);
                                on ? next.add(name) : next.delete(name);
                                return next;
                            })}
                        />
                    </section>
                )
                : (
                    <p className={cl("hint")}>
                        {t("Endcord couldn't tell which plugin it was. Turn off the ones you added most recently in the Plugins tab, then restart.")}
                    </p>
                )
            )}
        </EndcordModal>
    );
}

/** Says what happened and offers the way out. Runs once Discord's screen is up */
export function showSafeModeScreen() {
    showNotice(t("Safe mode: Endcord's plugins, themes and Custom CSS are off until you restart."), t("Restart normally"), relaunch);
    openModal(props => <SafeModeModal {...props} />);
}
