/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, GuildStore, Modal, openModal, React, showToast, Toasts, UserGuildSettingsStore, useState } from "@webpack/common";

import { FocusPanel } from "./FocusPanel";

const logger = new Logger("FocusMode");
const DS_STATE = "FocusMode_state";

const StatusSetting = getUserSettingLazy<string>("status", "status");
const { updateGuildNotificationSettings } = findByPropsLazy("updateGuildNotificationSettings");

export const settings = definePluginSettings({
    status: {
        type: OptionType.SELECT,
        description: "Status while Focus Mode is on",
        options: [
            { label: "Do Not Disturb", value: "dnd", default: true },
            { label: "Invisible", value: "invisible" },
            { label: "Idle", value: "idle" },
            { label: "Keep my current status", value: "keep" },
        ],
    },
    silenceNotifications: {
        type: OptionType.BOOLEAN,
        description: "Block desktop notifications and their sounds",
        default: true,
    },
    allowDirectMessages: {
        type: OptionType.BOOLEAN,
        description: "Still notify me about direct messages",
        default: false,
    },
    hideUnreadBadges: {
        type: OptionType.BOOLEAN,
        description: "Hide unread and mention badges",
        default: false,
        onChange: () => applyLocalFilters(),
    },
    mutedServers: {
        type: OptionType.STRING,
        description: "Servers to mute while Focus Mode is on",
        default: "",
        hidden: true,
    },
    scheduleEnabled: {
        type: OptionType.BOOLEAN,
        description: "Turn on automatically at set times",
        default: false,
        onChange: () => reschedule(),
    },
    scheduleStart: {
        type: OptionType.STRING,
        description: "Start time (24-hour, HH:MM)",
        default: "22:00",
        onChange: () => reschedule(),
    },
    scheduleEnd: {
        type: OptionType.STRING,
        description: "End time (24-hour, HH:MM)",
        default: "08:00",
        onChange: () => reschedule(),
    },
    showHeaderButton: {
        type: OptionType.BOOLEAN,
        description: "Show the Focus Mode button in the title bar",
        default: true,
        restartNeeded: true,
    },
});

// ---- state ----

interface FocusState {
    active: boolean;
    by?: "manual" | "schedule";
    since?: number;
    /** Status before Focus Mode changed it, restored when it ends */
    previousStatus?: string;
    /** Status Focus Mode set; if the user picks another one meanwhile, theirs is kept */
    appliedStatus?: string;
    /** Servers Focus Mode muted; servers that were already muted are never touched */
    mutedByUs?: string[];
    /** The schedule leaves Focus Mode off until this time after a manual turn-off */
    skipUntil?: number;
}

let state: FocusState = { active: false };
const listeners = new Set<() => void>();

function setState(next: FocusState) {
    state = next;
    DataStore.set(DS_STATE, state).catch(() => { });
    listeners.forEach(l => l());
}

export function useFocusState() {
    const [, force] = useState(0);
    React.useEffect(() => {
        const l = () => force(n => n + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
    }, []);
    return state;
}

export const getMutedServers = () => settings.store.mutedServers.split(",").map(s => s.trim()).filter(Boolean);
export const setMutedServers = (ids: string[]) => settings.store.mutedServers = ids.join(",");

// ---- turning it on and off ----

const notify = (text: string, type = Toasts.Type.MESSAGE) => showToast(text, type, { duration: 5000 });

async function applyStatus(): Promise<Pick<FocusState, "previousStatus" | "appliedStatus">> {
    const target = settings.store.status;
    if (target === "keep") return {};
    // Changing the status needs Discord's settings module; if it is missing, say so instead of working around it
    const current = StatusSetting?.getSetting();
    if (!StatusSetting || current == null) {
        notify(t("Focus Mode could not change your status on this Discord version. The other filters are on."), Toasts.Type.FAILURE);
        return {};
    }
    if (current === target) return {};
    try {
        await StatusSetting.updateSetting(target);
        return { previousStatus: current, appliedStatus: target };
    } catch (e) {
        logger.error("Failed to set status", e);
        notify(t("Discord did not accept the status change. The other filters are on."), Toasts.Type.FAILURE);
        return {};
    }
}

function muteServers() {
    const mutedByUs: string[] = [];
    for (const guildId of getMutedServers()) {
        if (!GuildStore.getGuild(guildId) || UserGuildSettingsStore.isMuted(guildId)) continue;
        try {
            updateGuildNotificationSettings(guildId, { muted: true });
            mutedByUs.push(guildId);
        } catch (e) {
            logger.error("Failed to mute server", guildId, e);
        }
    }
    return mutedByUs;
}

export async function turnOn(by: FocusState["by"] = "manual") {
    if (state.active) return;
    const status = await applyStatus();
    setState({ active: true, by, since: Date.now(), ...status, mutedByUs: muteServers() });
    applyLocalFilters();
    if (by === "manual") notify(t("Focus Mode is on"), Toasts.Type.SUCCESS);
}

export async function turnOff(manual = true) {
    if (!state.active) return;
    const { previousStatus, appliedStatus, mutedByUs = [] } = state;

    if (previousStatus && appliedStatus) {
        if (StatusSetting?.getSetting() === appliedStatus) {
            await StatusSetting.updateSetting(previousStatus).catch(e => logger.error("Failed to restore status", e));
        } else {
            notify(t("You changed your status during Focus Mode, so it was kept."));
        }
    }
    for (const guildId of mutedByUs) {
        if (!UserGuildSettingsStore.isMuted(guildId)) continue;
        try { updateGuildNotificationSettings(guildId, { muted: false }); } catch (e) { logger.error("Failed to unmute server", guildId, e); }
    }

    // Turned off by hand during the scheduled time: stay off until that time is over
    const window = currentWindow();
    setState({ active: false, skipUntil: manual && window ? window.end : undefined });
    applyLocalFilters();
    if (manual) notify(t("Focus Mode is off. Your previous settings are back."), Toasts.Type.SUCCESS);
}

export const toggle = () => state.active ? turnOff() : turnOn();

// ---- local filters: notifications and badges, nothing leaves the client ----

function notificationInterceptor(action: any) {
    if (action?.type !== "NOTIFICATION_CREATE" || !state.active || !settings.store.silenceNotifications) return false;
    if (settings.store.allowDirectMessages) {
        const channel = ChannelStore.getChannel(action.trackingProps?.channel_id);
        if (channel?.isPrivate?.()) return false;
    }
    return true; // swallow the notification
}

function applyLocalFilters() {
    document.body.classList.toggle("ec-focus-hide-badges", state.active && settings.store.hideUnreadBadges);
}

// ---- schedule ----

function parseTime(value: string) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    return h < 24 && min < 60 ? h * 60 + min : null;
}

