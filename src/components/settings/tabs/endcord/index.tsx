/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css?screen";

import { openNotificationLogModal } from "@api/Notifications/notificationLog";
import { isPluginEnabled, plugins } from "@api/PluginManager";
import { BadgeDateFormat, useSettings } from "@api/Settings";
import { boop, floatHearts, tapVersion } from "@components/delight";
import { CodeIcon, EndcordMark, EndcordWordmark, FolderPixelIcon, ListIcon, RestartPixelIcon } from "@components/EndcordIcons";
import { FormSwitch } from "@components/FormSwitch";
import { Heart } from "@components/Heart";
import { GithubIcon } from "@components/Icons";
import { HEART_PALETTE, HEART_ROWS, PANDA_PALETTE, PANDA_ROWS, PixelArt, SpecialCard } from "@components/settings/SpecialCard";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openContributorModal } from "@components/settings/tabs/plugins/ContributorModal";
import { formatShortDate } from "@plugins/_api/badges/discordBadges";
import SettingsPlugin from "@plugins/_core/settings";
import { IS_WINDOWS, REPO_URL } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { setEndcordLanguage, SUPPORTED_LANGUAGES, useI18n } from "@utils/i18n";
import { identity, isPluginDev } from "@utils/misc";
import { relaunch } from "@utils/native";
import { ConfirmModal, openModal, Select, useEffect, useMemo, UserStore, useState } from "@webpack/common";
import type { ComponentType, PropsWithChildren, ReactNode } from "react";

import gitHash from "~git-hash";

import { MacOSVibrancySettings } from "./MacVibrancySettings";
import { openNotificationSettingsModal } from "./NotificationSettings";
import { SecurityStatus } from "./SecurityStatus";
import { WindowsMaterialSettings } from "./WindowsMaterialSettings";

const cl = classNameFactory("ec-home-");

type KeysOfType<Object, Type> = {
    [K in keyof Object]: Object[K] extends Type ? K : never;
}[keyof Object];

type SwitchKey = KeysOfType<ReturnType<typeof useSettings>, boolean>;

interface SwitchDef {
    key: SwitchKey;
    title: string;
    description?: string;
    restartRequired?: boolean;
}

// ---- Pieces ---------------------------------------------------------------------------------------------------------

/** A titled card of settings rows, like the installer's lists */
function Group({ title, children }: PropsWithChildren<{ title: string; }>) {
    return (
        <section className={cl("group")}>
            <h3 className={cl("group-title")}>{title}</h3>
            <div className={cl("card")}>{children}</div>
        </section>
    );
}

/** Settings row: label on the left, control on the right. `wide` is for dropdowns */
function Row({ title, description, wide, children }: PropsWithChildren<{ title: string; description?: ReactNode; wide?: boolean; }>) {
    return (
        <div className={cl("row")}>
            <div className={cl("row-text")}>
                <div className={cl("row-title")}>{title}</div>
                {description && <div className={cl("row-description")}>{description}</div>}
            </div>
            <div className={cl("row-control", { wide })}>{children}</div>
        </div>
    );
}

function Switches({ defs }: { defs: Array<SwitchDef | false>; }) {
    const { t } = useI18n();
    const settings = useSettings(defs.flatMap(def => def ? [def.key] : []));

    return (
        <>
            {defs.map(def => {
                if (!def) return null;
                const { key, title, description, restartRequired } = def;

                return (
                    <FormSwitch
                        key={key}
                        className={cl("switch")}
                        title={title}
                        description={description}
                        value={settings[key]}
                        hideBorder
                        onChange={v => {
                            settings[key] = v;

                            if (restartRequired) {
                                openModal(props => (
                                    <ConfirmModal
                                        {...props}
                                        title={t("Restart Required")}
                                        subtitle={t("A restart is required to apply this change")}
                                        confirmText={t("Restart now")}
                                        cancelText={t("Later")}
                                        variant="primary"
                                        onConfirm={relaunch}
                                    />
                                ));
                            }
                        }}
                    />
                );
            })}
        </>
    );
}

function Action({ Icon, text, onClick }: { Icon: ComponentType<{ className?: string; }>; text: string; onClick(): void; }) {
    return (
        <button className={cl("action")} onClick={onClick}>
            <span className={cl("action-tile")}><Icon className={cl("action-icon")} /></span>
            <span className={cl("action-text")}>{text}</span>
        </button>
    );
}

// ---- Sections -------------------------------------------------------------------------------------------------------

