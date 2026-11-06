/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Endcord Desktop's main process (desktop/src/main.ts), bundled and run against a stubbed Electron: it starts, its
// window, permissions and screen sharing only ever serve Discord's page, and the tray, badge and menus behave.
import esbuild from "esbuild";
import { mkdirSync, rmSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "dist", ".desktop-test");
const DATA = join(tmpdir(), `endcord-desktop-test-${process.pid}`);

let failed = 0;
function check(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
    if (!ok) failed++;
}

const ELECTRON_STUB = `
const s = globalThis.__electron;
export const app = s.app, BrowserWindow = s.BrowserWindow, clipboard = s.clipboard, desktopCapturer = s.desktopCapturer,
    ipcMain = s.ipcMain, Menu = s.Menu, nativeImage = s.nativeImage, session = s.session, shell = s.shell, Tray = s.Tray;
`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await esbuild.build({
    entryPoints: [join(ROOT, "desktop", "src", "main.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: join(OUT, "main.cjs"), logLevel: "error", tsconfig: join(ROOT, "tsconfig.json"),
    external: ["./endcordDesktopMain.js"],
    plugins: [{
        name: "stub-electron",
        setup(b) {
            b.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "stub" }));
            b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: ELECTRON_STUB, loader: "js" }));
        }
    }]
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A fresh stubbed Electron, then the main process started against it */
async function start(args = []) {
    const state = { switches: [], appEvents: {}, ipc: {}, opened: [], windows: [], session: {}, trays: [], menus: [], quit: 0, shortcuts: 0, badge: [] };
    const on = events => (event, fn) => { (events[event] ??= []).push(fn); };
    const emit = (events, event, ...a) => (events[event] ?? []).forEach(fn => fn(...a));
    class FakeContents {
        events = {};
        on = on(this.events);
        once = on(this.events);
        reloads = 0;
        session = { addWordToSpellCheckerDictionary: word => { state.addedWord = word; } };
        debugger = { isAttached: () => false, attach() { }, detach() { }, sendCommand: async () => { } };
        setWindowOpenHandler(fn) { this.openHandler = fn; }
        getType() { return "window"; }
        isDevToolsOpened() { return false; }
        reload() { this.reloads++; }
        replaceMisspelling(word) { state.replaced = word; }
        toggleDevTools() { } getZoomLevel() { return 0; } setZoomLevel() { }
    }
    class FakeWindow {
        events = {};
        on = on(this.events);
        once = on(this.events);
        visible = false;
        focused = false;
        destroyed = false;
        constructor(options) {
            this.options = options;
            this.webContents = new FakeContents();
            state.windows.push(this);
            emit(state.appEvents, "web-contents-created", {}, this.webContents);
        }
        loadURL(url) { this.url = url; }
        show() { this.visible = true; emit(this.events, "show"); }
        hide() { this.visible = false; }
        focus() { this.focused = true; }
        maximize() { this.maximized = true; }
        restore() { } isMinimized() { return false; } isMaximized() { return !!this.maximized; }
        isVisible() { return this.visible; } isFocused() { return this.focused; } isDestroyed() { return this.destroyed; }
        getNormalBounds() { return { x: 0, y: 0, width: 1000, height: 700 }; }
        flashFrame(on) { this.flashing = on; }
        setOverlayIcon(icon, label) { state.badge.push([!!icon, label]); }
        /** What a click on the close button does: true if the window really closes */
        close() {
            let prevented = false;
            emit(this.events, "close", { preventDefault: () => { prevented = true; } });
            return !prevented;
        }
    }
    class FakeTray {
        constructor(icon) { this.icon = icon; this.events = {}; this.on = on(this.events); state.trays.push(this); }
        setToolTip(text) { this.tooltip = text; }
        setContextMenu(menu) { this.menu = menu; }
        destroy() { }
    }
    let ready;
    const paths = {};
    globalThis.__electron = {
        app: {
            getPath: name => paths[name] ?? join(DATA, name), setPath: (name, path) => { paths[name] = path; }, getVersion: () => "0.1.0",
            requestSingleInstanceLock: () => true, quit() { state.quit++; }, on: on(state.appEvents), setAppUserModelId() { }, relaunch() { }, exit() { },
            getLocale: () => "tr", isPackaged: true, setBadgeCount(n) { state.badge.push([n > 0, String(n)]); },
            getLoginItemSettings: () => ({ openAtLogin: false }), setLoginItemSettings: settings => { state.loginItem = settings; },
            commandLine: { appendSwitch: (key, value) => state.switches.push([key, value]) },
            whenReady: () => new Promise(resolve => { ready = resolve; })
        },
        BrowserWindow: Object.assign(FakeWindow, { fromWebContents: () => state.windows[0] }),
        Tray: FakeTray,
        clipboard: { writeImage() { }, writeText(text) { state.copied = text; } },
        desktopCapturer: { getSources: async () => [{ id: "screen:0:0", name: "Screen", thumbnail: { toJPEG: () => Buffer.from("jpeg") } }] },
        ipcMain: { handle: (channel, fn) => { state.ipc[channel] = fn; }, on: (channel, fn) => { state.ipc[channel] = fn; } },
        Menu: { setApplicationMenu() { }, buildFromTemplate: items => { const menu = { items, popup() { state.menus.push(items); } }; return menu; } },
        nativeImage: { createFromBuffer: () => ({}), createFromBitmap: (buffer, size) => ({ buffer, size }) },
        session: {
            defaultSession: {
                setPermissionRequestHandler: fn => { state.session.request = fn; },
                setPermissionCheckHandler: fn => { state.session.check = fn; },
                setDisplayMediaRequestHandler: fn => { state.session.display = fn; }
            }
        },
        shell: { openExternal: url => state.opened.push(url), readShortcutLink() { throw new Error("none"); }, writeShortcutLink() { state.shortcuts++; return true; } }
    };

    const require = createRequire(import.meta.url);
    delete require.cache[require.resolve(join(OUT, "main.cjs"))];
    const argv = process.argv.length;
    process.argv.push(...args);
    let error = null;
    try {
        require(join(OUT, "main.cjs"));
        ready();
        await sleep(10);
    } catch (e) {
        error = e;
    }
    process.argv.length = argv;
    return { state, error, emit };
}

