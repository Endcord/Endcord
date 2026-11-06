/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getBrokenPlugins } from "@api/PluginHealth";
import { isPluginEnabled, plugins, setPluginEnabled } from "@api/PluginManager";
import { isProfileActive } from "@api/PluginProfiles";
import { useSettings } from "@api/Settings";
import { boop, peek, tapVersion } from "@components/delight";
import { EndcordMark, EndcordWordmark, LogoSparks } from "@components/EndcordIcons";
import { ChevronSmallDownIcon, CogWheel, ColorPaletteIcon, GameControllerIcon, LogsIcon, PluginsIcon, ScreenshareIcon, StarOutlined } from "@components/Icons";
import { openSwitchProfileModal, promptRestart } from "@components/settings/tabs/plugins/Profiles";
import { Switch } from "@components/Switch";
import { openWhatsNewModal } from "@components/whatsNew";
import { saveDesign, settings as studioSettings } from "@plugins/themeStudio";
import { isSameDesign, PRESETS } from "@plugins/themeStudio/design";
import { LookPreview } from "@plugins/themeStudio/LookPreview";
import { classNameFactory, ENDCORD_THEME } from "@utils/css";
import { useI18n } from "@utils/i18n";
import { classes } from "@utils/misc";
import type { IconProps } from "@utils/types";
import { SettingsRouter, useEffect, useMemo, useRef, useState } from "@webpack/common";
import type { ComponentType, MouseEvent, ReactNode } from "react";

const cl = classNameFactory("ec-control-");

const MEMORY_REFRESH = 3_000;
const AWAKE_TIME = 2_400;
// Below this a cleanup is routine. The panda only gets excited about a proper meal
const GOOD_CLEANUP = 50;
const NIGHT_ENDS_AT = 5;

/** One line with a switch. The whole line is the switch's label, so it can be clicked anywhere */
// Discord's own icons, so the panel reads as part of the app. Discord has none for pixels, so this one is drawn the same way
function PixelGridIcon({ className }: IconProps) {
    return (
        <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 5a2 2 0 0 1 2-2h4v6H3V5Zm6 4h6v6H9V9Zm6-6h4a2 2 0 0 1 2 2v4h-6V3Zm0 12h6v4a2 2 0 0 1-2 2h-4v-6ZM3 15h6v6H5a2 2 0 0 1-2-2v-4Z" />
        </svg>
    );
}

const ChevronRight = ({ className }: IconProps) => <ChevronSmallDownIcon className={classes(className, "ec-control-chevron")} width={16} height={16} />;

function SwitchRow({ Icon, label, on, onChange }: { Icon: ComponentType<IconProps>; label: string; on: boolean; onChange(on: boolean): void; }) {
    return (
        <label className={cl("switch-row", { on })}>
            <span className={cl("row-tile")}><Icon className={cl("tile-icon")} /></span>
            <span className={cl("row-label")}>{label}</span>
            <Switch checked={on} onChange={onChange} />
        </label>
    );
}

function NavRow({ Icon, label, detail, onClick }: { Icon: ComponentType<IconProps>; label: string; detail?: ReactNode; onClick(): void; }) {
    return (
        <button className={cl("row")} onClick={onClick}>
            <Icon className={cl("row-icon")} />
            <span className={cl("row-label")}>{label}</span>
            {detail && <span className={cl("row-detail")}>{detail}</span>}
            <ChevronRight className={cl("row-chevron")} />
        </button>
    );
}

function Brand({ onSettings }: { onSettings(): void; }) {
    const { t } = useI18n();
    const [awake, setAwake] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    return (
        <header className={cl("header")}>
            <LogoSparks className={cl("sparks")} />
            <button
                className={cl("boop")}
                aria-label={t("Boop the panda")}
                onClick={() => {
                    setAwake(true);
                    boop();
                    clearTimeout(timer.current);
                    timer.current = setTimeout(() => setAwake(false), AWAKE_TIME);
                }}
            >
                <span className="ec-mark-tile"><EndcordMark asleep={!awake} /></span>
                {!awake && <span className={cl("snore")} />}
            </button>
            <div className={cl("heading")}>
                <EndcordWordmark />
                <button className={cl("version")} onClick={tapVersion}>{VERSION}</button>
            </div>
            <button className={cl("icon-button")} aria-label={t("Endcord Settings")} title={t("Endcord Settings")} onClick={onSettings}>
                <CogWheel width={20} height={20} />
            </button>
        </header>
    );
}

function Memory() {
    const { t } = useI18n();
    const [usedMb, setUsedMb] = useState<number>();
    const [freed, setFreed] = useState<number>();
    const [freeing, setFreeing] = useState(false);

    const refresh = () => EndcordNative.native.getMemoryStats().then(stats => setUsedMb(stats.usedMb));

    useEffect(() => {
        refresh();

        const interval = setInterval(refresh, MEMORY_REFRESH);
        return () => clearInterval(interval);
    }, []);

    async function free() {
        setFreeing(true);
        const size = await EndcordNative.native.trimMemory();
        setFreed(size);
        await refresh();
        setFreeing(false);

        if (size >= GOOD_CLEANUP) peek(t("*munches {size} MB of bamboo*", { size }));
    }

    return (
        <div className={cl("memory")}>
            <span className={cl("row-label")}>{t("Memory")}</span>
            {freed !== undefined && !freeing && (
                <span className={cl("memory-result")}>{freed > 0 ? `−${freed} MB` : t("Nothing to free")}</span>
            )}
            <span className={cl("memory-value")}>
                {usedMb === undefined ? "–" : usedMb.toLocaleString()} MB
            </span>
            <button className={cl("text-button")} disabled={freeing} onClick={free}>
                {freeing ? t("Freeing...") : t("Free up")}
            </button>
        </div>
    );
}

