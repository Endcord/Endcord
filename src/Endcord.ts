/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// DO NOT REMOVE UNLESS YOU WISH TO FACE THE WRATH OF THE CIRCULAR DEPENDENCY DEMON!!!!!!!
import "~plugins";
import "./discordTokens.css";
import "./endcordTheme.css";
import "./endcordUi.css";
import "./fixWeirdAppRegionBug.css";
import "./perf.css";

export * as Api from "./api";
export * as Plugins from "./api/PluginManager";
export * as Components from "./components";
export * as Util from "./utils";
export * as Updater from "./utils/updater";
export * as Webpack from "./webpack";
export * as WebpackPatcher from "./webpack/patchWebpack";
export { PlainSettings, Settings };

import { watchPluginHealth } from "@api/PluginHealth";
import { IS_SAFE_MODE, watchStart } from "@api/SafeMode";
import { maybeTakeDailySnapshot } from "@api/SettingsSnapshots";
import { coreStyleRootNode, initStyles } from "@api/Styles";
import { installDelight } from "@components/delight";
import { showSafeModeScreen } from "@components/safeMode";
import { openSettingsTabModal, UpdaterTab } from "@components/settings";
import { installShortcutsHotkey } from "@components/shortcuts";
import { maybeShowWhatsNew } from "@components/whatsNew";
import { debounce } from "@shared/debounce";
import { IS_WINDOWS } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import { installFrameLimiter } from "@utils/frameLimiter";
import { StartAt } from "@utils/types";
import { SettingsRouter } from "@webpack/common";

import { get as dsGet } from "./api/DataStore";
import { NotificationData, showNotification } from "./api/Notifications";
import { initPluginManager, PMLogger, startAllPlugins } from "./api/PluginManager";
import { PlainSettings, Settings, SettingsStore } from "./api/Settings";
import { areLocalSettingsDirty, getCloudSettings, getCloudSyncDirection, markLocalSettingsDirty, putCloudSettings, shouldCloudSync } from "./api/SettingsSync/cloudSync";
import { getCurrentLang, syncDiscordLocale, t } from "./utils/i18n";
import { relaunch } from "./utils/native";
import { checkForUpdates, update, UpdateLogger } from "./utils/updater";
import { onceReady } from "./webpack";
import { patches } from "./webpack/patchWebpack";
if (IS_REPORTER) {
    require("./debug/runReporter");
}

async function syncSettings() {
    // pre-check for local shared settings
    if (
        Settings.cloud.authenticated &&
        !await dsGet("Endcord_cloudSecret") // this has been enabled due to local settings share or some other bug
    ) {
        // show a notification letting them know and tell them how to fix it
        showNotification({
            title: t("Cloud Integrations"),
            body: "We've noticed you have cloud integrations enabled in another client! Due to limitations, you will " +
                "need to re-authenticate to continue using them. Click here to go to the settings page to do so!",
            color: "var(--yellow-360)",
            onClick: () => SettingsRouter.openUserSettings("endcord_cloud_panel")
        });
        return;
    }

    if (
        Settings.cloud.settingsSync && // if it's enabled
        Settings.cloud.authenticated && // if cloud integrations are enabled
        getCloudSyncDirection() !== "manual" // if we're not in manual mode
    ) {
        if (areLocalSettingsDirty() && shouldCloudSync("push")) {
            await putCloudSettings();
        } else if (shouldCloudSync("pull") && await getCloudSettings(false)) { // if we synchronized something (false means no sync)
            // we show a notification here instead of allowing getCloudSettings() to show one to declutter the amount of
            // potential notifications that might occur. getCloudSettings() will always send a notification regardless if
            // there was an error to notify the user, but besides that we only want to show one notification instead of all
            // of the possible ones it has (such as when your settings are newer).
            showNotification({
                title: t("Cloud Settings"),
                body: t("Your settings have been updated! Click here to restart to fully apply changes!"),
                color: "var(--green-360)",
                onClick: relaunch
            });
        }
    }

    const saveSettingsOnFrequentAction = debounce(async () => {
        if (Settings.cloud.settingsSync && Settings.cloud.authenticated && shouldCloudSync("push")) {
            await putCloudSettings();
        }
    }, 60_000);

    SettingsStore.addGlobalChangeListener(() => {
        markLocalSettingsDirty();
        saveSettingsOnFrequentAction();
    });
}

let notifiedForUpdatesThisSession = false;

