/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openNotificationLogModal } from "@api/Notifications/notificationLog";
import { BadgeDateFormat, useSettings } from "@api/Settings";
import { floatHearts } from "@components/delight";
import { Divider } from "@components/Divider";
import { CodeIcon, FolderPixelIcon, ListIcon, RestartPixelIcon } from "@components/EndcordIcons";
import { FormSwitch } from "@components/FormSwitch";
import { Heart } from "@components/Heart";
import { GithubIcon } from "@components/Icons";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { HEART_PALETTE, HEART_ROWS, PANDA_PALETTE, PANDA_ROWS, PixelArt, SpecialCard } from "@components/settings/SpecialCard";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openContributorModal } from "@components/settings/tabs/plugins/ContributorModal";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { formatShortDate } from "@plugins/_api/badges/discordBadges";
import SettingsPlugin from "@plugins/_core/settings";
import { IS_WINDOWS } from "@utils/constants";
import { setEndcordLanguage, SUPPORTED_LANGUAGES, useI18n } from "@utils/i18n";
import { Margins } from "@utils/margins";
import { identity, isPluginDev } from "@utils/misc";
import { relaunch } from "@utils/native";
import { ConfirmModal, Forms, openModal, Select, UserStore } from "@webpack/common";

import { MacOSVibrancySettings } from "./MacVibrancySettings";
import { NotificationSection } from "./NotificationSettings";
import { SecurityStatus } from "./SecurityStatus";
import { WindowsMaterialSettings } from "./WindowsMaterialSettings";

const REPO_URL = "https://github.com/Endcord/Endcord";

type KeysOfType<Object, Type> = {
    [K in keyof Object]: Object[K] extends Type ? K : never;
}[keyof Object];

