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
import { relaunch } from "@utils/native";
import { Plugin } from "@utils/types";
import { openModal, React, showToast, Toasts, useRef, useState } from "@webpack/common";

import { cl, holdInPlace, logger } from ".";
import { hasSettingsToShow, realPlugin } from "./listItems";
import { openPluginModal } from "./PluginModal";
import type { SettingEntry } from "./settingsIndex";

interface PluginCardProps extends React.HTMLProps<HTMLDivElement> {
    plugin: Plugin;
    disabled: boolean;
    onRestartNeeded(name: string, key: string): void;
    isNew?: boolean;
    isPopular?: boolean;
    /** Settings of this plugin that match the search; each one links straight to the setting */
    matchedSettings?: SettingEntry[];
}

/** Switch slide duration, from the shared motion setting */
function slideTime() {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--ec-motion-base");
    return document.querySelector(".reduce-motion") ? 0 : parseFloat(value) || 0;
}

// Memoised and subscribed to its own plugin only; before, toggling one plugin re-rendered all ~500 cards.
// React isn't available yet when this file loads, so React.memo runs on the first render
let MemoisedCard: React.ComponentType<PluginCardProps> | undefined;
export function PluginCard(props: PluginCardProps) {
    MemoisedCard ??= React.memo(Card);
    return <MemoisedCard {...props} />;
}

function Card({ plugin, disabled, onRestartNeeded, onMouseEnter, onMouseLeave, isNew, isPopular, matchedSettings }: PluginCardProps) {
    const { t, tPluginDesc } = useI18n();
    useSettings([`plugins.${plugin.name}.enabled` as any]);
    const settings = Settings.plugins[plugin.name];
    // Optimistic switch state while it animates, before the plugin is actually toggled
    const [sliding, setSliding] = useState<boolean | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    // Nothing runs in safe mode, so the switch shows and changes what the next normal start does
    const isEnabled = () => IS_SAFE_MODE ? !!settings.enabled : isPluginEnabled(plugin.name);

    function turnOff(name: string) {
        const other = plugins[name];
        // Plugins with patches need a restart, the rest can stop right away
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

    // Loading a plugin's code throws with needsRestart when Endcord's files were replaced since Discord started (see
    // pluginChunkRuntime.js), and only a restart brings the plugin back. The switch used to just slide back
    function explain(e: unknown): never {
        if ((e as { needsRestart?: boolean; } | null)?.needsRestart) showNotice(t("Endcord was updated. Restart Discord to load {name}.", { name: plugin.name }), t("Restart now"), relaunch);
        throw e;
    }

    function openSettings(setting?: string) {
        try {
            openPluginModal(realPlugin(plugin), onRestartNeeded, setting);
        } catch (e) {
            explain(e);
        }
    }

    // Let the switch animation finish first. Loading and starting the plugin inside the click handler made it stutter
    // or skip
    function onSwitch() {
        if (sliding !== null) return;
        setSliding(!isEnabled());
        setTimeout(() => {
            try {
                holdInPlace(cardRef.current);
                toggleEnabled();
            } catch (e) {
                explain(e);
            } finally {
                setSliding(null);
            }
        }, slideTime());
    }

    function applyToggle() {
        // The list item may only be metadata (see ./listItems), so load the plugin first
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

        // Already started or stopped, no restart needed
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
            cardRef={cardRef}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            footer={!!matchedSettings?.length && (
                <div className={cl("setting-hits")}>
                    {matchedSettings.slice(0, 3).map(({ key, title }) => (
                        <button key={key} className={cl("setting-hit")} onClick={() => openSettings(key)}>
                            {title}
                        </button>
                    ))}
                    {matchedSettings.length > 3 && <span className={cl("setting-more")}>+{matchedSettings.length - 3}</span>}
                </div>
            )}
            infoButton={
                <button
                    role="switch"
                    onClick={() => openSettings()}
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
