/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { onceDefined } from "@shared/onceDefined";
import electron, { app, BrowserWindowConstructorOptions, Menu } from "electron";
import { enableCompileCache, flushCompileCache } from "module";
import { dirname, join } from "path";

import { initMemoryTrim } from "./memoryTrim";
import { preOpenRenderer } from "./preOpenRenderer";
import { RendererSettings } from "./settings";
import { DATA_DIR, IS_VANILLA } from "./utils/constants";

console.info("[Endcord] Starting up...");

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";

if (!IS_VANILLA) preOpenRenderer();

// Our injector file at app/index.js
const injectorPath = require.main!.filename;

// Locate original Discord asar file
const resDir = join(dirname(injectorPath), "..");
let asarPath = join(resDir, "_app.asar");
if (!existsSync(asarPath)) {
    asarPath = join(resDir, "app.asar");
}

const discordPkg = require(join(asarPath, "package.json"));
require.main!.filename = join(asarPath, discordPkg.main);

// @ts-expect-error Untyped method? Dies from cringe
app.setAppPath(asarPath);

if (!IS_VANILLA) {
    const settings = RendererSettings.store;
    // Repatch after host updates on Windows
    if (process.platform === "win32") {
        require("./patchWin32Updater");

        if (settings.winCtrlQ) {
            const originalBuild = Menu.buildFromTemplate;
            Menu.buildFromTemplate = function (template) {
                if (template[0]?.label === "&File") {
                    const { submenu } = template[0];
                    if (Array.isArray(submenu)) {
                        submenu.push({
                            label: "Quit (Hidden)",
                            visible: false,
                            acceleratorWorksWhenHidden: true,
                            accelerator: "Control+Q",
                            click: () => app.quit()
                        });
                    }
                }
                return originalBuild.call(this, template);
            };
        }
    }

    class BrowserWindow extends electron.BrowserWindow {
        constructor(options: BrowserWindowConstructorOptions) {
            if (!options?.webPreferences?.preload) {
                super(options);
                return;
            }

            const { frameless, winNativeTitleBar, disableMinSize, transparent, macosVibrancyStyle, windowsMaterial } = settings;

            const original = options.webPreferences.preload;
            options.webPreferences.preload = join(__dirname, "preload.js");
            options.webPreferences.sandbox = false;
            // backgroundThrottling stays on, as in Discord itself: a minimized or covered window stops drawing.
            // The switches below keep its timers and connection running at full speed.

            if (frameless) {
                options.frame = false;
            } else if (process.platform === "win32" && winNativeTitleBar) {
                delete options.frame;
            }

            if (disableMinSize) {
                options.minWidth = 0;
                options.minHeight = 0;
            }

            if (transparent) {
                options.transparent = true;
                options.backgroundColor = "#00000000";
            }
            if (process.platform === "darwin" && macosVibrancyStyle) {
                options.vibrancy = macosVibrancyStyle;
                options.backgroundColor = "#00000000";
            }
            if (process.platform === "win32" && windowsMaterial && windowsMaterial !== "none") {
                options.backgroundMaterial = windowsMaterial;
                options.backgroundColor = "#00000000";
            }

            process.env.DISCORD_PRELOAD = original;

            super(options);

            if (disableMinSize) {
                // Disable the Electron call entirely so that Discord can't dynamically change the size
                this.setMinimumSize = (_width: number, _height: number) => { };
            }

            if (!settings.disableBackgroundMemoryTrim) initMemoryTrim(this);
        }
    }
    Object.assign(BrowserWindow, electron.BrowserWindow);
    // esbuild may rename our BrowserWindow, which leads to it being excluded
    // from getFocusedWindow(), so this is necessary
    // https://github.com/discord/electron/blob/13-x-y/lib/browser/api/browser-window.ts#L60-L62
    Object.defineProperty(BrowserWindow, "name", { value: "BrowserWindow", configurable: true });

    // Replace electrons exports with our custom BrowserWindow
    const electronPath = require.resolve("electron");
    delete require.cache[electronPath]!.exports;
    require.cache[electronPath]!.exports = {
        ...electron,
        BrowserWindow
    };

    // Patch appSettings to force enable devtools
    onceDefined(global, "appSettings", s => {
        s.set("DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING", true);
    });

    process.env.DATA_DIR = join(app.getPath("userData"), "..", "Endcord");

    // Monkey patch commandLine to:
    // - disable WidgetLayering: Fix DevTools context menus https://github.com/electron/electron/issues/38790
    // - disable UseEcoQoSForBackgroundProcess: Work around Discord unloading when in background
    const originalAppend = app.commandLine.appendSwitch;
    app.commandLine.appendSwitch = function (...args) {
        if (args[0] === "disable-features") {
            const disabledFeatures = new Set((args[1] ?? "").split(",").filter(Boolean));
            disabledFeatures.add("WidgetLayering");
            disabledFeatures.add("UseEcoQoSForBackgroundProcess");
            disabledFeatures.add("IntensiveWakeUpThrottling");
            args[1] = [...disabledFeatures].join(",");
        } else if (args[0] === "enable-features" && settings.gpuRasterization) {
            const enabledFeatures = new Set((args[1] ?? "").split(",").filter(Boolean));
            enabledFeatures.add("CanvasOopRasterization");
            args[1] = [...enabledFeatures].join(",");
        }
        return originalAppend.apply(this, args);
    };

    // Keep timers and the gateway connection at full speed in the background, so Discord doesn't drop or reload.
    // Discord adds these two on Windows only; the problem happens on Linux too.
    // https://github.com/electron/electron/issues/2822
    // https://github.com/GoogleChrome/chrome-launcher/blob/5a27dd574d47a75fec0fb50f7b774ebf8a9791ba/docs/chrome-flags-for-tools.md#task-throttling
    // "disable-backgrounding-occluded-windows" is left out on purpose: with it, a window behind a game or browser kept
    // drawing every frame, which Discord itself doesn't do.
    app.commandLine.appendSwitch("disable-renderer-backgrounding");
    app.commandLine.appendSwitch("disable-background-timer-throttling");
    // Opt-in: GPU rasterization moves painting into the GPU process. It can be smoother on some GPUs, but costs
    // 50-80 MB more memory there, so by default Endcord leaves Chromium's own choice alone like Discord does.
    // Chromium's GPU blocklist still applies; forcing zero-copy or native GPU memory buffers is never done.
    if (settings.gpuRasterization) {
        app.commandLine.appendSwitch("enable-gpu-rasterization");
        app.commandLine.appendSwitch("enable-features", "CanvasOopRasterization");
    }

    // Node keeps the compiled code of the scripts it loads between starts, so Discord's 3 MB main bundle isn't
    // compiled from scratch every time. Node checks each entry against the file's contents, so an update only
    // recompiles what changed. Window processes don't write one, so this is the main process only.
    // DATA_DIR, not the folder above: Discord only moves userData to DISCORD_USER_DATA_DIR once its bundle runs
    const cacheDir = process.env.ENDCORD_COMPILE_CACHE = join(DATA_DIR, "compile-cache");
    try {
        // Each Discord update installs to a new app-* folder, so its entries would pile up. Start over on each one
        const stamp = join(cacheDir, "discord-install");
        const install = dirname(process.execPath);
        if (!existsSync(stamp) || readFileSync(stamp, "utf-8") !== install) {
            rmSync(cacheDir, { recursive: true, force: true });
            mkdirSync(cacheDir, { recursive: true });
            writeFileSync(stamp, install);
        }

        enableCompileCache(cacheDir);
    } catch { }
} else {
    console.info("[Endcord] Running in vanilla mode. Not loading Endcord");
}

console.info("[Endcord] Loading original Discord app.asar");
require(require.main!.filename);

if (process.env.ENDCORD_COMPILE_CACHE) {
    // Discord quits without giving Node the chance to write the cache on exit. Write it once its bundle has loaded,
    // and again after the modules it loads once it's up
    const flush = () => {
        try {
            flushCompileCache();
        } catch { }
    };
    flush();
    setTimeout(flush, 60_000).unref();
}
