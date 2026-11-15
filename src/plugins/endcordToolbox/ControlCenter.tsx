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
import type { ComponentType, MouseEvent, PointerEvent, ReactNode } from "react";

const cl = classNameFactory("ec-control-");

const MEMORY_REFRESH = 3_000;
const AWAKE_TIME = 2_400;
// Below this, freeing memory is routine; the panda only reacts to bigger cleanups
const GOOD_CLEANUP = 50;
const NIGHT_ENDS_AT = 5;
const COUNT_TIME = 700;

const lessMotion = () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animated counter. Starts from 0 on the first render */
function useCountTo(target: number): number;
function useCountTo(target: number | undefined): number | undefined;
function useCountTo(target: number | undefined) {
    const [shown, setShown] = useState(() => lessMotion() ? target : 0);
    const from = useRef(0);

    useEffect(() => {
        if (target === undefined) return;
        if (lessMotion() || from.current === target) {
            from.current = target;
            setShown(target);
            return;
        }

        const start = from.current;
        const began = performance.now();
        let frame = requestAnimationFrame(function step(now) {
            const done = Math.min(1, (now - began) / COUNT_TIME);
            from.current = Math.round(start + (target - start) * (1 - (1 - done) ** 3));
            setShown(from.current);
            if (done < 1) frame = requestAnimationFrame(step);
        });

        return () => cancelAnimationFrame(frame);
    }, [target]);

    return target === undefined ? undefined : shown;
}

/**
 * List with a single hover highlight that slides to the row under the pointer. Coming in from outside it appears
 * at the pointer; leaving, it fades out in place
 */
function GlideGroup({ nav, children }: { nav?: boolean; children: ReactNode; }) {
    const glide = useRef<HTMLSpanElement>(null);
    const Tag = nav ? "nav" : "div";

    function follow(event: PointerEvent<HTMLElement>) {
        const row = (event.target as Element).closest<HTMLElement>(`.${cl("row")}, .${cl("switch-row")}`);
        const light = glide.current;
        if (!row || !light) return;

        const shown = light.classList.contains(cl("glide-shown"));
        if (!shown) light.style.transition = "none";
        light.style.transform = `translateY(${row.offsetTop}px)`;
        light.style.height = `${row.offsetHeight}px`;

        if (!shown) {
            // Jump there without sliding, then fade in
            void light.offsetHeight;
            light.style.transition = "";
            light.classList.add(cl("glide-shown"));
        }
    }

    return (
        <Tag className={cl("group")} onPointerOver={follow} onPointerLeave={() => glide.current?.classList.remove(cl("glide-shown"))}>
            <span ref={glide} className={cl("glide")} aria-hidden="true" />
            {children}
        </Tag>
    );
}

/** Row with a switch. The whole row is the label, so clicking anywhere toggles it */
// Discord's own icons, so the panel fits in. Discord has no pixel icon, so that one is drawn in the same style
function PixelGridIcon({ className }: IconProps) {
    return (
        <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 5a2 2 0 0 1 2-2h4v6H3V5Zm6 4h6v6H9V9Zm6-6h4a2 2 0 0 1 2 2v4h-6V3Zm0 12h6v4a2 2 0 0 1-2 2h-4v-6ZM3 15h6v6H5a2 2 0 0 1-2-2v-4Z" />
        </svg>
    );
}

const ChevronRight = ({ className }: IconProps) => <ChevronSmallDownIcon className={classes(className, "ec-control-chevron")} width={16} height={16} />;

function SwitchRow({ Icon, label, on, onChange }: { Icon: ComponentType<IconProps>; label: string; on: boolean; onChange(on: boolean): void; }) {
    // Hop animation when switched on, but not for rows that were already on when the panel opened
    const [touched, setTouched] = useState(false);

    return (
        <label className={cl("switch-row", { on, touched })}>
            <span className={cl("row-tile")}><Icon className={cl("tile-icon")} /></span>
            <span className={cl("row-label")}>{label}</span>
            <Switch
                checked={on}
                onChange={value => {
                    setTouched(true);
                    onChange(value);
                }}
            />
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
                <CogWheel className={cl("cog")} width={20} height={20} />
            </button>
        </header>
    );
}

