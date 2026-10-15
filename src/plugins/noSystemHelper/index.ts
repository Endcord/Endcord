/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin, { StartAt } from "@utils/types";

function blockHelperInstall(mod: any) {
    if (!mod || mod.__endcordNoHelper) return mod;
    for (const key of Object.keys(mod)) {
        if (typeof mod[key] !== "function") continue;
        if (!/service|helper/i.test(key)) continue;
        if (!/install|ensure|start/i.test(key)) continue;
        mod[key] = () => Promise.resolve();
    }
    try { mod.__endcordNoHelper = true; } catch {}
    return mod;
}

export default definePlugin({
    name: "NoSystemHelper",
    required: true,
    hidden: true,
    description: "Stops Discord from asking for administrator permission to install Discord System Helper.",
    authors: [Devs.ewlle],
    startAt: StartAt.Init,
    patches: [{
        find: "System service installed",
        replacement: {
            match: /await [\w$]+(?:\.[\w$]+)*\(\)(?=[\s\S]{0,500}System service installed)/,
            replace: "await Promise.resolve()"
        }
    }],
    start() {
        const native = (window as any).DiscordNative?.nativeModules;
        const requireModule = native?.requireModule;
        if (typeof requireModule !== "function" || native.__endcordNoHelper) return;
        native.requireModule = function (name: string) {
            const mod = requireModule.apply(this, arguments);
            return name === "discord_utils" ? blockHelperInstall(mod) : mod;
        };
        native.__endcordNoHelper = true;
        try { blockHelperInstall(requireModule.call(native, "discord_utils")); } catch {}
    }
});
