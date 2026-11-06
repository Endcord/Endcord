/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

declare module "~plugins" {
    const plugins: Record<string, import("./utils/types").Plugin>;
    export default plugins;
    export const PluginMeta: Record<string, {
        folderName: string;
        userPlugin: boolean;
        /** Only present for lazily loaded plugins, read statically at build time */
        required?: boolean;
        enabledByDefault?: boolean;
        /** Old plugin names whose settings this lazy plugin migrates when its module loads */
        migratesFrom?: string[];
        /** Plugin folders this plugin imports code from; they are loaded together with it */
        loadsWith?: string[];
    }>;
    export const ExcludedPlugins: Record<string, "web" | "discordDesktop" | "vesktop" | "desktop" | "dev">;
    /** Whether the plugin's module has been evaluated. Reading `plugins[name]` loads it. */
    export function isPluginLoaded(name: string): boolean;
    /** Reads `required` / `enabledByDefault` without loading a lazy plugin */
    export function getPluginFlag(name: string, flag: "required" | "enabledByDefault"): boolean | undefined;
    /** Runs the hook for every plugin already loaded and for each plugin loaded afterwards */
    export function setPluginLoadHook(hook: (plugin: import("./utils/types").Plugin) => void): void;
    /**
     * Gets the code of these lazy plugins in one go, where the desktop build keeps it outside the script, so reading
     * them afterwards doesn't fetch each one by itself. Does nothing elsewhere
     */
    export function preloadPluginCode(names: string[]): void;
    /** One of the core's own screen styles that the desktop build keeps outside the script, by its file. "" elsewhere */
    export function getScreenStyle(key: string): string;
    /**
     * What the plugin list shows of a lazy plugin whose code isn't loaded, read from its source when building.
     * undefined for a loaded plugin, one whose details couldn't be read, and in builds that keep all plugin code inside
     * the script. Short keys, since it ships for every lazy plugin
     */
    export function getPluginListInfo(name: string): {
        /** description */
        d: string;
        /** tags */
        t?: string[];
        /** search terms */
        q?: string[];
        /** dependencies */
        p?: string[];
        /** hidden */
        h?: 1;
        /** has settings */
        s?: 1;
        /** its authors' keys in Devs, when all of them are written that way */
        w?: string[];
        /** its sensitive settings; "*" when one couldn't be named and the plugin itself has to be asked */
        k?: string[];
    } | undefined;
}

declare module "~git-hash" {
    const hash: string;
    export default hash;
}
declare module "~git-remote" {
    const remote: string;
    export default remote;
}

declare module "file://*" {
    const content: string;
    export default content;
}

declare module "*.css";

declare module "*.css?managed" {
    const name: string;
    export default name;
}

declare module "*.css?screen";
