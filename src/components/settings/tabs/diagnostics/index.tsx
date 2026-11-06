/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css?screen";

import { getBrokenPlugins, getPatchProblemCount } from "@api/PluginHealth";
import { isPluginEnabled, plugins, pluginStartTimes, setPluginEnabled } from "@api/PluginManager";
import { IS_SAFE_MODE, restartInSafeMode } from "@api/SafeMode";
import { Button } from "@components/Button";
import { ShieldCheckIcon } from "@components/EndcordIcons";
import { FormSwitch } from "@components/FormSwitch";
import { HeadingSecondary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import type { MemoryStats } from "@main/memoryTrim";
import { classNameFactory } from "@utils/css";
import { useI18n } from "@utils/i18n";
import { Margins } from "@utils/margins";
import { relaunch } from "@utils/native";
import { useEffect, useMemo, useState } from "@webpack/common";
import { patchTimeByPlugin } from "@webpack/patcher";

const cl = classNameFactory("ec-diagnostics-");

const MEMORY_REFRESH = 3_000;
const COLLAPSED_ROWS = 12;

const formatTime = (milliseconds: number) => milliseconds < 0.1 ? "< 0.1 ms" : `${milliseconds.toFixed(1)} ms`;

function MemorySection() {
    const { t } = useI18n();
    const [stats, setStats] = useState<MemoryStats>();
    const [freeing, setFreeing] = useState(false);
    const [lastFreed, setLastFreed] = useState<number>();

    const refresh = () => EndcordNative.native.getMemoryStats().then(setStats);

    useEffect(() => {
        refresh();

        const interval = setInterval(refresh, MEMORY_REFRESH);
        return () => clearInterval(interval);
    }, []);

    async function freeMemory() {
        setFreeing(true);
        setLastFreed(await EndcordNative.native.trimMemory());
        await refresh();
        setFreeing(false);
    }

    return (
        <section className={Margins.bottom20}>
            <HeadingSecondary>{t("Memory")}</HeadingSecondary>
            <div className={cl("tiles")}>
                <div className={cl("tile")}>
                    <span className={cl("value")}>{stats ? `${stats.usedMb} MB` : "…"}</span>
                    <span className={cl("label")}>{t("Used by Discord right now")}</span>
                </div>
                <div className={cl("tile")}>
                    <span className={cl("value")}>{stats ? `${stats.freedMb} MB` : "…"}</span>
                    <span className={cl("label")}>{t("Given back this session, measured after each cleanup")}</span>
                </div>
            </div>
            <div className={cl("action")}>
                <Button disabled={freeing} onClick={freeMemory}>{freeing ? t("Freeing memory...") : t("Free memory now")}</Button>
                {lastFreed !== undefined && !freeing && (
                    <Paragraph>{lastFreed > 0 ? t("Freed {size} MB", { size: lastFreed }) : t("Nothing to free right now")}</Paragraph>
                )}
            </div>
        </section>
    );
}

function PluginTimes() {
    const { t } = useI18n();
    const [showAll, setShowAll] = useState(false);

    const rows = useMemo(() => {
        const names = new Set([...pluginStartTimes.keys(), ...patchTimeByPlugin.keys()]);

        return [...names]
            .map(name => {
                const start = pluginStartTimes.get(name) ?? 0;
                const patches = patchTimeByPlugin.get(name) ?? 0;
                return { name, start, patches, total: start + patches };
            })
            .sort((a, b) => b.total - a.total);
    }, []);

    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const slowest = rows[0]?.total || 1;
    const visible = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);

    return (
        <section className={Margins.bottom20}>
            <HeadingSecondary>{t("Plugins")}</HeadingSecondary>
            <Paragraph className={Margins.bottom8}>
                {t("{count} plugins used {time} so far, measured on this PC. This counts starting up and rewriting Discord's code, not the work a plugin does later.", { count: rows.length, time: formatTime(total) })}
            </Paragraph>

            <div className={cl("table")}>
                {visible.map(({ name, start, patches, total }) => (
                    <div key={name} className={cl("row")} title={t("Start: {start}, patches: {patches}", { start: formatTime(start), patches: formatTime(patches) })}>
                        <span className={cl("name")}>{name}</span>
                        <span className="ec-pixel-meter">
                            <span style={{ width: `${total / slowest * 100}%` }} />
                        </span>
                        <span className={cl("time")}>{formatTime(total)}</span>
                    </div>
                ))}
            </div>

            {rows.length > COLLAPSED_ROWS && (
                <Button className={Margins.top8} variant="secondary" onClick={() => setShowAll(v => !v)}>
                    {showAll ? t("Show less") : t("Show all {count}", { count: rows.length })}
                </Button>
            )}
        </section>
    );
}

function PluginHealth() {
    const { t } = useI18n();
    const broken = useMemo(getBrokenPlugins, []);

    return (
        <section className={Margins.bottom20}>
            <HeadingSecondary>{t("Plugin health")}</HeadingSecondary>
            {broken.length
                ? (
                    <>
                        <Paragraph className={Margins.bottom8}>
                            {t("Discord changed code these plugins rely on, so part of what they do may not work until Endcord updates them. Everything else they do keeps working.")}
                        </Paragraph>
                        <div className={cl("table")}>
                            {broken.map(name => (
                                <button key={name} className={cl("row", "health-row")} onClick={() => openPluginModal(plugins[name])}>
                                    <span className={cl("name")}>{name}</span>
                                    <span className={cl("problem")}>
                                        {t("{count} changes didn't apply", { count: getPatchProblemCount(name) })}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </>
                )
                : (
                    <div className={cl("all-good")}>
                        <ShieldCheckIcon width={20} />
                        <Paragraph>{t("Every plugin's changes applied on this version of Discord, so far this session.")}</Paragraph>
                    </div>
                )
            }
        </section>
    );
}

function SafeModeSection() {
    const { t } = useI18n();

    return (
        <section className={Margins.bottom20}>
            <HeadingSecondary>{t("Safe mode")}</HeadingSecondary>
            <Paragraph className={Margins.bottom8}>
                {IS_SAFE_MODE
                    ? t("Discord is running in safe mode right now: Endcord's plugins, themes and Custom CSS are off. Restart to bring them back.")
                    : t("Starts Discord once with Endcord's plugins, themes and Custom CSS off, to see whether one of them causes a problem. Endcord does this by itself when Discord fails to start three times in a row.")}
            </Paragraph>
            <Button variant="secondary" onClick={IS_SAFE_MODE ? relaunch : restartInSafeMode}>
                {IS_SAFE_MODE ? t("Restart normally") : t("Restart in safe mode")}
            </Button>
        </section>
    );
}

function GameModeSwitch() {
    const { t } = useI18n();
    const [enabled, setEnabled] = useState(() => isPluginEnabled("GameMode"));

    return (
        <FormSwitch
            title={t("Game Mode")}
            description={t("While you play, Discord redraws at 15 FPS by default instead of your monitor's full speed, pauses its animations and gives cached memory back. Video and streams keep their own speed.")}
            value={enabled}
            onChange={value => {
                setPluginEnabled("GameMode", value);
                setEnabled(value);
            }}
        />
    );
}

function Diagnostics() {
    return (
        <SettingsTab>
            {IS_DISCORD_DESKTOP && <MemorySection />}
            {IS_DISCORD_DESKTOP && <GameModeSwitch />}
            <PluginHealth />
            <PluginTimes />
            <SafeModeSection />
        </SettingsTab>
    );
}

export default wrapTab(Diagnostics, "Diagnostics");
