/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openNotificationLogModal } from "@api/Notifications/notificationLog";
import { isPluginEnabled, isSettingDisabled, isSettingHidden, plugins } from "@api/PluginManager";
import { Settings, useSettings } from "@api/Settings";
import { openPluginModal, openSettingsTabModal, PluginsTab, ThemesTab, UpdaterTab } from "@components/settings";
import { t } from "@utils/i18n";
import { localStorage } from "@utils/localStorage";
import { useAwaiter } from "@utils/react";
import { wordsFromCamel, wordsToTitle } from "@utils/text";
import { OptionType, Plugin } from "@utils/types";
import { Menu, showToast, Toasts, useMemo, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { settings } from ".";

const ENDCORD_VERSION_URL = "https://raw.githubusercontent.com/rootpoii/endcord/main/version.json";
const LS_LAST_SEEN_UPDATE = "endcord_last_seen_updatedAt";
let _updateAvailable = false;
let _latestVersion = "";
let _latestUrl = "";

async function checkForUpdates(showToastIfNew = false) {
    try {
        const res = await fetch(`${ENDCORD_VERSION_URL}?t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        const latestTs: number = data.updatedAt ?? 0;
        const latestVersion: string = data.version ?? "";
        const seenTs = Number(localStorage.getItem(LS_LAST_SEEN_UPDATE) ?? "0");

        _latestVersion = latestVersion;
        _latestUrl = data.downloadUrl ?? "";

        const localTs: number = typeof BUILD_TIMESTAMP === "number" ? BUILD_TIMESTAMP : 0;
        if (latestTs > localTs && latestTs > seenTs) {
            _updateAvailable = true;
            if (showToastIfNew) {
                Toasts.show({
                    id: "endcord-update-available",
                    message: t("Endcord {version} is available. Open the Toolbox to update.", { version: latestVersion }),
                    type: Toasts.Type.MESSAGE,
                    options: { duration: 8000 }
                });
            }
        } else {
            _updateAvailable = false;
        }
    } catch { }
}

let _updateTimer: ReturnType<typeof setTimeout> | null = null;
let _updateInterval: ReturnType<typeof setInterval> | null = null;

export function startUpdateChecker() {
    stopUpdateChecker();
    _updateTimer = setTimeout(() => checkForUpdates(true), 5000);
    _updateInterval = setInterval(() => checkForUpdates(true), 30 * 60 * 1000);
}

export function stopUpdateChecker() {
    if (_updateTimer) clearTimeout(_updateTimer);
    if (_updateInterval) clearInterval(_updateInterval);
    _updateTimer = null;
    _updateInterval = null;
}



function buildPluginMenu() {
    const { showPluginMenu } = settings.use(["showPluginMenu"]);

    // has to be here due to hooks
    const pluginEntries = buildPluginMenuEntries();

    if (!showPluginMenu) return null;

    return (
        <Menu.MenuItem
            id="plugins"
            label={t("Plugins")}
            action={() => openSettingsTabModal(PluginsTab)}
        >
            {pluginEntries}
        </Menu.MenuItem>
    );
}

export function buildPluginMenuEntries(includeEmpty = false) {
    const pluginSettings = useSettings().plugins;

    const [search, setSearch] = useState("");

    const lowerSearch = search.toLowerCase();

    // Only enabled plugins are listed, and those are already loaded; reading the others would evaluate them
    const sortedPlugins = useMemo(() =>
        Object.keys(plugins).filter(name => isPluginEnabled(name)).map(name => plugins[name]).sort((a, b) => a.name.localeCompare(b.name)),
        []
    );

    const candidates = useMemo(() =>
        sortedPlugins
            .filter(p => {
                if (!isPluginEnabled(p.name)) return false;
                if (p.name.endsWith("API")) return false;

                const name = p.name.toLowerCase();
                return name.includes(lowerSearch);
            }),
        [lowerSearch]
    );

    return (
        <>
            <Menu.MenuControlItem
                id="plugins-search"
                control={(props, ref) => (
                    <Menu.MenuSearchControl
                        {...props}
                        query={search}
                        onChange={setSearch}
                        ref={ref}
                    />
                )}
            />

            <Menu.MenuSeparator />

            {candidates
                .map(p => {
                    const options = [] as ReactNode[];

                    let hasAnyOption = false;

                    if (p.settings) for (const [key, option] of Object.entries(p.settings.def)) {
                        if (isSettingHidden(p.settings, option)) continue;

                        hasAnyOption = true;

                        const s = pluginSettings[p.name];

                        const baseProps = {
                            id: `${p.name}-${key}`,
                            key: key,
                            label: t(wordsToTitle(wordsFromCamel(key))),
                            disabled: isSettingDisabled(p.settings, option)
                        };

                        switch (option.type) {
                            case OptionType.BOOLEAN:
                                options.push(
                                    <Menu.MenuCheckboxItem
                                        {...baseProps}
                                        checked={s[key]}
                                        action={() => {
                                            s[key] = !s[key];
                                            if (option.restartNeeded) showToast(t("Restart to apply the change"));
                                        }}
                                    />
                                );
                                break;
                            case OptionType.SELECT:
                                options.push(
                                    <Menu.MenuItem {...baseProps}>
                                        {option.options.map(opt => (
                                            <Menu.MenuRadioItem
                                                group={`${p.name}-${key}`}
                                                id={`${p.name}-${key}-${opt.value}`}
                                                key={opt.label}
                                                label={opt.label}
                                                checked={s[key] === opt.value}
                                                action={() => {
                                                    s[key] = opt.value;
                                                    if (option.restartNeeded) showToast(t("Restart to apply the change"));
                                                }}
                                            />
                                        ))}
                                    </Menu.MenuItem>
                                );
                                break;
                            case OptionType.SLIDER:
                                // The menu slider doesn't support these options. Skip to avoid confusion
                                if (option.stickToMarkers || option.componentProps) continue;

                                options.push(
                                    <Menu.MenuControlItem
                                        {...baseProps}
                                        control={(props, ref) => (
                                            <Menu.MenuSliderControl
                                                ref={ref}
                                                {...props}
                                                minValue={option.markers[0]}
                                                maxValue={option.markers.at(-1)!}
                                                value={s[key]}
                                                onChange={v => s[key] = v}
                                            />
                                        )}
                                    />
                                );
                                break;
                        }
                    }

                    const hasVisibleOptions = options.length > 0;
                    const shouldSkip = !hasVisibleOptions && !(includeEmpty && hasAnyOption);
                    if (shouldSkip) return null;

                    return (
                        <Menu.MenuItem
                            id={`${p.name}-menu`}
                            key={p.name}
                            label={p.name}
                            action={() => openPluginModal(p)}
                        >
                            {hasVisibleOptions && (
                                <>
                                    <Menu.MenuGroup label={p.name}>
                                        {options}
                                    </Menu.MenuGroup>

                                    <Menu.MenuSeparator />

                                    <Menu.MenuItem
                                        id={`${p.name}-open`}
                                        label={t("Open Settings")}
                                        action={() => openPluginModal(p)}
                                    />
                                </>
                            )}
                        </Menu.MenuItem>
                    );
                })
            }
        </>
    );
}

export function buildThemeMenu() {
    return (
        <Menu.MenuItem
            id="themes"
            label={t("Themes")}
            action={() => openSettingsTabModal(ThemesTab)}
        >
            {buildThemeMenuEntries()}
        </Menu.MenuItem>
    );
}

export function buildThemeMenuEntries() {
    const { useQuickCss, enabledThemes } = useSettings(["useQuickCss", "enabledThemes"]);
    const [themes] = useAwaiter(EndcordNative.themes.getThemesList);

    return (
        <>
            <Menu.MenuCheckboxItem
                id="toggle-quickcss"
                checked={useQuickCss}
                label={t("Enable QuickCSS")}
                action={() => {
                    Settings.useQuickCss = !useQuickCss;
                }}
            />
            <Menu.MenuItem
                id="edit-quickcss"
                label={t("Edit QuickCSS")}
                action={() => EndcordNative.quickCss.openEditor()}
            />
            <Menu.MenuItem
                id="manage-themes"
                label={t("Manage Themes")}
                action={() => openSettingsTabModal(ThemesTab)}
            />
            {!!themes?.length && (
                <Menu.MenuGroup>
                    {themes.map(theme => (
                        <Menu.MenuCheckboxItem
                            id={`theme-${theme.fileName}`}
                            key={theme.fileName}
                            label={theme.name}
                            checked={enabledThemes.includes(theme.fileName)}
                            action={() => {
                                if (enabledThemes.includes(theme.fileName)) {
                                    Settings.enabledThemes = enabledThemes.filter(t => t !== theme.fileName);
                                } else {
                                    Settings.enabledThemes = [...enabledThemes, theme.fileName];
                                }
                            }}
                        />
                    ))}
                </Menu.MenuGroup>
            )}
        </>
    );
}

function buildCustomPluginEntries() {
    const pluginEntries = [] as { plugin: Plugin, node: ReactNode; }[];

    for (const name of Object.keys(plugins)) {
        if (!isPluginEnabled(name)) continue;
        const plugin = plugins[name];
        if (plugin.toolboxActions) {
            const entries = typeof plugin.toolboxActions === "function"
                ? plugin.toolboxActions()
                : Object.entries(plugin.toolboxActions).map(([text, action]) => {
                    const key = `${plugin.name}-${text}`;

                    return (
                        <Menu.MenuItem
                            id={key}
                            key={key}
                            label={text}
                            action={action}
                        />
                    );
                });

            if (!entries || Array.isArray(entries) && entries.length === 0) continue;

            pluginEntries.push({
                plugin,
                node:
                    <Menu.MenuGroup label={plugin.name} key={`${plugin.name}-group`}>
                        {entries}
                    </Menu.MenuGroup>
            });
        }
    }

    // If there aren't too many entries, just put them all in the main menu.
    // Otherwise, add submenus for each plugin
    // FIXME: the Slider component has broken styles that overlap with higher context menus
    // https://discord.com/channels/1015060230222131221/1015063227299811479/1440489344631705693
    if (pluginEntries.length <= 5)
        return pluginEntries.map(e => e.node);

    const submenuEntries = pluginEntries.map(({ node, plugin }) => (
        <Menu.MenuItem
            id={`${plugin.name}-menu`}
            key={`${plugin.name}-menu`}
            label={plugin.name}
            action={() => openPluginModal(plugin)}
        >
            {node}
        </Menu.MenuItem>
    ));

    return <Menu.MenuGroup>{submenuEntries}</Menu.MenuGroup>;
}

export function renderPopout(onClose: () => void) {
    const [updateAvailable, setUpdateAvailable] = useState(_updateAvailable);

    return (
        <Menu.Menu
            navId="vc-toolbox"
            onClose={onClose}
        >
            {updateAvailable && (
                <Menu.MenuGroup label={t("Endcord {version} is available", { version: _latestVersion })}>
                    <Menu.MenuItem
                        id="endcord-open-updater"
                        label={t("Update Endcord")}
                        action={() => UpdaterTab ? openSettingsTabModal(UpdaterTab) : EndcordNative.native.openExternal(_latestUrl || "https://github.com/rootpoii/Endcord/releases")}
                    />
                    <Menu.MenuItem
                        id="endcord-dismiss-update"
                        label={t("Remind me later")}
                        action={() => {
                            localStorage.setItem(LS_LAST_SEEN_UPDATE, String(Date.now()));
                            _updateAvailable = false;
                            setUpdateAvailable(false);
                            onClose();
                        }}
                    />
                </Menu.MenuGroup>
            )}
            {!updateAvailable && (
                <Menu.MenuItem
                    id="endcord-check-update-idle"
                    label={t("Check for Updates")}
                    action={async () => {
                        await checkForUpdates(false);
                        setUpdateAvailable(_updateAvailable);
                        Toasts.show({
                            id: "endcord-check-done",
                            message: _updateAvailable
                                ? t("Endcord {version} is available", { version: _latestVersion })
                                : t("Endcord is up to date"),
                            type: _updateAvailable ? Toasts.Type.MESSAGE : Toasts.Type.SUCCESS
                        });
                    }}
                />
            )}

            <Menu.MenuItem
                id="notifications"
                label={t("Open Notification Log")}
                action={openNotificationLogModal}
            />

            {buildThemeMenu()}
            {buildPluginMenu()}

            {buildCustomPluginEntries()}
        </Menu.Menu >
    );
}
