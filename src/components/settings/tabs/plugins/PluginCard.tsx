/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotice } from "@api/Notices";
import { getEnabledConflicts } from "@api/PluginConflicts";
import { getPatchProblemCount } from "@api/PluginHealth";
import { isPluginEnabled, pluginRequiresRestart, plugins, startDependenciesRecursive, startPlugin, stopPlugin } from "@api/PluginManager";
import { IS_SAFE_MODE } from "@api/SafeMode";
import { Settings, useSettings } from "@api/Settings";
import { EndcordModal } from "@components/EndcordModal";
import { CogWheel, InfoIcon } from "@components/Icons";
import { AddonCard } from "@components/settings/AddonCard";
import { BAN_RISK } from "@utils/banRisk";
import { useI18n } from "@utils/i18n";
import { Plugin } from "@utils/types";
import { openModal, React, showToast, Toasts, useState } from "@webpack/common";

import { cl, logger } from ".";
import { hasSettingsToShow, realPlugin } from "./listItems";
import { openPluginModal } from "./PluginModal";
import type { SettingEntry } from "./settingsIndex";

interface PluginCardProps extends React.HTMLProps<HTMLDivElement> {
    plugin: Plugin;
    disabled: boolean;
    onRestartNeeded(name: string, key: string): void;
    isNew?: boolean;
    isPopular?: boolean;
    /** Settings of this plugin that match the search, each a way straight to it */
    matchedSettings?: SettingEntry[];
}

/** How long the switch takes to slide, from the motion setting Endcord's screens share */
function slideTime() {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--ec-motion-base");
    return document.querySelector(".reduce-motion") ? 0 : parseFloat(value) || 0;
}

// Memoised, and listening to its own plugin only: turning one plugin on otherwise drew all five hundred cards again.
// React isn't there yet when this file loads, so the memoised card is made the first time a card is drawn
let MemoisedCard: React.ComponentType<PluginCardProps> | undefined;
export function PluginCard(props: PluginCardProps) {
    MemoisedCard ??= React.memo(Card);
    return <MemoisedCard {...props} />;
}