function Memory() {
    const { t } = useI18n();
    const [usedMb, setUsedMb] = useState<number>();
    const [freed, setFreed] = useState<number>();
    const [freeing, setFreeing] = useState(false);
    const shownMb = useCountTo(usedMb);

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
        <div className={cl("memory", { busy: freeing })}>
            <span className={cl("row-label")}>{t("Memory")}</span>
            {freed !== undefined && !freeing && (
                <span className={cl("memory-result")}>{freed > 0 ? `−${freed} MB` : t("Nothing to free")}</span>
            )}
            <span className={cl("memory-value")}>
                {shownMb === undefined ? "–" : shownMb.toLocaleString()} MB
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
    // Pop animation for a newly picked theme, not the one that was active when the panel opened
    const [picked, setPicked] = useState(false);

    return (
        <section className={cl("section")}>
            <div className={cl("section-head")}>
                <span className={cl("label")}>{t("Look")}</span>
                <button className={cl("text-button")} onClick={onCustomize}>{t("Customize")}</button>
            </div>
            <div className={cl("looks", { picked })}>
                {PRESETS.map(({ name, design: preset }) => (
                    <button
                        key={name}
                        className={cl("look", { selected: isSameDesign(preset, design) })}
                        aria-label={t(name)}
                        title={t(name)}
                        onClick={() => {
                            setPicked(true);
                            saveDesign(preset);
                        }}
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
    /** Closing animation is running; unmounts when it ends */
    closing?: boolean;
    onClose(): void;
    onMoreActions(event: MouseEvent): void;
    availableUpdate?: string;
    onUpdate(): void;
}

export function ControlCenter({ closing, onClose, onMoreActions, availableUpdate, onUpdate }: ControlCenterProps) {
    const { t } = useI18n();
    const [gameMode, setGameMode] = useState(() => isPluginEnabled("GameMode"));
    const [shield, setShield] = useState(() => isPluginEnabled("StreamerShield"));
    const settings = useSettings(["enabledThemes", "themeLinks", "pixelStyle"]);

    // Count by name, so disabled lazy plugins don't get loaded
    const enabledPlugins = useMemo(() => Object.keys(plugins).filter(isPluginEnabled).length, []);
    const brokenPlugins = useMemo(() => getBrokenPlugins().length, []);
    const activeThemes = settings.enabledThemes.length + settings.themeLinks.length;
    const shownPlugins = useCountTo(enabledPlugins);
    const shownThemes = useCountTo(activeThemes);
    const isNight = new Date().getHours() < NIGHT_ENDS_AT;

    const openSettings = (panel: string) => {
        onClose();
        SettingsRouter.openUserSettings(panel);
    };

    return (
        <div className={classes(cl("root", { closing }), ENDCORD_THEME)} role="dialog" aria-label={t("Endcord Control Center")}>
            <div className={cl("panel")}>
                <div className={cl("content")}>
                    <Brand onSettings={() => openSettings("endcord_main_panel")} />

                    {availableUpdate && (
                        <button className={cl("update")} onClick={onUpdate}>
                            <span>{t("Endcord {version} is available", { version: availableUpdate })}</span>
                            <ChevronRight />
                        </button>
                    )}

                    <GlideGroup>
                        {(IS_DISCORD_DESKTOP || IS_ENDCORD_DESKTOP) && (
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
                    </GlideGroup>

                    <Profiles onClose={onClose} />

                    <Looks onCustomize={() => openSettings("endcord_theme_studio_panel")} />

                    {IS_DISCORD_DESKTOP && <Memory />}

                    <GlideGroup nav>
                        <NavRow Icon={PluginsIcon} label={t("Plugins")} detail={t("{count} on", { count: shownPlugins })} onClick={() => openSettings("endcord_plugins_panel")} />
                        <NavRow Icon={ColorPaletteIcon} label={t("Themes")} detail={activeThemes > 0 ? t("{count} on", { count: shownThemes }) : undefined} onClick={() => openSettings("endcord_themes_panel")} />
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
                    </GlideGroup>
                </div>

                <footer className={cl("footer")}>
                    <button className={cl("text-button")} onClick={onMoreActions}>{t("More actions")}</button>
                    {isNight && <span className={cl("night")}>{t("Up late? So is the panda. 💤")}</span>}
                </footer>
            </div>
        </div>
    );
}
