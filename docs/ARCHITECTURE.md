# Architecture

Endcord runs in four places, and each one trusts less than the one before it.

| Part | Code | Runs as |
| --- | --- | --- |
| Main process | `src/main`, every plugin's `native.ts` | Node, with full access to the PC |
| Preload | `src/preload.ts`, `src/EndcordNative.ts` | The bridge between the two |
| Renderer | `src/api`, `src/components`, `src/plugins`, `src/webpack` | Inside Discord's page, under its CSP |
| Browser extension | `browser/` | Inside Discord's page, with no CSP |

See [SECURITY.md](../SECURITY.md) for the threat model, and [docs/adr](adr/README.md) for why things are built this way.

## Rules for the main process

Anything the renderer sends is untrusted. A plugin running in the page, a theme or a message can all reach it.

- **Register IPC with `handleIpc`** (`src/main/utils/ipc.ts`). It refuses any page that isn't Discord. `ipcMain.handle` is a lint error.
- **Run programs with `execFile`, by full path.** `exec` goes through a shell, and Windows looks a bare name up in the working folder first. Both are lint errors.
- **Open links through `isSafeExternalUrl`** (`src/shared/externalLinks.ts`). Web and desktop share this rule.
- **Keep file paths inside their folder** with `ensureSafePath` (`src/main/utils/ensureSafePath.ts`). It also refuses Windows device names like `CON`. Names and extensions from the renderer need their own check.
- **Write settings-like files with `writeFileDurably`** (`src/main/utils/durableFile.ts`). A plain write can leave an empty file after a power cut.

## Fetching in a native

| The URL | Use |
| --- | --- |
| Is always a few known hosts | `parseAllowedUrl(url, hosts)`, then `fetch` |
| Can be anything the user picks | `fetchPublicUrl(url)`, which blocks this PC and the local network |

Read the body with `readBody(response, maxBytes)`. It doesn't trust `Content-Length`.

## Rules for the renderer

- **Don't build HTML from strings.** `innerHTML` and `dangerouslySetInnerHTML` are lint errors. Where one is safe, the disable comment says why.
- **Check links from outside.** `<Link>` drops unsafe hrefs. A plain `<a>` needs `isSafeLink`.
- **Mark secrets and addresses.** A plugin setting holding a key, or an address the plugin sends data to or opens, needs `sensitive: true`. It then stays out of exports and cloud sync, so a shared backup or a compromised sync server can't repoint it. `test/security.mjs` checks every STRING setting whose name says url, host, token and the like.
- **Log with `Logger`** or `console.debug`. `console.log` is a lint error. `Logger` removes tokens and keys, because people paste their console into support channels.

## Patching Discord

Plugins change Discord's code with text patches, so a Discord update can silently break one: the `find` no longer matches, or a `match` regex stops fitting. Discord changes minified names between builds, so match on structure with `\i`, and keep gaps like `.{0,150}` wide enough to survive small changes.

A `find` must hit exactly one module. A patch is used up on the first module that holds its `find`, so if that one is the wrong module the right one is never patched.

Don't return early from a component in a patch. The hooks after that point would stop running and React would throw. Put the check on the component's last `return`.

A replacement that finds its module but changes nothing, or breaks it, is recorded in `patchProblems` (`src/webpack/patchWebpack.ts`). That's what puts NEEDS FIX on a plugin's card, fills Plugin health in Diagnostics, and tells the person once when Discord's update broke something (`src/api/PluginHealth.ts`). Mark a replacement `noWarn` only when having no effect is expected.

To check every patch, run the same report as CI: `pnpm buildReporter`, then bundle and run `scripts/generateReport.ts` with `CHROMIUM_BIN` set to a Chromium browser, and `USE_CANARY=true` for Canary. It applies and compiles each patch on a logged out page. Desktop-only plugins aren't in this build.

## Updates

Every update is signed. `version.json` carries an ECDSA P-256 signature, and the client, `install.sh` and `linux/gui.py` each check it against the public key before using anything in it. The payload format is duplicated in `scripts/uploadRelease.mjs`, `src/main/updater/http.ts`, `install.sh` and `linux/gui.py`, so a change has to reach all four.

The Windows installer carries the SHA-256 of its four payload files (`scripts/buildInstaller.ps1` embeds `payload.sha256`) and refuses a payload that doesn't match, so a file planted next to it isn't installed. The release script also writes `EndcordInstaller.exe.sha256` for the download page.

A release that never starts is undone after three loads and tried again a day later. The kept copy is only put back if its hash still matches what was saved, and the Security card and a notification say what happened.

Only big releases greet people with a What's New card. To announce one, add it to the top of `src/components/whatsNew/releases.ts` with the exact version it ships as. A bug fix release stays out of that list.