const DISCORD_FRAME = { url: "https://discord.com/channels/@me", processId: 1, routingId: 1 };
const EVIL_FRAME = { url: "https://evil.example/", processId: 2, routingId: 1 };

process.argv.push("--vanilla");
// Electron's Node has these; the user agent is built from Chromium's version
Object.defineProperty(process.versions, "chrome", { value: "156.0.0.0" });
delete process.env.ENDCORD_USER_DATA_DIR;
delete process.env.UV_THREADPOOL_SIZE;
process.env.ENDCORD_DESKTOP_DATA_DIR = DATA;
rmSync(DATA, { recursive: true, force: true });

const { state, error, emit } = await start();
check("the main process starts", !error, error?.stack ?? "");
const win = state.windows[0];
check("one window, on Discord", state.windows.length === 1 && win.url === "https://discord.com/app", state.windows.map(w => w.url));
check("it shows right away, without waiting for the first paint", win.visible);
check("Node's thread pool is kept to two threads", process.env.UV_THREADPOOL_SIZE === "2", process.env.UV_THREADPOOL_SIZE);
check("no spare renderer process", state.switches.some(([key, value]) => key === "disable-features" && value.includes("SpareRendererForSitePerProcess")));
// In the main process, screen shares sometimes never start (desktop/src/main.ts)
check("the video capture service keeps its own process", !state.switches.some(([, value]) => String(value).includes("RunVideoCaptureServiceInBrowserProcess")));

// Links and navigation
const contents = win.webContents;
check("a link opens in the browser, not the window", contents.openHandler({ url: "https://example.com/" }).action === "deny" && state.opened.includes("https://example.com/"));
check("a javascript: link goes nowhere", contents.openHandler({ url: "javascript:alert(1)" }).action === "deny" && !state.opened.includes("javascript:alert(1)"));
check("Discord's blank popout opens", contents.openHandler({ url: "about:blank" }).action === "allow");
let prevented = false;
emit(contents.events, "will-navigate", { preventDefault: () => { prevented = true; } }, "https://evil.example/");
check("the window can't be sent to another site", prevented);
prevented = false;
emit(contents.events, "will-navigate", { preventDefault: () => { prevented = true; } }, "https://discord.com/login");
check("it can move around Discord", !prevented);

// Permissions
const ask = (permission, url) => new Promise(resolve => state.session.request(null, permission, resolve, { requestingUrl: url }));
check("Discord may use the microphone", await ask("media", "https://discord.com/app") === true);
check("another site may not", await ask("media", "https://evil.example/") === false);
check("Discord may not ask for the location", await ask("geolocation", "https://discord.com/app") === false);
check("permission checks follow the same rules", state.session.check(null, "notifications", "https://discord.com") === true && state.session.check(null, "notifications", "https://evil.example") === false);