function Header() {
    const { t } = useI18n();
    const { enabledThemes, themeLinks } = useSettings(["enabledThemes", "themeLinks"]);
    // Count by name, so disabled lazy plugins don't get loaded
    const pluginsOn = useMemo(() => Object.keys(plugins).filter(isPluginEnabled).length, []);
    const themesOn = enabledThemes.length + themeLinks.length;

    return (
        <header className={cl("header")}>
            {/* Panda is asleep until hovered */}
            <button className={cl("logo")} aria-label={t("Boop the panda")} onClick={boop}>
                <EndcordMark width={51} asleep />
                <EndcordMark width={51} />
            </button>
            <div className={cl("heading")}>
                <EndcordWordmark className={cl("wordmark")} />
                <button className={cl("version")} onClick={tapVersion}>
                    v{VERSION} · {gitHash.slice(0, 7)}
                </button>
            </div>
            <div className={cl("tags")}>
                <span className={cl("tag")}>{t("{count} plugins on", { count: pluginsOn })}</span>
                {themesOn > 0 && <span className={cl("tag")}>{t("{count} themes on", { count: themesOn })}</span>}
            </div>
        </header>
    );
}

function QuickActions() {
    const { t } = useI18n();

    return (
        <div className={cl("actions")}>
            <Action Icon={ListIcon} text={t("Notification Log")} onClick={openNotificationLogModal} />
            <Action Icon={CodeIcon} text={t("Edit QuickCSS")} onClick={() => EndcordNative.quickCss.openEditor()} />
            {!IS_WEB && <Action Icon={RestartPixelIcon} text={t("Relaunch Discord")} onClick={relaunch} />}
            {!IS_WEB && <Action Icon={FolderPixelIcon} text={t("Open Settings Folder")} onClick={() => EndcordNative.settings.openFolder()} />}
            <Action Icon={GithubIcon} text={t("View Source Code")} onClick={() => EndcordNative.native.openExternal(REPO_URL)} />
        </div>
    );
}

// Each option shows an example date in that format
const SAMPLE_DATE = new Date(2023, 2, 14);
const BADGE_DATE_FORMATS: BadgeDateFormat[] = ["numeric", "dmy", "mdy", "ymd", "long", "discord"];

function General() {
    const { lang, t } = useI18n();
    const settings = useSettings(["badgeDateFormat"]);

    const dateLabel = (format: BadgeDateFormat) => {
        if (format === "discord") return t("As Discord writes it");
        const sample = formatShortDate(SAMPLE_DATE, format);
        return format === "numeric" ? t("{date} (your language's order)", { date: sample }) : sample;
    };

    return (
        <Group title={t("General")}>
            <Row title={t("Language")} description={t("Select the language for Endcord.")} wide>
                <Select
                    options={SUPPORTED_LANGUAGES.map(l => ({ label: `${l.nativeName} (${l.englishName})`, value: l.code }))}
                    closeOnSelect={true}
                    select={v => setEndcordLanguage(v)}
                    isSelected={v => v === lang}
                    serialize={identity}
                />
            </Row>
            <Row title={t("Badge dates")} description={t("How badges write dates, like Nitro's \"Subscriber since\".")} wide>
                <Select
                    options={BADGE_DATE_FORMATS.map(format => ({ label: dateLabel(format), value: format }))}
                    closeOnSelect={true}
                    select={(value: BadgeDateFormat) => settings.badgeDateFormat = value}
                    isSelected={(value: BadgeDateFormat) => value === settings.badgeDateFormat}
                    serialize={identity}
                />
            </Row>
        </Group>
    );
}

function Appearance() {
    const { t } = useI18n();

    return (
        <Group title={t("Appearance")}>
            <Switches defs={[
                { key: "useQuickCss", title: t("Enable Custom CSS") },
                { key: "pixelStyle", title: t("Pixel style"), description: t("Pixel corners, icons and lettering in Endcord's screens, like the installer") },
                { key: "uiSounds", title: t("Play quiet sounds in Endcord's settings"), description: t("A soft click on switches, and a tone when something succeeds or fails") },
                { key: "pandaVisits", title: t("Panda visits"), description: t("Now and then a panda flips along the bottom of Discord. Click it to catch it") },
                { key: "hideContributorBadge", title: t("Hide the Endcord badges"), description: t("Leaves the developer and contributor badges off every profile on this PC. Other people who use Endcord still see them") }
            ]} />
        </Group>
    );
}

// Endcord Desktop keeps its own window as it is (desktop/src/main.ts)
function Window() {
    const { t } = useI18n();
    if (!IS_DISCORD_DESKTOP) return null;

    return (
        <Group title={t("Window")}>
            <Switches defs={[
                !IS_WINDOWS
                    ? { key: "frameless", title: t("Disable the window frame"), restartRequired: true }
                    : { key: "winNativeTitleBar", title: t("Use Windows' native title bar instead of Discord's custom one"), restartRequired: true },
                { key: "transparent", title: t("Enable window transparency"), description: t("A theme that supports transparency is required or this will do nothing. Stops the window from being resizable as a side effect"), restartRequired: true },
                { key: "disableMinSize", title: t("Disable minimum window size"), restartRequired: true },
                IS_WINDOWS && { key: "winCtrlQ", title: t("Register Ctrl+Q as shortcut to close Discord (Alternative to Alt+F4)"), restartRequired: true }
            ]} />
            {/* Each renders nothing on systems without that effect */}
            <div className={cl("block")}><WindowsMaterialSettings /></div>
            <div className={cl("block")}><MacOSVibrancySettings /></div>
        </Group>
    );
}

