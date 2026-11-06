/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css?screen";

import { isPluginEnabled } from "@api/PluginManager";
import { PlainSettings } from "@api/Settings";
import { EndcordModal } from "@components/EndcordModal";
import { RenderModalProps } from "@endcord/discord-types";
import { IS_MAC, IS_WINDOWS } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { t, useI18n } from "@utils/i18n";
import { openModal } from "@webpack/common";

const cl = classNameFactory("ec-shortcuts-");

const MOD = IS_MAC ? "⌘" : "Ctrl";

interface Shortcut {
    keys: string[];
    label: string;
}

interface ShortcutGroup {
    title: string;
    shortcuts: Shortcut[];
}

const KEY_NAMES: Record<string, string> = {
    ctrl: "Ctrl", control: "Ctrl", meta: "⌘", cmd: "⌘", shift: "Shift", alt: IS_MAC ? "⌥" : "Alt",
    arrowup: "↑", arrowdown: "↓", tab: "Tab", delete: "Delete", esc: "Esc", escape: "Esc", space: "Space"
};

const keyName = (key: string) => KEY_NAMES[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1).toLowerCase());

/** "CTRL+SHIFT+TAB" or ["ctrl", "shift", "p"] as the keys to show */
const parseKeys = (combo: unknown) => (Array.isArray(combo) ? combo : String(combo ?? "").split("+")).filter(Boolean).map(key => keyName(String(key)));

const pluginSetting = (plugin: string, key: string) => PlainSettings.plugins[plugin]?.[key];

/** Only what's on right now, read from settings, so listing them loads no plugin */
function collectShortcuts(): ShortcutGroup[] {
    const endcord: Shortcut[] = [
        { keys: [MOD, "Shift", "/"], label: t("Show this list") }
    ];

    if (isPluginEnabled("CommandPalette")) {
        const hotkey = pluginSetting("CommandPalette", "hotkey");
        endcord.push({ keys: Array.isArray(hotkey) && hotkey.length ? parseKeys(hotkey) : [MOD, "Shift", "P"], label: t("Open the command palette") });
    }
    if (isPluginEnabled("HideEndcord")) endcord.push({ keys: ["F8"], label: t("Hide or show Endcord's settings") });
    if (IS_WINDOWS && !IS_WEB && PlainSettings.winCtrlQ) endcord.push({ keys: ["Ctrl", "Q"], label: t("Close Discord") });

    const messages: Shortcut[] = [];
    if (isPluginEnabled("QuickReply")) {
        messages.push(
            { keys: [MOD, "↑"], label: t("Reply to the message above") },
            { keys: [MOD, "Shift", "↑"], label: t("Edit your message above") }
        );
    }
    if (isPluginEnabled("QuickDelete")) {
        messages.push({
            keys: pluginSetting("QuickDelete", "keybind") === "ctrlShiftDelete" ? ["Ctrl", "Shift", "Delete"] : [keyName("alt"), "Delete"],
            label: t("Delete your last message")
        });
    }

    const navigation: Shortcut[] = [];
    if (isPluginEnabled("ChannelTabs")) {
        const tab = (enabledKey: string, key: string, fallback: string, label: string) => {
            if (pluginSetting("ChannelTabs", enabledKey) === false) return;
            navigation.push({ keys: parseKeys(pluginSetting("ChannelTabs", key) ?? fallback), label });
        };
        tab("enableNewTabShortcut", "newTabKeybind", "CTRL+T", t("Open a new tab"));
        tab("enableCloseTabShortcut", "closeTabKeybind", "CTRL+W", t("Close the tab"));
        tab("enableTabCycleShortcut", "cycleTabForwardKeybind", "CTRL+TAB", t("Next tab"));
        tab("enableTabCycleShortcut", "cycleTabBackwardKeybind", "CTRL+SHIFT+TAB", t("Previous tab"));
    }
    if (isPluginEnabled("RecentChannelSwitcher")) {
        navigation.push(
            { keys: ["Ctrl", "Tab"], label: t("Your recent chats, newest first") },
            { keys: ["Ctrl", "Shift", "Tab"], label: t("Your recent chats, the other way") }
        );
    }

    return [
        { title: "Endcord", shortcuts: endcord },
        { title: t("Messages"), shortcuts: messages },
        { title: t("Getting around"), shortcuts: navigation }
    ].filter(group => group.shortcuts.length);
}

function ShortcutsModal({ onClose, transitionState }: RenderModalProps) {
    const { t } = useI18n();
    const groups = collectShortcuts();

    return (
        <EndcordModal
            transitionState={transitionState}
            onClose={onClose}
            size="md"
            title={t("Keyboard shortcuts")}
            subtitle={t("Endcord's and those of the plugins you have on. Discord's own are under {keys}.", { keys: `${MOD}+/` })}
            actions={[{ text: t("Close"), variant: "primary", onClick: onClose }]}
        >
            {groups.map(({ title, shortcuts }) => (
                <section key={title} className={cl("group")}>
                    <h3 className={cl("title")}>{title}</h3>
                    <ul className={cl("list")}>
                        {shortcuts.map(({ keys, label }) => (
                            <li key={label} className={cl("row")}>
                                <span>{label}</span>
                                <span className={cl("keys")}>
                                    {keys.map((key, i) => <kbd key={i} className={cl("key")}>{key}</kbd>)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </EndcordModal>
    );
}

let isOpen = false;

export function openShortcutsModal() {
    if (isOpen) return;
    isOpen = true;
    openModal(props => <ShortcutsModal {...props} />, { onCloseCallback: () => isOpen = false });
}

/** Ctrl+Shift+/, next to Discord's own Ctrl+/ */
export function installShortcutsHotkey() {
    document.addEventListener("keydown", event => {
        if (event.code !== "Slash" || !event.shiftKey || event.altKey || !(IS_MAC ? event.metaKey : event.ctrlKey)) return;

        event.preventDefault();
        event.stopPropagation();
        openShortcutsModal();
    }, true);
}