function Switches() {
    const { t } = useI18n();
    const settings = useSettings(["useQuickCss", "uiSounds", "pixelStyle", "hideContributorBadge", "enableReactDevtools", "frameless", "winNativeTitleBar", "transparent", "winCtrlQ", "disableMinSize", "disableBackgroundMemoryTrim", "gpuRasterization"]);

    const Switches = [
        {
            key: "useQuickCss",
            title: t("Enable Custom CSS"),
        },
        {
            key: "uiSounds",
            title: t("Play quiet sounds in Endcord's settings"),
            description: t("A soft click on switches, and a tone when something succeeds or fails"),
        },
        {
            key: "pixelStyle",
            title: t("Pixel style"),
            description: t("Pixel corners, icons and lettering in Endcord's screens, like the installer"),
        },
        {
            key: "hideContributorBadge",
            title: t("Hide the Endcord badges"),
            description: t("Leaves the developer and contributor badges off every profile on this PC. Other people who use Endcord still see them"),
        },
        !IS_WEB && {
            key: "enableReactDevtools",
            title: t("Enable React Developer Tools"),
            restartRequired: true
        },
        // Endcord Desktop keeps its own window as it is (desktop/src/main.ts)
        IS_DISCORD_DESKTOP && (!IS_WINDOWS ? {
            key: "frameless",
            title: t("Disable the window frame"),
            restartRequired: true
        } : {
            key: "winNativeTitleBar",
            title: t("Use Windows' native title bar instead of Discord's custom one"),
            restartRequired: true
        }),
        IS_DISCORD_DESKTOP && {
            key: "transparent",
            title: t("Enable window transparency"),
            description: t("A theme that supports transparency is required or this will do nothing. Stops the window from being resizable as a side effect"),
            restartRequired: true
        },
        IS_DISCORD_DESKTOP && {
            key: "disableMinSize",
            title: t("Disable minimum window size"),
            restartRequired: true
        },
        IS_DISCORD_DESKTOP && IS_WINDOWS && {
            key: "winCtrlQ",
            title: t("Register Ctrl+Q as shortcut to close Discord (Alternative to Alt+F4)"),
            restartRequired: true
        },
        IS_DISCORD_DESKTOP && {
            key: "gpuRasterization",
            title: t("Paint the interface on the GPU"),
            description: t("Can make scrolling smoother on some graphics cards, but uses 50-80 MB more memory"),
            restartRequired: true
        },
        !IS_WEB && {
            key: "disableBackgroundMemoryTrim",
            title: t("Keep caches while Discord is minimized or in the tray"),
            description: t("By default Endcord frees cached memory a minute after the window is hidden"),
            restartRequired: true
        },
    ] satisfies Array<false | {
        key: KeysOfType<typeof settings, boolean>;
        title: string;
        description?: string;
        restartRequired?: boolean;
    }>;

    return Switches.map(setting => {
        if (!setting) {
            return null;
        }

        const { key, title, description, restartRequired } = setting;

        return (
            <FormSwitch
                key={key}
                title={title}
                description={description}
                value={settings[key]}
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
    });
}

function LanguageSection() {
    const { lang, t } = useI18n();

    return (
        <section className={Margins.bottom20}>
            <Forms.FormTitle tag="h5">{t("Language")}</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                {t("Select the language for Endcord and Discord.")}
            </Forms.FormText>
            <Select
                options={SUPPORTED_LANGUAGES.map(l => ({
                    label: `${l.nativeName} (${l.englishName})`,
                    value: l.code
                }))}
                closeOnSelect={true}
                select={v => setEndcordLanguage(v)}
                isSelected={v => v === lang}
                serialize={identity}
            />
        </section>
    );
}

// Shown with a real date, so each choice says what it looks like
const SAMPLE_DATE = new Date(2023, 2, 14);
const BADGE_DATE_FORMATS: BadgeDateFormat[] = ["numeric", "dmy", "mdy", "ymd", "long", "discord"];

function BadgeDateSection() {
    const { t } = useI18n();
    const settings = useSettings(["badgeDateFormat"]);

    const label = (format: BadgeDateFormat) => {
        if (format === "discord") return t("As Discord writes it");
        const sample = formatShortDate(SAMPLE_DATE, format);
        return format === "numeric" ? t("{date} (your language's order)", { date: sample }) : sample;
    };

    return (
        <section className={Margins.bottom20}>
            <Forms.FormTitle tag="h5">{t("Badge dates")}</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                {t("How badges write dates, like Nitro's \"Subscriber since\".")}
            </Forms.FormText>
            <Select
                options={BADGE_DATE_FORMATS.map(format => ({ label: label(format), value: format }))}
                closeOnSelect={true}
                select={(value: BadgeDateFormat) => settings.badgeDateFormat = value}
                isSelected={(value: BadgeDateFormat) => value === settings.badgeDateFormat}
                serialize={identity}
            />
        </section>
    );
}

function EndcordSettings() {
    const { t } = useI18n();
    const user = UserStore?.getCurrentUser();

    return (
        <SettingsTab>
            {IS_STANDALONE && !IS_UPDATER_DISABLED && <SecurityStatus />}

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

            <section>
                <Forms.FormTitle tag="h5">{t("Quick Actions")}</Forms.FormTitle>

                <QuickActionCard>
                    <QuickAction
                        Icon={ListIcon}
                        text={t("Notification Log")}
                        action={openNotificationLogModal}
                    />
                    <QuickAction
                        Icon={CodeIcon}
                        text={t("Edit QuickCSS")}
                        action={() => EndcordNative.quickCss.openEditor()}
                    />
                    {!IS_WEB && (
                        <>
                            <QuickAction
                                Icon={RestartPixelIcon}
                                text={t("Relaunch Discord")}
                                action={relaunch}
                            />
                            <QuickAction
                                Icon={FolderPixelIcon}
                                text={t("Open Settings Folder")}
                                action={() => EndcordNative.settings.openFolder()}
                            />
                        </>
                    )}
                    <QuickAction
                        Icon={GithubIcon}
                        text={t("View Source Code")}
                        action={() => EndcordNative.native.openExternal(REPO_URL)}
                    />
                </QuickActionCard>
            </section>

            <Divider />

            <section className={Margins.top16}>
                <LanguageSection />
                <BadgeDateSection />

                <Forms.FormTitle tag="h5">{t("Settings")}</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom20} style={{ color: "var(--text-muted)" }}>
                    {t("Hint: You can change the position of this settings section in the")}{" "}
                    <a onClick={() => openPluginModal(SettingsPlugin)}>
                        {t("settings of the Settings plugin")}
                    </a>!
                </Forms.FormText>

                <Switches />
            </section>


            <MacOSVibrancySettings />
            <WindowsMaterialSettings />

            <NotificationSection />
        </SettingsTab>
    );
}

export default wrapTab(EndcordSettings, "Endcord Settings");