## Safe mode

Every start counts as failed until Discord has stayed up for 15 seconds with no crash screen, and after three failed starts in a row the next one runs without plugins, themes or Custom CSS (`src/shared/bootGuard.ts`). The page asks for its start through the settings channel, because it needs the answer synchronously and a synchronous call to a channel an older main process doesn't know would hang it. CrashHandler reports which plugins changed the modules a crash went through, so the safe-mode dialog can name them. An undone update clears the count, so plugins aren't blamed for what a release did.

Profiles, starter packs and snapshots live in `src/api/PluginProfiles.ts` and `src/api/SettingsSnapshots.ts`. A snapshot is taken before anything that changes many plugins at once, and once a day after a good start.

## Plugin defaults

`enabledByDefault` only reaches fresh installs, because a settings file records every plugin as on or off. To turn an existing plugin on for everyone, also add it to `src/api/pluginDefaults.ts` and bump the version there. It runs once, so anyone who turns the plugin off afterwards keeps it off.

## Endcord's own screens

`src/endcordUi.css` holds the colors and motion shared by Endcord's surfaces, so new screens use those instead of their own. A screen gets those colors, on every Discord theme, from `ENDCORD_THEME` in `@utils/css`, and a dialog from `EndcordModal`: see [the decision](adr/0006-endcord-screens-wear-endcord-colors.md). Its corners come from `--ec-radius` and `--ec-pc`: smooth by default, the installer's stepped pixels when the Pixel style setting puts `data-ec-pixel` on the page, so a rule uses both and gets one. `src/components/EndcordIcons.tsx` holds the icons, each drawn both ways, and `src/components/delight` the small surprises, which answer what someone does and never load or send anything. Anything a screen reports has to come from a check that ran: see [the decision](adr/0005-status-comes-from-a-check.md).

## Profile badges

A badge added with `addProfileBadge` (`src/api/Badges.ts`) gets Discord's own rich hover card, the one Nitro badges have, and clicking it opens a dialog laid out like Discord's badge directory: the profile's badges on the left, the chosen one with its levels on the right. Give it a `title`, a `body` for the line under it, a `rarity` on Discord's scale and `details` for the dialog. All of it lives in `src/plugins/_api/badges`.

Discord's own badges, and badges that stand for one (`discordBadge`, as CustomProfile's do), show what Discord shows: `discordBadges.ts` takes the name, level, rarity and the line under the title from the profile's badge catalog (`GET /users/{id}/badges`, read the way Discord's client reads it), then from what earlier catalogs taught it, then from Discord's client and a short table built from its support articles. Discord sets rarity on its servers and changes it, so the table only holds the ones Discord has published or shown.

## Translations

`src/utils/i18n/locales` holds one file per language, and `src/utils/i18n/pluginDescriptions` holds plugin descriptions. English text is the key, so English has no file.

V8 keeps a script's whole source in memory, and the tables were a third of the renderer. So the desktop build doesn't put them in the code: it appends them to `renderer.js` as plain JSON inside one block comment, the preload cuts that block off before running the script, and a table is read from the file only when its language is used (`externalLocalesPlugin` in `scripts/build/common.mjs`, `src/shared/externalLocales.ts`). The release still ships the same four files.

The web builds keep their tables inside. Their code has to stay Latin-1, or V8 keeps the whole source at two bytes a character, so the build writes every other character as a `\u` escape. For a table where that costs more than base64 of its UTF-8 JSON, Russian mostly, the build packs it that way instead (`packLocalesPlugin`), and only the language in use is unpacked.

## Staying light

Endcord runs inside Discord, so everything it adds is paid on every start and every frame. What keeps it small:

