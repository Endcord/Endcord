/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/// <reference types="standalone-electron-types"/>

declare module "~pluginNatives" {
    const pluginNatives: Record<string, Record<string, (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown>>;
    export default pluginNatives;
}

declare module "~pluginNativeMethods" {
    /** The methods each plugin's native.ts exports, by plugin name, read when building (see nativeMethodsPlugin) */
    const methods: Record<string, string[]>;
    export default methods;
}
