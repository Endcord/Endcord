/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css?screen";

import * as DataStore from "@api/DataStore";
import { isListedPlugin, isPluginEnabled } from "@api/PluginManager";
import { POPULAR_PLUGIN_ORDER } from "@api/PluginProfiles";
import { IS_SAFE_MODE } from "@api/SafeMode";
import { useSettings } from "@api/Settings";
import { Card } from "@components/Card";
import { EndOfListPanda, peek } from "@components/delight";
import { Divider } from "@components/Divider";
import { AppsIcon, EndcordMark, PowerIcon, SleepIcon, SparkleIcon } from "@components/EndcordIcons";
import ErrorBoundary from "@components/ErrorBoundary";
import { HeadingTertiary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { ChangeList } from "@utils/ChangeList";
import { classNameFactory } from "@utils/css";
import { isTruthy } from "@utils/guards";
import { t, useI18n } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { relaunch } from "@utils/native";
import { useAwaiter, useCleanupEffect } from "@utils/react";
import { IconProps, PluginTag, PluginTags } from "@utils/types";
import { Button, ConfirmModal, lodash, openModal, Parser, React, SearchableSelect, Select, TextInput, Tooltip, useCallback, useEffect, useMemo, useRef, useState } from "@webpack/common";
import { ComponentType, JSX, PropsWithChildren } from "react";

import Plugins, { ExcludedPlugins, PluginMeta } from "~plugins";

import { listItem } from "./listItems";
import { PluginCard } from "./PluginCard";
import { ProfilesBar } from "./Profiles";
import { searchSettings,SettingEntry } from "./settingsIndex";
import { UIElementsButton } from "./UIElements";

export const cl = classNameFactory("vc-plugins-");
export const logger = new Logger("PluginSettings", "#a6d189");


const POPULAR_PLUGINS = new Set<string>(POPULAR_PLUGIN_ORDER);

function popularRank(name: string) {
    const index = POPULAR_PLUGIN_ORDER.indexOf(name);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function ReloadRequiredCard() {
    const { t } = useI18n();
    return (
        <Card variant="warning" className={cl("info-card")}>
            <HeadingTertiary>{t("Restart required")}</HeadingTertiary>
            <Paragraph className={cl("dep-text")}>
                {t("Restart now to apply new plugins and their settings")}
            </Paragraph>
            <Button onClick={() => location.reload()} className={cl("restart-button")}>
                {t("Restart")}
            </Button>
        </Card>
    );
}

function SafeModeCard() {
    const { t } = useI18n();
    return (
        <Card variant="warning" className={cl("info-card")}>
            <HeadingTertiary>{t("Safe mode")}</HeadingTertiary>
            <Paragraph className={cl("dep-text")}>
                {t("No plugin is running right now. The switches show and change what's on after you restart normally.")}
            </Paragraph>
            <Button onClick={relaunch} className={cl("restart-button")}>
                {t("Restart normally")}
            </Button>
        </Card>
    );
}

const enum SearchStatus {
    ALL,
    ENABLED,
    DISABLED,
    NEW,
    USER_PLUGINS,
    API_PLUGINS
}

interface StatTileProps {
    Icon: ComponentType<IconProps>;
    label: string;
    value: number;
    selected: boolean;
    tone?: "on";
    wide?: boolean;
    onClick(): void;
}

function StatTile({ Icon, label, value, selected, tone, wide, onClick, children }: PropsWithChildren<StatTileProps>) {
    return (
        <button className={cl("stat", tone && `stat-${tone}`, { "stat-wide": wide, "stat-selected": selected })} aria-pressed={selected} onClick={onClick}>
            <span className={cl("stat-head")}><Icon />{label}</span>
            <span className={cl("stat-value")}>{value}</span>
            {children}
        </button>
    );
}

interface PluginStatsProps {
    enabled: number;
    total: number;
    fresh: number;
    status: SearchStatus;
    onSelect(status: SearchStatus): void;
}

/** The counts double as filters, so a number leads straight to the plugins it counts */
function PluginStats({ enabled, total, fresh, status, onSelect }: PluginStatsProps) {
    const { t } = useI18n();

    return (
        <div className={cl("stats")}>
            <StatTile Icon={PowerIcon} label={t("Enabled")} value={enabled} tone="on" wide selected={status === SearchStatus.ENABLED} onClick={() => onSelect(SearchStatus.ENABLED)}>
                <span className="ec-pixel-meter"><span style={{ width: `${enabled / total * 100}%` }} /></span>
            </StatTile>
            <StatTile Icon={SleepIcon} label={t("Disabled")} value={total - enabled} selected={status === SearchStatus.DISABLED} onClick={() => onSelect(SearchStatus.DISABLED)} />
            {fresh > 0 && <StatTile Icon={SparkleIcon} label={t("New")} value={fresh} selected={status === SearchStatus.NEW} onClick={() => onSelect(SearchStatus.NEW)} />}
            <StatTile Icon={AppsIcon} label={t("Total")} value={total} selected={false} onClick={() => onSelect(SearchStatus.ALL)} />
        </div>
    );
}

function ExcludedPluginsList({ search }: { search: string; }) {
    const { t } = useI18n();
    const matchingExcludedPlugins = search
        ? Object.entries(ExcludedPlugins)
            .filter(([name]) => name.toLowerCase().includes(search))
        : [];

    const ExcludedReasons: Record<"web" | "discordDesktop" | "vesktop" | "desktop" | "dev", string> = {
        desktop: t("Discord Desktop app or Endcord Desktop"),
        discordDesktop: t("Discord Desktop app"),
        vesktop: t("Endcord Desktop app"),
        web: t("Endcord Desktop app and the Web version of Discord"),
        dev: t("Developer version of Endcord")
    };

    return (
        <Paragraph className={Margins.top16}>
            {matchingExcludedPlugins.length
                ? <>
                    <Paragraph>{t("Are you looking for:")}</Paragraph>
                    <ul>
                        {matchingExcludedPlugins.map(([name, reason]) => (
                            <li key={name}>
                                <b>{name}</b>: {t("Only available on the {reason}", { reason: ExcludedReasons[reason] })}
                            </li>
                        ))}
                    </ul>
                </>
                : t("No plugins meet the search criteria.")
            }
        </Paragraph>
    );
}

const FIRST_CARDS = 30;
const CARDS_PER_FRAME = 50;

function PluginSettings() {
    const { t, tPluginDesc } = useI18n();
    const settings = useSettings();
    const changeRef = useRef<ChangeList<string>>(null);
    const changes = changeRef.current ??= new ChangeList<string>();
    // The same function every time, so the cards, which are memoised, aren't drawn again for a new one
    const onRestartNeeded = useCallback((name: string, key: string) => changes.handleChange(`${name}.${key}`), []);

    useCleanupEffect(() => {
        if (changes.hasChanges)
            openModal(props => (
                <ConfirmModal
                    {...props}
                    title={t("Restart required")}
                    confirmText={t("Restart now")}
                    cancelText={t("Later")}
                    variant="primary"
                    onConfirm={() => location.reload()}
                >
                    <>
                        <p>{t("The following plugins require a restart:")}</p>
                        <div>{changes.map((s, i) => (
                            <>
                                {i > 0 && ", "}
                                {Parser.parse(`\`${s.split(".")[0]}\``)}
                            </>
                        ))}</div>
                    </>
                </ConfirmModal>
            ));
    }, []);

    // Plugins whose code isn't loaded are listed from what the build read of them (see ./listItems)
    const sortedPlugins = useMemo(() =>
        Object.keys(Plugins).map(listItem).sort((a, b) => {
            const rank = popularRank(a.name) - popularRank(b.name);
            return rank !== 0 ? rank : a.name.localeCompare(b.name);
        }),
        []
    );

    const depMap = useMemo(() => {
        const o = {} as Record<string, string[]>;
        for (const plugin of sortedPlugins) {
            for (const dep of plugin.dependencies ?? []) {
                o[dep] ??= [];
                o[dep].push(plugin.name);
            }
        }
        return o;
    }, []);

    const enabledCount = useMemo(() => sortedPlugins.filter(p => isPluginEnabled(p.name)).length, [settings]);

    const hasUserPlugins = useMemo(() => !IS_STANDALONE && Object.values(PluginMeta).some(m => m.userPlugin), []);

    const [searchValue, setSearchValue] = useState({ value: "", tags: [] as PluginTag[], status: SearchStatus.ALL });

    const search = searchValue.value.toLowerCase();
    const onSearch = (query: string) => {
        setSearchValue(prev => ({ ...prev, value: query }));
        if (query.trim().toLowerCase() === "panda") peek(t("that's me! 🐼 no plugin, just a panda"));
    };
    const onStatSelect = (status: SearchStatus) => setSearchValue(prev => ({ ...prev, status: prev.status === status ? SearchStatus.ALL : status }));
    const isFiltering = search.length > 0 || searchValue.tags.length > 0 || searchValue.status !== SearchStatus.ALL;

    // Settings match too, from three letters on, so "volume" finds the plugins with a volume setting
    const settingHits = useMemo(() => {
        const hits = new Map<string, SettingEntry[]>();
        if (search.trim().length < 3) return hits;

        for (const entry of searchSettings(search)) {
            const list = hits.get(entry.plugin.name);
            if (list) list.push(entry);
            else hits.set(entry.plugin.name, [entry]);
        }
        return hits;
    }, [search]);

    const pluginFilter = (plugin: typeof Plugins[keyof typeof Plugins]) => {
        const { status, tags } = searchValue;

        switch (status) {
            case SearchStatus.DISABLED:
                if (isPluginEnabled(plugin.name)) return false;
                break;
            case SearchStatus.ENABLED:
                if (!isPluginEnabled(plugin.name)) return false;
                break;
            case SearchStatus.NEW:
                if (!newPlugins?.includes(plugin.name)) return false;
                break;
            case SearchStatus.USER_PLUGINS:
                if (!PluginMeta[plugin.name]?.userPlugin) return false;
                break;
            case SearchStatus.API_PLUGINS:
                if (!plugin.name.endsWith("API")) return false;
                break;
        }

        if (tags.length && tags.some(t => !plugin.tags?.includes(t))) return false;

        if (!search.length) return true;

        return (
            plugin.name.toLowerCase().includes(search) ||
            plugin.name.match(/[A-Z]/g)?.join("").toLowerCase().includes(search) || // acronyms like BF for BetterFolders
            plugin.description.toLowerCase().includes(search) ||
            tPluginDesc(plugin.name, plugin.description).toLowerCase().includes(search) ||
            plugin.searchTerms?.some(t => t.toLowerCase().includes(search)) ||
            settingHits.has(plugin.name)
        );
    };

    const [newPlugins] = useAwaiter(() => DataStore.get("Endcord_existingPlugins").then((cachedPlugins: Record<string, number> | undefined) => {
        const now = Date.now() / 1000;
        const existingTimestamps: Record<string, number> = {};
        const sortedPluginNames = Object.values(sortedPlugins).map(plugin => plugin.name);

        const newPlugins: string[] = [];
        for (const { name: p } of sortedPlugins) {
            const time = existingTimestamps[p] = cachedPlugins?.[p] ?? now;
            if ((time + 60 * 60 * 24 * 2) > now) {
                newPlugins.push(p);
            }
        }
        DataStore.set("Endcord_existingPlugins", existingTimestamps);

        return lodash.isEqual(newPlugins, sortedPluginNames) ? [] : newPlugins;
    }));

    const plugins = [] as JSX.Element[];
    const requiredPlugins = [] as JSX.Element[];

    const showApi = searchValue.status === SearchStatus.API_PLUGINS;
    for (const p of sortedPlugins) {
        if (p.hidden || (!showApi && !isListedPlugin(p)))
            continue;

        if (!pluginFilter(p)) continue;

        const isRequired = p.required || p.isDependency || depMap[p.name]?.some(d => settings.plugins[d].enabled);

        if (isRequired) {
            const tooltipText = p.required || !depMap[p.name]
                ? t("This plugin is required for Endcord to function.")
                : makeDependencyList(depMap[p.name]?.filter(d => settings.plugins[d].enabled));

            requiredPlugins.push(
                <Tooltip text={tooltipText} key={p.name}>
                    {({ onMouseLeave, onMouseEnter }) => (
                        <PluginCard
                            onMouseLeave={onMouseLeave}
                            onMouseEnter={onMouseEnter}
                            onRestartNeeded={onRestartNeeded}
                            disabled={true}
                            plugin={p}
                            key={p.name}
                        />
                    )}
                </Tooltip>
            );
        } else {
            plugins.push(
                <PluginCard
                    onRestartNeeded={onRestartNeeded}
                    disabled={false}
                    plugin={p}
                    isNew={newPlugins?.includes(p.name)}
                    isPopular={POPULAR_PLUGINS.has(p.name)}
                    matchedSettings={settingHits.get(p.name)}
                    key={p.name}
                />
            );
        }
    }

    // The tab opens with the first cards and draws the rest over the next frames, instead of all five hundred before
    // anything shows
    const [drawn, setDrawn] = useState(FIRST_CARDS);
    useEffect(() => {
        if (drawn >= plugins.length) return;
        const frame = requestAnimationFrame(() => setDrawn(n => n + CARDS_PER_FRAME));
        return () => cancelAnimationFrame(frame);
    }, [drawn, plugins.length]);

    return (
        <SettingsTab>
            {IS_SAFE_MODE && <SafeModeCard />}
            {changes.hasChanges && <ReloadRequiredCard />}

            <PluginStats
                enabled={enabledCount}
                total={sortedPlugins.length}
                fresh={newPlugins?.length ?? 0}
                status={searchValue.status}
                onSelect={onStatSelect}
            />

            <ProfilesBar onRestartNeeded={() => changes.handleChange(`${t("Profile")}.plugins`)} />

            <UIElementsButton />

            <ErrorBoundary noop>
                <div className={Margins.top16}>
                    <TextInput
                        inputClassName={cl("filter-control")}
                        placeholder={t("Search plugins and their settings...")}
                        value={searchValue.value}
                        onChange={onSearch}
                        autoFocus
                    />
                </div>
            </ErrorBoundary>

            <ErrorBoundary noop>
                <div className={classes(Margins.bottom20, Margins.top8, cl("filter-controls"))}>
                    <Select
                        options={[
                            { label: t("Show All"), value: SearchStatus.ALL, default: true },
                            { label: t("Show Enabled"), value: SearchStatus.ENABLED },
                            { label: t("Show Disabled"), value: SearchStatus.DISABLED },
                            { label: t("Show New"), value: SearchStatus.NEW },
                            hasUserPlugins && { label: t("Show UserPlugins"), value: SearchStatus.USER_PLUGINS },
                            { label: t("Show API Plugins"), value: SearchStatus.API_PLUGINS },
                        ].filter(isTruthy)}
                        serialize={String}
                        select={status => setSearchValue(prev => ({ ...prev, status }))}
                        isSelected={v => v === searchValue.status}
                        closeOnSelect={true}
                        placeholder={t("Filter by Type")}
                    />
                    <SearchableSelect
                        options={PluginTags.map(tag => ({ label: t(tag), value: tag }))}
                        value={searchValue.tags}
                        onChange={tags => setSearchValue(prev => ({ ...prev, tags }))}
                        closeOnSelect={false}
                        placeholder={t("Filter by Tags")}
                        multi
                    />
                </div>
            </ErrorBoundary>

            <div className={classes(Margins.top20, cl("list-heading"))}>
                <HeadingTertiary>{t("Plugins")}</HeadingTertiary>
                {isFiltering && <span className={cl("count")}>{t("{count} shown", { count: plugins.length + requiredPlugins.length })}</span>}
            </div>

            {plugins.length || requiredPlugins.length
                ? (
                    <div className={cl("grid")}>
                        {plugins.length
                            ? plugins.slice(0, drawn)
                            : <Paragraph>{t("No plugins meet the search criteria.")}</Paragraph>
                        }
                    </div>
                )
                : (
                    <div className={cl("empty")}>
                        <EndcordMark width={51} asleep />
                        <ExcludedPluginsList search={search} />
                    </div>
                )
            }

            {!isFiltering && drawn >= plugins.length && <EndOfListPanda />}


            <Divider className={Margins.top20} />

            <HeadingTertiary className={classes(Margins.top20, Margins.bottom8)}>
                {t("Required Plugins")}
            </HeadingTertiary>

            <div className={cl("grid")}>
                {requiredPlugins.length
                    ? requiredPlugins
                    : <Paragraph>{t("No plugins meet the search criteria.")}</Paragraph>
                }
            </div>
        </SettingsTab >
    );
}

function makeDependencyList(deps: string[]) {
    return (
        <>
            <Paragraph>{t("This plugin is required by:")}</Paragraph>
            {deps.map((dep: string) => <Paragraph key={dep} className={cl("dep-text")}>{dep}</Paragraph>)}
        </>
    );
}

export default wrapTab(PluginSettings, "Plugins");


export function PluginDependencyList({ deps }: { deps: string[]; }) {
    const { t } = useI18n();
    return (
        <>
            <Paragraph>{t("This plugin is required by:")}</Paragraph>
            {deps.map((dep: string) => <Paragraph key={dep} className={cl("dep-text")}>{dep}</Paragraph>)}
        </>
    );
}