// Screen sharing
const display = request => new Promise(resolve => state.session.display(request, resolve));
check("a share without a pick in the page gets nothing", await display({ frame: DISCORD_FRAME, audioRequested: false }) === null);
check("another site can't list the screens", await state.ipc.EndcordDesktopGetSources({ senderFrame: EVIL_FRAME }) === null);
const sources = await state.ipc.EndcordDesktopGetSources({ senderFrame: DISCORD_FRAME });
check("Discord's page lists them", Array.isArray(sources) && sources[0]?.id === "screen:0:0" && sources[0].thumbnail.startsWith("data:image/jpeg;base64,"), sources);
check("another frame can't pick from that list", await state.ipc.EndcordDesktopPickSource({ senderFrame: { ...DISCORD_FRAME, processId: 9 } }, "screen:0:0", false) === false);
check("only a listed source can be picked", await state.ipc.EndcordDesktopPickSource({ senderFrame: DISCORD_FRAME }, "window:123:0", false) === false);
check("a listed one can", await state.ipc.EndcordDesktopPickSource({ senderFrame: DISCORD_FRAME }, "screen:0:0", true) === true);
check("another frame's request doesn't get the pick", await display({ frame: EVIL_FRAME, audioRequested: false }) === null);
await state.ipc.EndcordDesktopGetSources({ senderFrame: DISCORD_FRAME });
await state.ipc.EndcordDesktopPickSource({ senderFrame: DISCORD_FRAME }, "screen:0:0", true);
const granted = await display({ frame: DISCORD_FRAME, audioRequested: true });
check("the page's request gets what was picked", granted?.video?.id === "screen:0:0", granted);
check("with the computer's sound minus the app's own on Windows", process.platform !== "win32" || ["loopbackWithoutChrome", "loopback"].includes(granted?.audio), granted?.audio);
check("a pick is used once", await display({ frame: DISCORD_FRAME, audioRequested: false }) === null);

// Unread mentions on the taskbar
win.focused = false;
emit(win.events, "page-title-updated", {}, "(3) Discord | #general");
const lastBadge = () => state.badge.at(-1);
check("mentions in the title put a badge on the taskbar", lastBadge()?.[0] === true && /3/.test(lastBadge()?.[1] ?? ""), state.badge);
check("and get the taskbar button's attention while the window is away", win.flashing === true);
check("the tray says how many, in the system's language", /3 okunmamış/.test(state.trays[0]?.tooltip ?? ""), state.trays[0]?.tooltip);
emit(win.events, "page-title-updated", {}, "Discord | #general");
check("read, the badge goes", lastBadge()?.[0] === false);
emit(win.events, "focus");
check("looking at the window stops the flashing", win.flashing === false);

// Text field menu
emit(contents.events, "context-menu", {}, { isEditable: true, misspelledWord: "helo", dictionarySuggestions: ["hello", "help"], editFlags: { canCut: true, canCopy: true, canPaste: true }, selectionText: "", linkURL: "" });
const menu = state.menus.at(-1) ?? [];
check("a text field gets spelling fixes first", menu[0]?.label === "hello" && menu[1]?.label === "help", menu.map(i => i.label ?? i.role ?? i.type));
check("then cut, copy and paste", ["cut", "copy", "paste"].every(role => menu.some(i => i.role === role)));
menu[0].click();
check("a fix replaces the word", state.replaced === "hello");
const menus = state.menus.length;
emit(contents.events, "context-menu", {}, { isEditable: false, misspelledWord: "", dictionarySuggestions: [], editFlags: {}, selectionText: "", linkURL: "" });
check("an empty spot gets no menu", state.menus.length === menus);
emit(contents.events, "context-menu", {}, { isEditable: false, misspelledWord: "", dictionarySuggestions: [], editFlags: {}, selectionText: "", linkURL: "javascript:alert(1)" });
check("a javascript: link gets no copy item", state.menus.length === menus);

// A crashed page comes back, but not over and over
for (let i = 0; i < 4; i++) emit(contents.events, "render-process-gone", {}, { reason: "crashed" });
emit(contents.events, "render-process-gone", {}, { reason: "clean-exit" });
await sleep(1200);
check("a crashed page reloads, at most three times in five minutes", contents.reloads === 3, contents.reloads);

// The tray and closing
check("there's a tray icon", state.trays.length === 1);
const trayMenu = state.trays[0].menu.items;
const startItem = trayMenu.find(i => i.type === "checkbox" && /Windows|Oturum/.test(i.label));
check("a test profile can't add itself to the system's startup list", startItem?.enabled === false, startItem);
check("closing hides the window in the tray", win.close() === false && !win.visible);
check("the tray icon brings it back", (emit(state.trays[0].events, "click"), win.visible));
trayMenu.find(i => i.type === "checkbox" && /tepside/.test(i.label)).click({ checked: false });
check("with that turned off, closing closes", win.close() === true);
trayMenu.find(i => i.type === "checkbox" && /tepside/.test(i.label)).click({ checked: true });
trayMenu.at(-1).click();
check("quitting from the tray quits", state.quit === 1 && win.close() === true);
check("a test profile makes no Start menu shortcut", state.shortcuts === 0);

// Started at sign-in: in the tray, not on screen
const hidden = await start(["--hidden"]);
check("started at sign-in, the window waits in the tray", !hidden.error && hidden.state.windows[0]?.visible === false);

rmSync(DATA, { recursive: true, force: true });
rmSync(OUT, { recursive: true, force: true });
if (failed) {
    console.error(`\n${failed} FAILED`);
    process.exit(1);
}
console.log("\nALL PASSED");