/** The scheduled window containing now, if any, as absolute times */
function currentWindow(now = new Date()) {
    if (!settings.store.scheduleEnabled) return null;
    const start = parseTime(settings.store.scheduleStart), end = parseTime(settings.store.scheduleEnd);
    if (start == null || end == null || start === end) return null;

    const minutes = now.getHours() * 60 + now.getMinutes();
    const at = (dayOffset: number, m: number) => {
        const d = new Date(now);
        d.setDate(d.getDate() + dayOffset);
        d.setHours(Math.floor(m / 60), m % 60, 0, 0);
        return d.getTime();
    };
    if (start < end) return minutes >= start && minutes < end ? { start: at(0, start), end: at(0, end) } : null;
    // Overnight, e.g. 22:00 - 08:00
    if (minutes >= start) return { start: at(0, start), end: at(1, end) };
    if (minutes < end) return { start: at(-1, start), end: at(0, end) };
    return null;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export function reschedule() {
    clearTimeout(timer);
    timer = undefined;
    const window = currentWindow();
    const now = Date.now();

    if (window && !state.active && !(state.skipUntil && state.skipUntil > now)) turnOn("schedule");
    else if (!window && state.active && state.by === "schedule") turnOff(false);

    if (!settings.store.scheduleEnabled) return;
    // Wake up at the next minute boundary, at most hourly; cheap and robust against sleep and clock changes
    const delay = Math.min(60 * 60_000, 60_000 - (now % 60_000) + 500);
    timer = setTimeout(reschedule, delay);
}

// ---- UI ----

export function FocusIcon({ active, ...props }: { active?: boolean; width?: number; height?: number; }) {
    return (
        <svg viewBox="0 0 24 24" width={props.width ?? 20} height={props.height ?? 20} className={active ? "ec-focus-icon-active" : undefined}>
            <path fill="currentColor" d="M12.5 3a8.97 8.97 0 0 0-1.62 5.15A9 9 0 0 0 19.9 17a9 9 0 1 1-7.4-14Z" />
            {active && <circle cx="18.5" cy="5.5" r="3" fill="var(--status-positive, #23a55a)" />}
        </svg>
    );
}

function HeaderButton() {
    const { active } = useFocusState();
    return (
        <HeaderBarButton
            icon={p => <FocusIcon {...p} active={active} />}
            tooltip={active ? t("Focus Mode is on. Click to turn off, right-click for options") : t("Turn on Focus Mode")}
            onClick={toggle}
            onContextMenu={openFocusPanel}
            selected={active}
        />
    );
}

export function openFocusPanel() {
    openModal(props => (
        <Modal {...props} title={t("Focus Mode")} subtitle={t("Quiet Discord down with one switch, and get everything back the way it was.")} size="md"
            actions={[{ text: t("Done"), variant: "primary", onClick: props.onClose }]}>
            <FocusPanel />
        </Modal>
    ));
}

export default definePlugin({
    name: "FocusMode",
    description: "One switch for Do Not Disturb, quiet notifications, muted servers and hidden badges, on a schedule if you like, and back to your previous settings when it ends.",
    tags: ["Utility", "Notifications"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.Sharp],
    searchTerms: ["dnd", "do not disturb", "privacy", "quiet", "focus", "odak"],
    dependencies: ["UserSettingsAPI", "HeaderBarAPI"],
    settings,

    // The plugin page already lists the options; add the switch and the server list it cannot show
    settingsAboutComponent: () => <FocusPanel inSettings />,

    toolboxActions: {
        "Toggle Focus Mode": toggle,
        "Focus Mode settings": openFocusPanel,
    },

    async start() {
        state = await DataStore.get(DS_STATE) ?? { active: false };
        FluxDispatcher.addInterceptor(notificationInterceptor);
        applyLocalFilters();
        if (settings.store.showHeaderButton) addHeaderBarButton("FocusMode", () => <HeaderButton />, 8);
        reschedule();
    },

    stop() {
        clearTimeout(timer);
        const i = FluxDispatcher._interceptors.indexOf(notificationInterceptor);
        if (i > -1) FluxDispatcher._interceptors.splice(i, 1);
        removeHeaderBarButton("FocusMode");
        document.body.classList.remove("ec-focus-hide-badges");
        // Disabling the plugin ends Focus Mode properly instead of leaving servers muted
        if (state.active) turnOff(false);
    },
});