function Card({ plugin, disabled, onRestartNeeded, onMouseEnter, onMouseLeave, isNew, isPopular, matchedSettings }: PluginCardProps) {
    const { t, tPluginDesc } = useI18n();
    useSettings([`plugins.${plugin.name}.enabled` as any]);
    const settings = Settings.plugins[plugin.name];
    // What the switch shows while it slides, before the plugin has actually been turned on or off
    const [sliding, setSliding] = useState<boolean | null>(null);

    // Nothing runs in safe mode, so the switch shows and changes what the next normal start does
    const isEnabled = () => IS_SAFE_MODE ? !!settings.enabled : isPluginEnabled(plugin.name);

    function turnOff(name: string) {
        const other = plugins[name];
        // One that stops on the spot needs no restart; one whose patches are in Discord's code does
        const needsRestart = pluginRequiresRestart(other) || (other.started && !stopPlugin(other));
        Settings.plugins[name].enabled = false;
        if (needsRestart) onRestartNeeded(name, "enabled");
    }

    function toggleEnabled() {
        if (IS_SAFE_MODE) {
            settings.enabled = !settings.enabled;
            onRestartNeeded(plugin.name, "enabled");
            return;
        }

        const conflicts = isEnabled() ? [] : getEnabledConflicts(plugin.name);
        if (!conflicts.length) return applyToggle();

        // Discord's Alerts no longer show a third button, so this uses a modal with its own actions
        const vars = { name: plugin.name, others: conflicts.join(", ") };
        openModal(props => (
            <EndcordModal
                {...props}
                size="sm"
                title={t("{name} and {others} don't mix", vars)}
                subtitle={t("They change the same part of Discord, so one of them would stop working. Turn off {others} and use {name} instead?", vars)}
                actions={[
                    { text: t("Cancel"), variant: "secondary", onClick: props.onClose },
                    {
                        text: t("Keep both on"),
                        variant: "secondary",
                        onClick() {
                            props.onClose();
                            applyToggle();
                        }
                    },
                    {
                        text: t("Use {name}", vars),
                        variant: "primary",
                        onClick() {
                            props.onClose();
                            conflicts.forEach(turnOff);
                            applyToggle();
                        }
                    }
                ]}
            />
        ));
    }

    // The switch slides first. Loading a plugin's code and starting it can take a moment, and doing that on the click
    // froze the slide halfway or skipped it, so the work waits until the switch is there
    function onSwitch() {
        if (sliding !== null) return;
        setSliding(!isEnabled());
        setTimeout(() => {
            try {
                toggleEnabled();
            } finally {
                setSliding(null);
            }
        }, slideTime());
    }

    function applyToggle() {
        // The list may show the plugin without its code loaded (see ./listItems); acting on it loads it
        const target = realPlugin(plugin);
        const wasEnabled = isEnabled();

        // If we're enabling a plugin, make sure all deps are enabled recursively.
        if (!wasEnabled) {
            const { restartNeeded, failures } = startDependenciesRecursive(target);

            if (failures.length) {
                logger.error(`Failed to start dependencies for ${plugin.name}: ${failures.join(", ")}`);
                showNotice(t("Some helpers this plugin needs couldn't start :( {list}", { list: failures.join(", ") }), t("Close"), () => null);
                return;
            }

            if (restartNeeded) {
                // If any dependencies have patches, don't start the plugin yet.
                settings.enabled = true;
                onRestartNeeded(plugin.name, "enabled");
                return;
            }
        }

        // if the plugin requires a restart, don't use stopPlugin/startPlugin. Wait for restart to apply changes.
        if (pluginRequiresRestart(target)) {
            settings.enabled = !wasEnabled;
            onRestartNeeded(plugin.name, "enabled");
            return;
        }

        // If the plugin is enabled, but hasn't been started, then we can just toggle it off.
        if (wasEnabled && !target.started) {
            settings.enabled = !wasEnabled;
            onRestartNeeded(plugin.name, "enabled");
            return;
        }

        const result = wasEnabled ? stopPlugin(target) : startPlugin(target);

        if (!result) {
            settings.enabled = false;

            const msg = t(wasEnabled ? "{name} didn't want to stop :( Restart Discord and it'll be off." : "{name} couldn't start this time :( Try turning it on again, or restart Discord.", { name: plugin.name });
            showToast(msg, Toasts.Type.FAILURE, {
                position: Toasts.Position.BOTTOM,
            });

            return;
        }

        // Started or stopped on the spot, so there's nothing for a restart to do
        settings.enabled = !wasEnabled;
    }

    return (
        <AddonCard
            name={plugin.name}
            description={tPluginDesc(plugin.name, plugin.description)}
            isNew={isNew}
            isPopular={isPopular}
            banRisk={BAN_RISK[plugin.name]}
            needsFix={!IS_SAFE_MODE && isEnabled() && getPatchProblemCount(plugin.name) > 0}
            enabled={sliding ?? isEnabled()}
            setEnabled={onSwitch}
            disabled={disabled}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            footer={!!matchedSettings?.length && (
                <div className={cl("setting-hits")}>
                    {matchedSettings.slice(0, 3).map(({ key, title }) => (
                        <button key={key} className={cl("setting-hit")} onClick={() => openPluginModal(realPlugin(plugin), onRestartNeeded, key)}>
                            {title}
                        </button>
                    ))}
                    {matchedSettings.length > 3 && <span className={cl("setting-more")}>+{matchedSettings.length - 3}</span>}
                </div>
            )}
            infoButton={
                <button
                    role="switch"
                    onClick={() => openPluginModal(realPlugin(plugin), onRestartNeeded)}
                    className={cl("info-button")}
                >
                    {hasSettingsToShow(plugin)
                        ? <CogWheel className={cl("info-icon")} />
                        : <InfoIcon className={cl("info-icon")} />
                    }
                </button>
            } />
    );
}