- **A hidden window stops drawing.** Discord's own window stops painting when it's minimized or covered by another window. Endcord keeps that, and only keeps timers at full speed so the connection holds (`src/main/patcher.ts`). Don't turn `backgroundThrottling` off or add `disable-backgrounding-occluded-windows`: with them, Discord drew every frame behind a game.
- **Patching is remembered.** `src/webpack/patchCache.ts` records which patches matched which modules for each Discord build. On the next start a module that matched nothing isn't even read, and one that did only tries those patches. A module several plugins patch is compiled once, after all of them (`patchFactory`).
- **Waits for stores are looked up by name** instead of testing every store filter against every export of every module (`storeSubscriptions` in `src/webpack/webpack.ts`).
- **Node caches compiled code** of Discord's own main bundle between starts (`enableCompileCache` in `patcher.ts`). Discord quits without letting Node write the cache, so it's flushed by hand, and a Discord update starts it over. Window processes don't write one.
- **Only plugins that are on are in the script.** The desktop renderer is built in passes (`scripts/build/pluginChunks.mjs`): the code of every plugin that can load lazily is split into chunks that import the core's modules instead of bundling copies, and the chunks go into `renderer.js` after the script, inside one block comment, the way the translation tables do. The preload defines the chunks of the plugins that are on before the script runs (`src/pluginChunkLoader.ts`); any other is read from the file the moment something needs it, synchronously, through `EndcordNative.pluginChunks`. The plugin list shows plugins whose code isn't loaded from what the build read of their source (`getPluginListInfo`, `tabs/plugins/listItems.ts`), so opening it doesn't load them all. The script went from 3.4 MB to about 440 KB. The release still ships the same four files: the updater people already have refuses any other file, so plugin code can't move into one of its own. `test/chunks.mjs` checks every chunk of a build.
- **A start doesn't open renderer.js.** Windows Defender scans a script file when it's written, and again the first time it's opened after its signatures update, at roughly 0.35 seconds per megabyte of code; an open made while a scan is due waits for it: 1.4 seconds for all of `renderer.js`, nearly all of it plugin code that isn't on. (An update written while Discord runs is scanned by the time Discord starts again, so this is about the starts after Defender's signature updates, which are frequent.) So after a start the preload writes `renderer.startup.cache` next to it, holding just the script, the chunks that start used and the translations it read, keyed by `renderer.js`'s size, time and file id. A start that finds it up to date reads only that; an update, a plugin turned on or a new language makes the next start read `renderer.js` and write it again. The main process opens whichever of the two the preload will read in the background as it starts, so a scan overlaps Discord's own startup (`patcher.ts`). The translation tables cost almost nothing to scan, which is one more reason they're kept as JSON after the code.
- **No asynchronous file calls in the window.** The first one (`fs/promises`, `fs.readFile`...) starts Node's thread pool in that process, and Windows commits the 8 MB stack of each of its four threads up front: 32 MB of the window's memory for the rest of the session. The preload uses synchronous calls only, outside the start; anything slower goes to the main process. `test/chunks.mjs` checks the built preload.
- **The preload makes one synchronous call.** The settings and the start record come back from one request (`BOOT_AND_SETTINGS_REQUEST`), and the plugins' native methods are listed by the build (`nativeMethodsPlugin`), since every synchronous call waits for Discord's main process, which is busiest right then.
- **Plugins left out of a build don't bring their native code** (`globNativesPlugin`): a `.dev` plugin's native.ts once put 90 KB of YAML parser into every release's main process.
- **Discord's own background work stays as Discord leaves it.** A plugin that stops something must stop it fully: NoSystemHelper once skipped only the System Helper's install call, so Discord thought it had worked and kept retrying a connection to the missing helper.
- **Endcord's own screens bring their styles when they open.** A stylesheet that only a settings tab, a dialog or the welcome screen uses is imported with `?screen`, and stays out of Discord's page until one of them is drawn (`enableScreenStyles` in `src/api/Styles.ts`, called by `EndcordModal` and `SettingsTab`). Every rule on the page is matched again on each restyle, and this took Endcord's from 606 to 266.
- **Nothing synchronous waits on the disk at startup.** The page's start record is written after the answer is sent (`src/main/bootGuard.ts`).
- **Always-on CSS has to rule elements out by itself.** A selector like `[class*=badge] img` makes every image search all of its ancestors on every restyle. Write the right-hand part so it matches few elements (see `src/plugins/_api/badges/fixDiscordBadgePadding.css`).

## Endcord Desktop

Endcord's own app: Discord's web app (`https://discord.com/app`) in an Electron window of its own, for when Discord's desktop app stops being Electron. `pnpm buildDesktopApp` builds it into `dist/EndcordDesktop-<platform>-<arch>` and a zip of that folder (`scripts/build/buildDesktopApp.mjs`). It downloads a pinned Electron and, on Windows, a pinned rcedit that gives the exe Endcord's icon, name and version, both checked against checksums in the script. The app's own version is in `desktop/app.json`.

- **Endcord is the same code.** The app's window loads `endcordDesktopMain.js`, `endcordDesktopPreload.js` and `endcordDesktopRenderer.js`, which the normal build makes from `src/` with `IS_VESKTOP` set: the flag Vencord's code uses for a desktop app over Discord's web client, so plugins written for that keep working. The renderer has the same plugin chunks, translation tables and startup file as `renderer.js`, named after it (`endcordDesktopRenderer.startup.cache`).
- **The app itself is `desktop/src/`**, Endcord's own code, not Vesktop's: the window (`main.ts`), permissions and links, the screen share picker (`share.ts`, `sharePicker.ts`), the tray (`tray.ts`: open, keep running when closed, start at sign-in with `--hidden`), unread mentions on the taskbar from the page title (`badge.ts`), the text field menu Electron lacks (`contextMenu.ts`: spelling fixes, cut, copy, paste), a Start menu shortcut with the app id Windows needs to show notifications (`shortcut.ts`), and what Endcord's code asks a desktop app for (`VesktopNative`). A crashed page reloads, at most three times in five minutes. The app's few settings are in `desktop-settings.json` next to its profile; its words are in `strings.ts`.
- **The window only shows Discord.** Other pages open in the browser, Discord's blank popouts get neither Endcord nor the app's API, and Endcord's IPC answers Discord's pages only, here as in Discord's app.
- **Screen sharing asks before Chromium does.** A page's `getDisplayMedia` shows Endcord's picker first and then asks Chromium for exactly what was picked, so "no sound" can leave sound out of the request (Electron refuses a request whose sound isn't granted). On Windows the sound is what the computer plays minus the app's own (`loopbackWithoutChrome`), so a call doesn't hear itself.
- **Its own data folder.** Settings and themes live in the app's folder (`%APPDATA%\Endcord Desktop\Endcord`), copied from the mod's once on the first start, so the two never write one settings file. `ENDCORD_DESKTOP_DATA_DIR` points the whole profile elsewhere, for tests.
- **Updates.** Endcord's own updater (`src/main/updater`) reads `desktop/version.json` in this build instead of the mod's `version.json`, signed with the same key, and swaps the app's six files: the four `endcordDesktop*` files and the app's own `main.js` and `preload.js`. Its version names the Electron it was built on (`1.0.0+electron45.1.0`, signed with the rest); an app on another Electron doesn't take those files, it shows a notification that a new download is out instead (`needsNewApp`). `node scripts/uploadRelease.mjs --desktop` releases the app along with the mod: the zip and its checksum to the site folder, the six files and `desktop/version.json` to the public repo.
- **Light by default.** No spare renderer process, no menu, no crash reporter, the window stops drawing when hidden, and `--vanilla` starts it without Endcord to compare against. Node's thread pool in the main process is two threads instead of four (8 MB of committed stack each on Windows). Discord's page leaves garbage behind as it loads that V8 only collects much later, so 45 seconds after each load the app runs one full collection and a moderate memory-pressure signal (`trim.ts`); a hidden window is trimmed further by Endcord. Chromium's video capture service stays in its own process: run in the main process (`RunVideoCaptureServiceInBrowserProcess`) it saves 51 MB, but screen shares then sometimes never start.
- **Measured** (2026-11-05, logged out, test profiles, private memory of all processes 75 seconds after the page was up, nothing forced): Endcord Desktop with Endcord 363–439 MB against 490–496 MB for Discord's app with the Endcord mod; without Endcord 444 MB against Discord's 513 MB. Its main process is about 60 MB against Discord's 96–99, with no crash reporter. Numbers swing between runs by tens of megabytes (the GPU process alone went from 55 to 158 MB), so compare several runs.

## Tests

`pnpm test` builds, type-checks, lints, and runs:

- `test/security.mjs`: bundles the real main-process code with Electron stubbed out and attacks it. A security fix should come with a case here.
- `test/fuzz.mjs`: throws random hostile input at every validator and checks what each one promises. A failure prints a seed that replays it.
- `test/rules.mjs`: shows each of Endcord's own lint rules a mistake, so a rule can't quietly stop working.
- `test/ui.mjs`: the logic behind Endcord's own screens that can run without Discord, such as which release gets announced and what Theme Studio generates.
- `test/chunks.mjs`: every plugin chunk in the built `renderer.js` and `endcordDesktopRenderer.js` parses, defines itself and imports only chunks that exist, and the plugin list knows every lazy plugin. Then the preload's loader runs against that file with Electron stubbed: the startup file is written and read back, and ignored when it's damaged, out of date or missing a plugin that was turned on.
- `test/desktop.mjs`: Endcord Desktop's main process against a stubbed Electron: it starts, links leave for the browser, only Discord gets permissions, a screen share gets only what Discord's page picked, and the tray, taskbar badge, text field menu and crash reload behave. `test/security.mjs` also checks its updater: its own manifest, its own files, nothing built on another Electron.
- `scripts/qualityRatchet.mjs`: fails if `as any`, suppressions, oversized files, the script, the plugin chunks or the main process bundle grow.

`pnpm testMutation` runs weekly. It switches each security check off in turn, and `test/security.mjs` has to notice. A survivor means that check could be deleted with every test still green. When you add a check, add it to the list.

The suite makes its own signing key, so it never needs the real one. A few cases read `cdn.discordapp.com`, so it needs internet access.
