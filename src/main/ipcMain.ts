/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./updater";
import "./ipcPlugins";
import "./settings";
import "./bootGuard";

import { debounce } from "@shared/debounce";
import { isSafeExternalUrl } from "@shared/externalLinks";
import { IpcEvents } from "@shared/IpcEvents";
import { RENDERER_FILE } from "@shared/pluginChunks";
import { BrowserWindow, ipcMain, nativeTheme, shell, systemPreferences } from "electron";
import monacoHtml from "file://monacoWin.html?minify&base64";
import { FSWatcher, mkdirSync, readFileSync, watch, writeFileSync } from "fs";
import { open, readdir, readFile } from "fs/promises";
import { release } from "os";
import { join } from "path";

import { registerCspIpcHandlers } from "./csp/manager";
import { getMemoryStats, trimAndMeasure } from "./memoryTrim";
import { getThemeInfo, stripBOM, UserThemeHeader } from "./themes";
import { QUICK_CSS_PATH, SETTINGS_DIR, THEMES_DIR } from "./utils/constants";
import { ensureSafePath } from "./utils/ensureSafePath";
import { makeLinksOpenExternally } from "./utils/externalLinks";
import { handleIpc } from "./utils/ipc";

const RENDERER_CSS_PATH = join(__dirname, IS_VESKTOP ? "endcordDesktopRenderer.css" : "renderer.css");

mkdirSync(THEMES_DIR, { recursive: true });

registerCspIpcHandlers();

function readCss() {
    return readFile(QUICK_CSS_PATH, "utf-8").catch(() => "");
}

async function listThemes(): Promise<UserThemeHeader[]> {
    const files = await readdir(THEMES_DIR).catch(() => []);

    const themeInfo: UserThemeHeader[] = [];

    for (const fileName of files) {
        if (!fileName.endsWith(".css")) continue;

        const data = await getThemeData(fileName).then(stripBOM).catch(() => null);
        if (data == null) continue;

        themeInfo.push(getThemeInfo(data, fileName));
    }

    return themeInfo;
}

function getThemeData(fileName: string) {
    fileName = fileName.replace(/\?v=\d+$/, "");
    const safePath = ensureSafePath(THEMES_DIR, fileName);
    if (!safePath) return Promise.reject(`Unsafe path ${fileName}`);
    return readFile(safePath, "utf-8");
}

handleIpc(IpcEvents.OPEN_QUICKCSS, () => shell.openPath(QUICK_CSS_PATH));

handleIpc(IpcEvents.GET_MEMORY_STATS, () => getMemoryStats());
handleIpc(IpcEvents.TRIM_MEMORY, ({ sender }) => {
    const win = BrowserWindow.fromWebContents(sender);
    return win ? trimAndMeasure(win) : 0;
});

handleIpc(IpcEvents.OPEN_EXTERNAL, (_, url) => {
    if (!isSafeExternalUrl(url)) throw "Disallowed URL.";

    // eslint-disable-next-line no-restricted-syntax -- checked just above
    shell.openExternal(url);
});


handleIpc(IpcEvents.GET_QUICK_CSS, () => readCss());
handleIpc(IpcEvents.SET_QUICK_CSS, (_, css) => {
    if (typeof css !== "string") throw new Error("Invalid CSS");

    writeFileSync(QUICK_CSS_PATH, css);
});

handleIpc(IpcEvents.GET_THEMES_LIST, () => listThemes());
handleIpc(IpcEvents.GET_THEME_DATA, (_, fileName) => getThemeData(fileName));
handleIpc(IpcEvents.GET_THEME_SYSTEM_VALUES, () => {
    let accentColor = systemPreferences.getAccentColor?.() ?? "";

    if (accentColor.length && accentColor[0] !== "#") {
        accentColor = `#${accentColor}`;
    }

    return {
        "os-accent-color": accentColor
    };
});

handleIpc(IpcEvents.OPEN_THEMES_FOLDER, () => shell.openPath(THEMES_DIR));
handleIpc(IpcEvents.OPEN_SETTINGS_FOLDER, () => shell.openPath(SETTINGS_DIR));

handleIpc(IpcEvents.INIT_FILE_WATCHERS, ({ sender }) => {
    let quickCssWatcher: FSWatcher | undefined;
    let rendererCssWatcher: FSWatcher | undefined;

    open(QUICK_CSS_PATH, "a+").then(fd => {
        fd.close();
        quickCssWatcher = watch(QUICK_CSS_PATH, { persistent: false }, debounce(async () => {
            sender.postMessage(IpcEvents.QUICK_CSS_UPDATE, await readCss());
        }, 50));
    }).catch(() => { });

    const themesWatcher = watch(THEMES_DIR, { persistent: false }, debounce(() => {
        sender.postMessage(IpcEvents.THEME_UPDATE, void 0);
    }));

    if (IS_DEV) {
        rendererCssWatcher = watch(RENDERER_CSS_PATH, { persistent: false }, async () => {
            sender.postMessage(IpcEvents.RENDERER_CSS_UPDATE, await readFile(RENDERER_CSS_PATH, "utf-8"));
        });
    }

    sender.once("destroyed", () => {
        quickCssWatcher?.close();
        themesWatcher.close();
        rendererCssWatcher?.close();
    });
});

ipcMain.on(IpcEvents.GET_MONACO_THEME, e => {
    e.returnValue = nativeTheme.shouldUseDarkColors ? "vs-dark" : "vs-light";
});

handleIpc(IpcEvents.OPEN_MONACO_EDITOR, async () => {
    const title = "Endcord QuickCSS Editor";
    const existingWindow = BrowserWindow.getAllWindows().find(w => w.title === title);
    if (existingWindow && !existingWindow.isDestroyed()) {
        existingWindow.focus();
        return;
    }

    const win = new BrowserWindow({
        title,
        autoHideMenuBar: true,
        darkTheme: true,
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#1e1e1e" : "white",
        webPreferences: {
            preload: join(__dirname, IS_DISCORD_DESKTOP ? "preload.js" : "endcordDesktopPreload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    makeLinksOpenExternally(win);

    await win.loadURL(`data:text/html;base64,${monacoHtml}`);
});

handleIpc(IpcEvents.GET_RENDERER_CSS, () => readFile(RENDERER_CSS_PATH, "utf-8"));


ipcMain.on(IpcEvents.PRELOAD_GET_RENDERER_JS, e => {
    e.returnValue = readFileSync(join(__dirname, RENDERER_FILE), "utf-8");
});

ipcMain.on(IpcEvents.SUPPORTS_WINDOWS_MATERIAL, e => {
    e.returnValue = process.platform === "win32" && Number(release().split(".")[2]) >= 22621;
});