function Looks({ onCustomize }: { onCustomize(): void; }) {
    const { t } = useI18n();
    const { design } = studioSettings.use(["design"]);

    return (
        <section className={cl("section")}>
            <div className={cl("section-head")}>
                <span className={cl("label")}>{t("Look")}</span>
                <button className={cl("text-button")} onClick={onCustomize}>{t("Customize")}</button>
            </div>
            <div className={cl("looks")}>
                {PRESETS.map(({ name, design: preset }) => (
                    <button
                        key={name}
                        className={cl("look", { selected: isSameDesign(preset, design) })}
                        aria-label={t(name)}
                        title={t(name)}
                        onClick={() => saveDesign(preset)}
                    >
                        <LookPreview design={preset} />
                    </button>
                ))}
            </div>
        </section>
    );
}

function Profiles({ onClose }: { onClose(): void; }) {
    const { t } = useI18n();
    const { pluginProfiles } = useSettings(["pluginProfiles", "plugins.*"]);
    if (!pluginProfiles.length) return null;

    return (
        <section className={cl("section")}>
            <div className={cl("section-head")}>
                <span className={cl("label")}>{t("Profile")}</span>
            </div>
            <div className={cl("profiles")}>
                {pluginProfiles.map(profile => {
                    const on = isProfileActive(profile);
                    return (
                        <button
                            key={profile.id}
                            className={cl("profile", { "profile-on": on })}
                            aria-pressed={on}
                            disabled={on}
                            onClick={() => {
                                onClose();
                                openSwitchProfileModal(profile, promptRestart);
                            }}
                        >
                            {profile.name}
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

interface ControlCenterProps {
    onClose(): void;
    onMoreActions(event: MouseEvent): void;
    availableUpdate?: string;
    onUpdate(): void;
}

export function ControlCenter({ onClose, onMoreActions, availableUpdate, onUpdate }: ControlCenterProps) {
    const { t } = useI18n();
    const [gameMode, setGameMode] = useState(() => isPluginEnabled("GameMode"));
    const [shield, setShield] = useState(() => isPluginEnabled("StreamerShield"));
    const settings = useSettings(["enabledThemes", "themeLinks", "pixelStyle"]);

    // By name, so counting doesn't load every plugin that's off
    const enabledPlugins = useMemo(() => Object.keys(plugins).filter(isPluginEnabled).length, []);
    const brokenPlugins = useMemo(() => getBrokenPlugins().length, []);
    const activeThemes = settings.enabledThemes.length + settings.themeLinks.length;
    const isNight = new Date().getHours() < NIGHT_ENDS_AT;

    const openSettings = (panel: string) => {
        onClose();
        SettingsRouter.openUserSettings(panel);
    };

    return (
        <div className={classes(cl("root"), ENDCORD_THEME)} role="dialog" aria-label={t("Endcord Control Center")}>
            <div className={cl("panel")}>
                <div className={cl("content")}>
                    <Brand onSettings={() => openSettings("endcord_main_panel")} />

                    {availableUpdate && (
                        <button className={cl("update")} onClick={onUpdate}>
                            <span>{t("Endcord {version} is available", { version: availableUpdate })}</span>
                            <ChevronRight />
                        </button>
                    )}

                    <div className={cl("group")}>
                        {IS_DISCORD_DESKTOP && (
                            <SwitchRow
                                Icon={GameControllerIcon}
                                label={t("Game Mode")}
                                on={gameMode}
                                onChange={on => {
                                    setPluginEnabled("GameMode", on);
                                    setGameMode(on);
                                }}
                            />
                        )}
                        <SwitchRow
                            Icon={ScreenshareIcon}
                            label={t("Streamer Shield")}
                            on={shield}
                            onChange={on => {
                                setPluginEnabled("StreamerShield", on);
                                setShield(on);
                            }}
                        />
                        <SwitchRow
                            Icon={PixelGridIcon}
                            label={t("Pixel style")}
                            on={settings.pixelStyle}
                            onChange={on => {
                                settings.pixelStyle = on;
                            }}
                        />
                    </div>

                    <Profiles onClose={onClose} />

                    <Looks onCustomize={() => openSettings("endcord_theme_studio_panel")} />

                    {IS_DISCORD_DESKTOP && <Memory />}

                    <nav className={cl("group")}>
                        <NavRow Icon={PluginsIcon} label={t("Plugins")} detail={t("{count} on", { count: enabledPlugins })} onClick={() => openSettings("endcord_plugins_panel")} />
                        <NavRow Icon={ColorPaletteIcon} label={t("Themes")} detail={activeThemes > 0 ? t("{count} on", { count: activeThemes }) : undefined} onClick={() => openSettings("endcord_themes_panel")} />
                        <NavRow
                            Icon={LogsIcon}
                            label={t("Diagnostics")}
                            detail={brokenPlugins > 0 && <span className={cl("row-warning")}>{t("{count} need a fix", { count: brokenPlugins })}</span>}
                            onClick={() => openSettings("endcord_diagnostics_panel")}
                        />
                        <NavRow
                            Icon={StarOutlined}
                            label={t("What's New")}
                            onClick={() => {
                                onClose();
                                openWhatsNewModal();
                            }}
                        />
                    </nav>
                </div>

                <footer className={cl("footer")}>
                    <button className={cl("text-button")} onClick={onMoreActions}>{t("More actions")}</button>
                    {isNight && <span className={cl("night")}>{t("Up late? So is the panda. 💤")}</span>}
                </footer>
            </div>
        </div>
    );
}