async function runUpdateCheck() {
    if (IS_UPDATER_DISABLED) return;

    const notify = (data: NotificationData) => {
        if (notifiedForUpdatesThisSession) return;
        notifiedForUpdatesThisSession = true;

        setTimeout(() => showNotification({
            permanent: true,
            noPersist: true,
            ...data
        }), 10_000);
    };

    try {
        const isOutdated = await checkForUpdates();
        if (!isOutdated) return;

        if (Settings.autoUpdate) {
            await update();
            if (Settings.autoUpdateNotification) {
                notify({
                    title: t("Endcord has been updated!"),
                    body: t("Click here to restart"),
                    onClick: relaunch
                });
            }
            return;
        }

        notify({
            title: t("An Endcord update is available!"),
            body: t("Click here to view the update"),
            onClick: () => openSettingsTabModal(UpdaterTab!)
        });
    } catch (err) {
        UpdateLogger.error("Failed to check for updates", err);
    }
}

async function init() {
    await onceReady;

    installDelight();
    installShortcutsHotkey();
    startAllPlugins(StartAt.WebpackReady);

    // A day's settings are worth keeping once they've proven to start
    watchStart(() => !IS_SAFE_MODE && maybeTakeDailySnapshot());
    // Discord's screen comes up a moment after its code is ready, and the dialog needs it
    if (IS_SAFE_MODE) setTimeout(showSafeModeScreen, 2_000);
    else if (!IS_REPORTER) {
        watchPluginHealth();
        // Required late: it reaches into Theme Studio, a plugin, which this file mustn't load while plugins load
        if (Settings.welcomePending) setTimeout(() => (require("@components/welcome") as typeof import("@components/welcome")).maybeShowWelcome(), 2_000);
    }

    // Tells the updater this release works, otherwise it goes back to the last one after a few tries
    if (!IS_UPDATER_DISABLED && IS_STANDALONE) {
        EndcordNative.updater.confirmUpdate().then(justUpdated => {
            if (!IS_SAFE_MODE) return maybeShowWhatsNew(justUpdated);
        }).catch(() => { });

        // Going back happens before any page is up, so this is where the person finds out
        EndcordNative.updater.takeRollbackNotice().then(notice => notice && showNotification({
            title: t("An Endcord update was undone"),
            body: t("Release {hash} didn't start on this PC, so the version before it is running again. The next release will be tried again.", { hash: notice.hash }),
            permanent: true,
            noPersist: true
        })).catch(() => { });
    }

    try {
        syncDiscordLocale(getCurrentLang());
    } catch { }

    syncSettings();

    if (!IS_WEB && !IS_UPDATER_DISABLED) {
        runUpdateCheck();

        // Check for updates in the background every 15 minutes for all users
        setInterval(runUpdateCheck, 1000 * 60 * 15); // 15 minutes
    }

    if (IS_DEV) {
        const pendingPatches = patches.filter(p => !p.all && p.predicate?.() !== false);
        if (pendingPatches.length)
            PMLogger.warn(
                "Webpack has finished initialising, but some patches haven't been applied yet.",
                "This might be expected since some Modules are lazy loaded, but please verify",
                "that all plugins are working as intended.",
                "You are seeing this warning because this is a Development build of Endcord.",
                "\nThe following patches have not been applied:",
                `\n\n${pendingPatches.map(p => `${p.plugin}: ${p.find}`).join("\n")}`
            );
    }
}

if (IS_DISCORD_DESKTOP) installFrameLimiter();

initPluginManager();
initStyles();

// Endcord's screens are smooth unless pixel style is on. An attribute, so Discord resetting its own classes can't drop it.
// Endcord starts before the page has an <html>, so it's set again once there is one
const applyPixelStyle = () => document.documentElement?.toggleAttribute("data-ec-pixel", Settings.pixelStyle);
applyPixelStyle();
SettingsStore.addChangeListener("pixelStyle", applyPixelStyle);
startAllPlugins(StartAt.Init);
init();

document.addEventListener("DOMContentLoaded", () => {
    applyPixelStyle();
    startAllPlugins(StartAt.DOMContentLoaded);

    // FIXME
    if (IS_DISCORD_DESKTOP && Settings.winNativeTitleBar && IS_WINDOWS) {
        createAndAppendStyle("endcord-native-titlebar-style", coreStyleRootNode).textContent = "[class*=titleBar]{display: none!important}";
    }
}, { once: true });
