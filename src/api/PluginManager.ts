/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addAudioProcessor, removeAudioProcessor } from "@api/AudioPlayer";
import { addProfileBadge, removeProfileBadge } from "@api/Badges";
import { addChatBarButton, addChatBarButtonWrapper, removeChatBarButton, removeChatBarButtonWrapper } from "@api/ChatButtons";
import { registerCommand, unregisterCommand } from "@api/Commands";
import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import { addChannelToolbarButton, addHeaderBarButton, removeChannelToolbarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { addMessageAccessory, removeMessageAccessory } from "@api/MessageAccessories";
import { addMessageDecoration, removeMessageDecoration } from "@api/MessageDecorations";
import { addMessageClickListener, addMessagePreEditListener, addMessagePreSendListener, removeMessageClickListener, removeMessagePreEditListener, removeMessagePreSendListener } from "@api/MessageEvents";
import { addMessagePopoverButton, removeMessagePopoverButton } from "@api/MessagePopover";
import { addNicknameIcon, removeNicknameIcon } from "@api/NicknameIcons";
import { addProfileCollection, removeProfileCollection } from "@api/ProfileCollections";
import { addProfileSection, removeProfileSection } from "@api/ProfileSections";
import { Settings, SettingsStore } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { addUserAreaButton, removeUserAreaButton } from "@api/UserArea";
import { traceFunction } from "@debug/Tracer";
import { FluxEvents } from "@endcord/discord-types";
import { Logger } from "@utils/Logger";
import { onlyOnce } from "@utils/onlyOnce";
import { canonicalizeFind, canonicalizeReplacement } from "@utils/patches";
import { DefinedSettings, Patch, Plugin, PluginDef, PluginSettingDef, ReporterTestable, StartAt } from "@utils/types";
import { FluxDispatcher } from "@webpack/common";
import { patches } from "@webpack/patcher";

import Plugins, { getPluginFlag, isPluginLoaded, PluginMeta, setPluginLoadHook } from "~plugins";
export { Plugins as plugins };
const logger = new Logger("PluginManager", "#a6d189");

/** Plain CSS imported inside a plugin folder, registered at build time and only injected while that plugin runs */
function getFolderStyles(name: string): string[] {
    const folder = PluginMeta[name]?.folderName;
    return (folder && window.EndcordPluginStyles?.[folder]) || [];
}

export const PMLogger = logger;

/** Whether we have subscribed to flux events of all the enabled plugins when FluxDispatcher was ready */
let enabledPluginsSubscribedFlux = false;
const subscribedFluxEventsPlugins = new Set<string>();

export function isPluginEnabled(p: string) {
    // Must not load lazy plugins: this runs for every plugin at startup.
    // A plugin can only be a dependency once something loaded it.
    return (
        getPluginFlag(p, "required") ||
        (isPluginLoaded(p) && Plugins[p]?.isDependency) ||
        Settings.plugins[p]?.enabled
    ) ?? false;
}

export function isSettingHidden(settings: DefinedSettings, setting: PluginSettingDef) {
    if (!("hidden" in setting)) return false;

    return typeof setting.hidden === "function"
        ? setting.hidden.call(settings)
        : Boolean(setting.hidden);
}

export function isSettingDisabled(settings: DefinedSettings, setting: PluginSettingDef) {
    if (!("disabled" in setting)) return false;

    return typeof setting.disabled === "function"
        ? setting.disabled.call(settings)
        : Boolean(setting.disabled);
}

export function hasAnyVisibleSettings({ settings }: Plugin) {
    return !!settings && Object.values(settings.def).some(s => !isSettingHidden(settings, s));
}

export function addPatch(newPatch: Omit<Patch, "plugin">, pluginName: string, pluginPath = `Endcord.Plugins.plugins[${JSON.stringify(pluginName)}]`) {
    // TODO: this causes crashes
    if (pluginName === "Vesktop" && newPatch.find === ".STREAMING_AUTO_STREAMER_MODE,") return;

    const patch = newPatch as Patch;
    patch.plugin = pluginName;

    if (IS_REPORTER) {
        delete patch.predicate;
        delete patch.group;
    }

    if (patch.predicate && !patch.predicate()) return;

    canonicalizeFind(patch);
    if (!Array.isArray(patch.replacement)) {
        patch.replacement = [patch.replacement];
    }

    for (const replacement of patch.replacement) {
        canonicalizeReplacement(replacement, pluginPath);

        if (IS_REPORTER) {
            delete replacement.predicate;
        }
    }

    patch.replacement = patch.replacement.filter(({ predicate }) => !predicate || predicate());

    patches.push(patch);
}

function isReporterTestable(p: Plugin, part: ReporterTestable) {
    return p.reporterTestable == null
        ? true
        : (p.reporterTestable & part) === part;
}

export function pluginRequiresRestart(p: Plugin) {
    return p.requiresRestart !== false && (p.requiresRestart || !!p.patches?.length);
}

export const startAllPlugins = traceFunction("startAllPlugins", function startAllPlugins(target: StartAt) {
    logger.info(`Starting plugins (stage ${target})`);
    for (const name in Plugins) {
        if (isPluginEnabled(name) && (!IS_REPORTER || isReporterTestable(Plugins[name], ReporterTestable.Start))) {
            const p = Plugins[name];

            const startAt = p.startAt ?? StartAt.WebpackReady;
            if (startAt !== target) continue;

            startPlugin(Plugins[name]);
        }
    }
});

export function startDependenciesRecursive(p: Plugin) {
    const settings = Settings.plugins;
    let restartNeeded = false;
    const failures: string[] = [];

    p.dependencies?.forEach(d => {
        if (!settings[d].enabled) {
            const dep = Plugins[d];
            startDependenciesRecursive(dep);

            // If the plugin has patches, don't start the plugin, just enable it.
            settings[d].enabled = true;
            dep.isDependency = true;

            if (pluginRequiresRestart(dep)) {
                logger.warn(`Enabling dependency ${d} requires restart.`);
                restartNeeded = true;
                return;
            }

            const result = startPlugin(dep);
            if (!result) failures.push(d);
        }
    });

    return { restartNeeded, failures };
}

export function subscribePluginFluxEvents(p: Plugin, fluxDispatcher: typeof FluxDispatcher) {
    if (p.flux && !subscribedFluxEventsPlugins.has(p.name) && (!IS_REPORTER || isReporterTestable(p, ReporterTestable.FluxEvents))) {
        subscribedFluxEventsPlugins.add(p.name);

        logger.debug("Subscribing to flux events of plugin", p.name);
        for (const [event, handler] of Object.entries(p.flux)) {
            const wrappedHandler = p.flux[event] = function () {
                try {
                    const res = handler!.apply(p, arguments as any);
                    return res instanceof Promise
                        ? res.catch(e => logger.error(`${p.name}: Error while handling ${event}\n`, e))
                        : res;
                } catch (e) {
                    logger.error(`${p.name}: Error while handling ${event}\n`, e);
                }
            };

            fluxDispatcher.subscribe(event as FluxEvents, wrappedHandler);
        }
    }
}

export function unsubscribePluginFluxEvents(p: Plugin, fluxDispatcher: typeof FluxDispatcher) {
    if (p.flux) {
        subscribedFluxEventsPlugins.delete(p.name);

        logger.debug("Unsubscribing from flux events of plugin", p.name);
        for (const [event, handler] of Object.entries(p.flux)) {
            fluxDispatcher.unsubscribe(event as FluxEvents, handler!);
        }
    }
}

export function subscribeAllPluginsFluxEvents(fluxDispatcher: typeof FluxDispatcher) {
    enabledPluginsSubscribedFlux = true;

    for (const name in Plugins) {
        if (!isPluginEnabled(name)) continue;
        subscribePluginFluxEvents(Plugins[name], fluxDispatcher);
    }
}

export const startPlugin = traceFunction("startPlugin", function startPlugin(p: Plugin) {
    const {
        name, commands, contextMenus, managedStyle, userProfileBadge,
        onBeforeMessageEdit, onBeforeMessageSend, onMessageClick,
        chatBarButton, renderMemberListDecorator, renderMessageAccessory, renderMessageDecoration, messagePopoverButton,
        renderNicknameIcon, headerBarButton, audioProcessor, userAreaButton, renderProfileCollection, chatBarButtonWrapper,
        renderProfileSection
    } = p;

    if (p.start) {
        logger.info("Starting plugin", name);
        if (p.started) {
            logger.warn(`${name} already started`);
            return false;
        }
        try {
            p.start();
        } catch (e) {
            logger.error(`Failed to start ${name}\n`, e);
            return false;
        }
    }

    p.started = true;

    if (commands?.length) {
        logger.debug("Registering commands of plugin", name);
        for (const cmd of commands) {
            try {
                registerCommand(cmd, name);
            } catch (e) {
                logger.error(`Failed to register command ${cmd.name}\n`, e);
                return false;
            }
        }
    }

    if (enabledPluginsSubscribedFlux) {
        subscribePluginFluxEvents(p, FluxDispatcher);
    }

    if (contextMenus) {
        logger.debug("Adding context menus patches of plugin", name);
        for (const navId in contextMenus) {
            addContextMenuPatch(navId, contextMenus[navId]);
        }
    }

    if (managedStyle) enableStyle(managedStyle);
    for (const style of getFolderStyles(name)) enableStyle(style);

    if (userProfileBadge) addProfileBadge(userProfileBadge);
    const customBadges = (p as any).userProfileBadges;
    if (customBadges && Array.isArray(customBadges)) {
        for (const b of customBadges) {
            addProfileBadge(b);
        }
    }

    if (onBeforeMessageEdit) addMessagePreEditListener(onBeforeMessageEdit);
    if (onBeforeMessageSend) addMessagePreSendListener(onBeforeMessageSend);
    if (onMessageClick) addMessageClickListener(onMessageClick);

    if (chatBarButton) addChatBarButton(name, chatBarButton.render, chatBarButton.icon);
    if (renderMemberListDecorator) addMemberListDecorator(name, renderMemberListDecorator);
    if (renderMessageDecoration) addMessageDecoration(name, renderMessageDecoration);
    if (renderMessageAccessory) addMessageAccessory(name, renderMessageAccessory);
    if (messagePopoverButton) addMessagePopoverButton(name, messagePopoverButton.render, messagePopoverButton.icon);
    if (renderNicknameIcon) addNicknameIcon(name, renderNicknameIcon);
    if (headerBarButton) {
        if (headerBarButton.location === "channeltoolbar") addChannelToolbarButton(name, headerBarButton.render, headerBarButton.priority);
        else addHeaderBarButton(name, headerBarButton.render, headerBarButton.priority);
    }
    if (audioProcessor) addAudioProcessor(name, audioProcessor);
    if (userAreaButton) addUserAreaButton(name, userAreaButton.render, userAreaButton.priority);
    if (renderProfileCollection) addProfileCollection(name, renderProfileCollection.render, renderProfileCollection.priority);
    if (chatBarButtonWrapper) addChatBarButtonWrapper(name, chatBarButtonWrapper.wrapper, chatBarButtonWrapper.priority);
    if (renderProfileSection) addProfileSection(name, renderProfileSection.render, renderProfileSection.priority);

    return true;
}, p => `startPlugin ${p.name}`);

export const stopPlugin = traceFunction("stopPlugin", function stopPlugin(p: Plugin) {
    const {
        name, commands, contextMenus, managedStyle, userProfileBadge,
        onBeforeMessageEdit, onBeforeMessageSend, onMessageClick,
        chatBarButton, renderMemberListDecorator, renderMessageAccessory, renderMessageDecoration, messagePopoverButton,
        renderNicknameIcon, headerBarButton, audioProcessor, userAreaButton, renderProfileCollection, chatBarButtonWrapper,
        renderProfileSection
    } = p;

    if (p.stop) {
        logger.info("Stopping plugin", name);
        if (!p.started) {
            logger.warn(`${name} already stopped`);
            return false;
        }
        try {
            p.stop();
        } catch (e) {
            logger.error(`Failed to stop ${name}\n`, e);
            return false;
        }
    }

    p.started = false;

    if (commands?.length) {
        logger.debug("Unregistering commands of plugin", name);
        for (const cmd of commands) {
            try {
                unregisterCommand(cmd.name);
            } catch (e) {
                logger.error(`Failed to unregister command ${cmd.name}\n`, e);
                return false;
            }
        }
    }

    unsubscribePluginFluxEvents(p, FluxDispatcher);

    if (contextMenus) {
        logger.debug("Removing context menus patches of plugin", name);
        for (const navId in contextMenus) {
            removeContextMenuPatch(navId, contextMenus[navId]);
        }
    }

    if (managedStyle) disableStyle(managedStyle);
    for (const style of getFolderStyles(name)) disableStyle(style);

    if (userProfileBadge) removeProfileBadge(userProfileBadge);
    const customBadgesToRemove = (p as any).userProfileBadges;
    if (customBadgesToRemove && Array.isArray(customBadgesToRemove)) {
        for (const b of customBadgesToRemove) {
            removeProfileBadge(b);
        }
    }

    if (onBeforeMessageEdit) removeMessagePreEditListener(onBeforeMessageEdit);
    if (onBeforeMessageSend) removeMessagePreSendListener(onBeforeMessageSend);
    if (onMessageClick) removeMessageClickListener(onMessageClick);

    if (chatBarButton) removeChatBarButton(name);
    if (renderMemberListDecorator) removeMemberListDecorator(name);
    if (renderMessageDecoration) removeMessageDecoration(name);
    if (renderMessageAccessory) removeMessageAccessory(name);
    if (messagePopoverButton) removeMessagePopoverButton(name);
    if (renderNicknameIcon) removeNicknameIcon(name);
    if (headerBarButton) {
        if (headerBarButton.location === "channeltoolbar") removeChannelToolbarButton(name);
        else removeHeaderBarButton(name);
    }
    if (audioProcessor) removeAudioProcessor(name);
    if (userAreaButton) removeUserAreaButton(name);
    if (renderProfileCollection) removeProfileCollection(name);
    if (chatBarButtonWrapper) removeChatBarButtonWrapper(name);
    if (renderProfileSection) removeProfileSection(name);

    return true;
}, p => `stopPlugin ${p.name}`);

function bindPluginSettings(p: Plugin) {
    if (!p.settings) return;
    p.settings.pluginName = p.name;

    try {
        for (const [key, def] of Object.entries(p.settings.def ?? {})) {
            if (def.onChange)
                SettingsStore.addChangeListener(`plugins.${p.name}.${key}`, def.onChange);
        }
    } catch (e) {
        logger.error(`Failed to bind settings for ${p.name}\n`, e);
    }
}

let pluginNameByFolder: Map<string, string> | undefined;

function onPluginLoaded(p: Plugin) {
    bindPluginSettings(p);

    // Code imported from another plugin's folder may use that plugin's settings, so load it alongside
    const loadsWith = PluginMeta[p.name]?.loadsWith;
    if (!loadsWith) return;

    pluginNameByFolder ??= new Map(Object.entries(PluginMeta).map(([name, meta]) => [meta.folderName, name]));
    for (const folder of loadsWith) {
        const name = pluginNameByFolder.get(folder);
        if (name) void Plugins[name];
    }
}

export const initPluginManager = onlyOnce(function init() {
    const settings = Settings.plugins;

    // Lazy plugins only get evaluated when something reads them, so bind their settings at that moment.
    // Iterate names below and only read plugin objects that are enabled, to keep disabled ones unloaded.
    setPluginLoadHook(onPluginLoaded);

    // A lazy plugin that renames or absorbs another plugin's settings runs that migration when its module loads.
    // Load it now if those old settings exist, so it is seen as enabled below.
    const { plugins: storedPlugins } = SettingsStore.plain;
    for (const name in PluginMeta) {
        if (PluginMeta[name].migratesFrom?.some(old => old in storedPlugins)) void Plugins[name];
    }

    const pluginKeysToBind: Array<keyof PluginDef & `${"on" | "render"}${string}`> = [
        "onBeforeMessageEdit", "onBeforeMessageSend", "onMessageClick",
        "renderMemberListDecorator", "renderMessageAccessory", "renderMessageDecoration", "renderNicknameIcon"
    ];

    const neededApiPlugins = new Set<string>();

    // First round-trip to mark and force enable dependencies
    //
    // FIXME: might need to revisit this if there's ever nested (dependencies of dependencies) dependencies since this only
    // goes for the top level and their children, but for now this works okay with the current API plugins
    for (const name in Plugins) if (isPluginEnabled(name)) {
        const p = Plugins[name];
        p.dependencies?.forEach(d => {
            const dep = Plugins[d];

            if (!dep) {
                const error = new Error(`Plugin ${p.name} has unresolved dependency ${d}`);

                if (IS_DEV) {
                    throw error;
                }

                logger.warn(error);
                return;
            }

            settings[d].enabled = true;
            dep.isDependency = true;
        });

        if (p.commands?.length) neededApiPlugins.add("CommandsAPI");
        if (p.onBeforeMessageEdit || p.onBeforeMessageSend || p.onMessageClick) neededApiPlugins.add("MessageEventsAPI");
        if (p.chatBarButton) neededApiPlugins.add("ChatInputButtonAPI");
        if (p.renderMemberListDecorator) neededApiPlugins.add("MemberListDecoratorsAPI");
        if (p.renderMessageAccessory) neededApiPlugins.add("MessageAccessoriesAPI");
        if (p.renderMessageDecoration) neededApiPlugins.add("MessageDecorationsAPI");
        if (p.messagePopoverButton) neededApiPlugins.add("MessagePopoverAPI");
        if (p.userProfileBadge || (p as any).userProfileBadges) neededApiPlugins.add("BadgeAPI");
        if (p.renderNicknameIcon) neededApiPlugins.add("NicknameIconsAPI");
        if (p.headerBarButton) neededApiPlugins.add("HeaderBarAPI");
        if (p.audioProcessor) neededApiPlugins.add("AudioPlayerAPI");
        if (p.userAreaButton) neededApiPlugins.add("UserAreaAPI");
        if (p.renderProfileCollection) neededApiPlugins.add("ProfileCollectionsAPI");
        if (p.chatBarButtonWrapper) neededApiPlugins.add("ChatInputButtonAPI");
        if (p.renderProfileSection) neededApiPlugins.add("ProfileSectionsAPI");

        for (const key of pluginKeysToBind) {
            p[key] &&= (p[key] as Function).bind(p) as any;
        }
    }

    for (const p of neededApiPlugins) {
        Plugins[p].isDependency = true;
        settings[p].enabled = true;
    }

    for (const name in Plugins) {
        if (!isPluginEnabled(name)) continue;
        const p = Plugins[name];

        if (p.patches) {
            if (!IS_REPORTER || isReporterTestable(p, ReporterTestable.Patches)) {
                for (const patch of p.patches) {
                    addPatch(patch, p.name);
                }
            }
        }
    }
});