// Endcord Desktop's own, left out of other builds: its icon everywhere but on the exe (desktop/src/icon.ts)
function DesktopApp() {
    const { t } = useI18n();
    const [icon, setIcon] = useState<string>();
    useEffect(() => {
        EndcordDesktopNative.app.getIcon?.().then(setIcon);
    }, []);
    if (!icon) return null;

    const pick = (value: string) => {
        setIcon(value);
        EndcordDesktopNative.app.setIcon(value);
    };

    return (
        <Group title="Endcord Desktop">
            <Row title={t("App icon")} description={t("On the taskbar, in the tray and on the shortcuts. The app's file keeps the Endcord logo.")} wide>
                <Select
                    options={[{ label: t("Endcord logo"), value: "endcord" }, { label: t("Discord logo"), value: "discord" }]}
                    closeOnSelect={true}
                    select={pick}
                    isSelected={(value: string) => value === icon}
                    serialize={identity}
                />
            </Row>
        </Group>
    );
}

function Performance() {
    const { t } = useI18n();
    if (IS_WEB) return null;

    return (
        <Group title={t("Performance")}>
            <Switches defs={[
                IS_DISCORD_DESKTOP && { key: "gpuRasterization", title: t("Paint the interface on the GPU"), description: t("Can make scrolling smoother on some graphics cards, but uses 50-80 MB more memory"), restartRequired: true },
                { key: "disableBackgroundMemoryTrim", title: t("Keep caches while Discord is minimized or in the tray"), description: t("By default Endcord frees cached memory a minute after the window is hidden"), restartRequired: true }
            ]} />
        </Group>
    );
}

function Advanced() {
    const { t } = useI18n();
    const { settingsLocation } = SettingsPlugin.settings.use(["settingsLocation"]);

    return (
        <Group title={t("Advanced")}>
            <Row title={t("Where to put the Endcord settings section")} wide>
                <Select
                    options={SettingsPlugin.settings.def.settingsLocation.options}
                    closeOnSelect={true}
                    select={v => SettingsPlugin.settings.store.settingsLocation = v}
                    isSelected={v => v === settingsLocation}
                    serialize={identity}
                />
            </Row>
            <Row title={t("Notification Settings")} description={t("Settings for Notifications sent by Endcord. This does NOT include Discord notifications (messages, etc)")}>
                <button className={cl("button")} onClick={openNotificationSettingsModal}>{t("Open")}</button>
            </Row>
            {!IS_WEB && <Switches defs={[{ key: "enableReactDevtools", title: t("Enable React Developer Tools"), restartRequired: true }]} />}
        </Group>
    );
}

/** Contributor and donate cards at the top of the tab */
function Cards() {
    const { t } = useI18n();
    const user = UserStore?.getCurrentUser();

    return (
        <>
            {user && isPluginDev(user.id) && (
                <SpecialCard
                    accent="bamboo"
                    title={t("Contributions")}
                    subtitle={t("Thank you for building Endcord")}
                    description={t("Your work ships to everyone who uses Endcord, and your profile carries the Endcord Contributor badge.")}
                    art={<PixelArt rows={PANDA_ROWS} palette={PANDA_PALETTE} pixel={4} />}
                    actions={
                        <button className="ec-card-button ec-card-button-primary" onClick={() => openContributorModal(user)}>
                            {t("See your plugins")}
                        </button>
                    }
                />
            )}
            <SpecialCard
                accent="honey"
                title={t("Support Endcord")}
                subtitle={t("Free and open source, always")}
                description={t("Endcord is built in our spare time. If it makes Discord better for you, a donation helps us keep testing, translating and shipping new features.")}
                art={<span className="ec-card-heart" onClick={event => floatHearts(event.currentTarget)}><PixelArt rows={HEART_ROWS} palette={HEART_PALETTE} pixel={7} /></span>}
                actions={
                    <>
                        <button className="ec-card-button ec-card-button-primary" onClick={() => EndcordNative.native.openExternal(REPO_URL)}>
                            <Heart />
                            {t("Donate")}
                        </button>
                        <button className="ec-card-button ec-card-button-secondary" onClick={() => EndcordNative.native.openExternal(REPO_URL)}>
                            <GithubIcon />
                            {t("Star on GitHub")}
                        </button>
                    </>
                }
            />
        </>
    );
}

function EndcordSettings() {
    return (
        <SettingsTab>
            <Header />
            {IS_STANDALONE && !IS_UPDATER_DISABLED && <SecurityStatus />}
            <Cards />
            <QuickActions />
            <General />
            <Appearance />
            <Window />
            {IS_ENDCORD_DESKTOP && <DesktopApp />}
            <Performance />
            <Advanced />
        </SettingsTab>
    );
}

export default wrapTab(EndcordSettings, "Endcord Settings");
