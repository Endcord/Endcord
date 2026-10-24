/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Appended to the generated ~plugins module. Lazy plugins are getters that evaluate the plugin module on first
// access, so disabled plugins are never initialised unless something actually needs them.

const plugins = {};
const $loadedBeforeHook = [];
let $loadHook;

const $define = (name, value) => Object.defineProperty(plugins, name, { value, writable: true, enumerable: true, configurable: true });

function $onLoaded(plugin) {
    if ($loadHook) $loadHook(plugin);
    else $loadedBeforeHook.push(plugin);
}

function $eager(plugin) {
    $define(plugin.name, plugin);
    $onLoaded(plugin);
}

function $lazy(name, load) {
    Object.defineProperty(plugins, name, {
        enumerable: true,
        configurable: true,
        get() {
            const plugin = load();
            $define(name, plugin);
            if (plugin.name !== name) console.error(`[Endcord] Lazy plugin ${name} resolved to a plugin named ${plugin.name}`);
            $onLoaded(plugin);
            return plugin;
        },
        set(value) {
            $define(name, value);
        }
    });
}

/** Whether the plugin's module has been evaluated. Reading `plugins[name]` loads it. */
export function isPluginLoaded(name) {
    const desc = Object.getOwnPropertyDescriptor(plugins, name);
    return desc != null && !desc.get;
}

/** Reads `required` / `enabledByDefault` without loading a lazy plugin */
export function getPluginFlag(name, flag) {
    if (isPluginLoaded(name)) return plugins[name]?.[flag];
    return PluginMeta[name]?.[flag];
}

/** Called once by the PluginManager with a callback that runs for every plugin as it gets loaded */
export function setPluginLoadHook(hook) {
    $loadHook = hook;
    for (const plugin of $loadedBeforeHook.splice(0)) hook(plugin);
}

