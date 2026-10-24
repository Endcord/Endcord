/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Settings, useSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import { Link } from "@components/Link";
import { Notice } from "@components/Notice";
import { PluginDependencyList } from "@components/settings/tabs/plugins";
import { PluginCard } from "@components/settings/tabs/plugins/PluginCard";
import { ChangeList } from "@utils/ChangeList";
import { classNameFactory } from "@utils/css";
import { t } from "@utils/i18n";
import { useForceUpdater } from "@utils/react";
import { RenderModalProps } from "@vencord/discord-types";
import { closeModal, Modal, openModal, Tooltip, useMemo } from "@webpack/common";
import { ReactNode } from "react";

import Plugins, { isPluginLoaded } from "~plugins";

import { getNewPlugins, getNewSettings, KnownPluginSettingsMap, writeKnownSettings } from "./knownSettings";

const cl = classNameFactory("vc-new-plugins-");

let hasSeen = false;

interface ModalComponentProps {
    modalProps: RenderModalProps;
    newPlugins: Set<string>;
    newSettings: KnownPluginSettingsMap;
}

function NewPluginsModal({ modalProps, newPlugins, newSettings }: ModalComponentProps) {
    const settings = useSettings();
    const changes = useMemo(() => new ChangeList<string>(), []);
    const forceUpdate = useForceUpdater();

    const depMap = useMemo(() => {
        const o = {} as Record<string, string[]>;
        for (const plugin in Plugins) {
            // Reading an unloaded lazy plugin would evaluate it; only loaded (enabled) ones can matter here
            if (!isPluginLoaded(plugin)) continue;
            const deps = Plugins[plugin].dependencies;
            if (deps) {
                for (const dep of deps) {
                    o[dep] ??= [];
                    o[dep].push(plugin);
                }
            }
        }
        return o;
    }, []);

    const sortedPlugins = useMemo(() => {
        const mapPlugins = (array: string[]) => array.map(pn => Plugins[pn]).sort((a, b) => a.name.localeCompare(b.name));
        return [
            ...mapPlugins([...newPlugins]),
            ...mapPlugins([...newSettings.keys()].filter(p => !newPlugins.has(p)))
        ];
    }, []);

    const onRestartNeeded = (name: string) => {
        changes.handleChange(name);
        forceUpdate();
    };

    const pluginCards: ReactNode[] = [];
    const requiredPluginCards: ReactNode[] = [];

    for (const p of sortedPlugins) {
        if (p.hidden) continue;

        const isRequired = p.required || depMap[p.name]?.some(d => settings.plugins[d].enabled);

        if (isRequired) {
            const tooltipText = p.required
                ? t("This plugin is required for Endcord to work.")
                : <PluginDependencyList deps={depMap[p.name]?.filter(d => settings.plugins[d].enabled)} />;

            requiredPluginCards.push(
                <Tooltip text={tooltipText} key={p.name}>
                    {({ onMouseLeave, onMouseEnter }) => (
                        <PluginCard
                            onMouseLeave={onMouseLeave}
                            onMouseEnter={onMouseEnter}
                            onRestartNeeded={onRestartNeeded}
                            disabled={true}
                            plugin={p}
                            isNew={newPlugins.has(p.name)}
                        />
                    )}
                </Tooltip>
            );
        } else {
            pluginCards.push(
                <PluginCard
                    onRestartNeeded={onRestartNeeded}
                    disabled={false}
                    plugin={p}
                    key={p.name}
                    isNew={newPlugins.has(p.name)}
                />
            );
        }
    }

    const totalCount = pluginCards.length + requiredPluginCards.length;

    const handleContinue = async () => {
        await writeKnownSettings();
        if (changes.hasChanges) {
            location.reload();
        } else {
            modalProps.onClose();
        }
    };

    return (
        <Modal
            {...modalProps}
            size="md"
            title={
                <div className={cl("header-content")}>
                    <BaseText size="lg" weight="semibold" className={cl("title")}>
                        {t("New plugins and settings ({count})", { count: totalCount })}
                    </BaseText>
                </div>
            }
            subtitle={
                <>
                    <BaseText size="sm" className={cl("description")}>
                        {t("These plugins and settings were added since your last visit. Turn on the ones you want, or continue to close this.")}
                    </BaseText>
                    <br />
                    <Notice.Info className={cl("notice")}>
                        {t("Endcord is free and open source.")} <Link href="https://github.com/rootpoii/Endcord" target="_blank" rel="noopener noreferrer">{t("Support Endcord on GitHub")}</Link>
                    </Notice.Info>
                </>
            }
            actions={[
                {
                    text: t("Don't show this again"),
                    onClick: () => {
                        Settings.plugins.NewPluginsManager.enabled = !settings?.plugins?.NewPluginsManager?.enabled;
                    },
                    variant: "secondary"
                },
                {
                    text: changes.hasChanges ? t("Restart") : t("Continue"),
                    onClick: handleContinue,
                    variant: "primary"
                }
            ]}
        >
            <div className={cl("grid")}>
                {pluginCards}
                {requiredPluginCards}
            </div>
        </Modal >
    );
}

export async function openNewPluginsModal() {
    const newPlugins = await getNewPlugins();
    const newSettings = await getNewSettings();
    // Nothing to show: still record the settings of plugins loaded since last time, as their baseline
    if (!newPlugins.size && !newSettings.size) return writeKnownSettings();
    if (!hasSeen) {
        hasSeen = true;
        const modalKey = openModal(modalProps => (
            <ErrorBoundary noop onError={() => closeModal(modalKey)}>
                <NewPluginsModal
                    modalProps={modalProps}
                    newPlugins={newPlugins}
                    newSettings={newSettings}
                />
            </ErrorBoundary>
        ));
    }
}
