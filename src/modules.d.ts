/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
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
