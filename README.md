# Endcord

Endcord is a desktop client mod for Discord. It loads with the official app and adds plugins, themes, and a settings panel inside Discord.

Endcord is a fork of [Vencord](https://github.com/Vendicated/Vencord)

[Website](https://endcord.com) · [Download](https://endcord.com/download) · [Discord](https://discord.gg/endcord)

## Install

Close Discord completely before installing, then open it again when the installer finishes.

### Windows

Windows 10 and 11. Stable, PTB, and Canary.

1. Download [EndcordInstaller.exe](https://endcord.com/EndcordInstaller.exe).
2. If the browser blocks the file, use [EndcordInstaller.zip](https://endcord.com/EndcordInstaller.zip) instead. It contains the same installer.
3. Run the installer and start Discord.

### macOS and Linux

macOS: Discord, PTB, or Canary in Applications. Linux: the official `.deb`, `.tar.gz`, or Flatpak; Snap is not supported.

Run this in Terminal:

```sh
sh -c "$(curl -fsSL https://endcord.com/install.sh)"
```

The installer downloads Endcord, checks every file against the release checksums, and patches the Discord installs you pick.

On macOS, the first run may stop with "macOS blocked the change". Open **System Settings > Privacy & Security > App Management**, turn on Terminal, reopen Terminal, and run the command again. When Discord updates itself on macOS, run the installer again and choose **Repair Endcord**.

## Uninstall

On Windows, open the installer again and restore the vanilla client.

On macOS and Linux, run the installer again and choose **Uninstall Endcord**. Your Endcord settings stay on disk in case you come back.

## Build

Node.js 22 or newer, and [pnpm](https://pnpm.io).

```sh
git clone https://github.com/Endcord/Endcord.git
cd Endcord
pnpm install
pnpm build
pnpm inject
```

`pnpm uninject` removes the local install. `pnpm watch` rebuilds while you edit.

## Plugins

Endcord ships with 500 built-in plugins, with every plugin and setting available in English, Turkish, Russian, Spanish and French. Turn them on from the Plugins tab in Discord's settings.

Plugin ideas and fixes go through pull requests. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening one.

## Performance

Endcord ships 500 plugins, nearly three times as many as Vencord, and runs in the same memory: within 2% of Vencord and below Equicord on every memory measure, with the lowest idle CPU of the three. Plugins are only loaded when you turn them on.

| | Endcord | Vencord | Equicord | Vanilla Discord |
|---|---:|---:|---:|---:|
| Plugins | **500** | 178 | 381 | – |
| Total RAM | 698 MB | **687 MB** | 727 MB | 672 MB |
| Renderer RAM | 401 MB | **397 MB** | 415 MB | 366 MB |
| JS heap after GC | 107 MB | **106 MB** | 110 MB | 98 MB |
| Idle CPU (one core) | **1.80%** | 1.87% | 1.88% | 1.51% |
| Launch to usable | 3.75 s | **3.42 s** | 3.43 s | 3.38 s |

Medians of 6 cold launches each, default settings, same Discord Stable build, Intel Core i5-12400F with 32 GB RAM on Windows 10. Bold marks the best of the three mods. See the [benchmark](benchmark/README.md) for the method, every run and a script to run it yourself.

## Endcord Desktop

Endcord's own app: Discord in an Endcord window of its own, with every Endcord plugin, setting and theme, and no Discord desktop app to patch. It's for when Discord's desktop app is no longer the Electron one mods can load into. It runs Discord's web app, the one in your browser, and Discord sees it as that. Like any client mod it's against Discord's terms, the same as the mod itself.

- A tray icon, closing to the tray, and starting with Windows (all in the tray menu)
- Unread mentions on the taskbar, notifications, and spell-checked text fields with cut, copy and paste
- Screen sharing with Endcord's own picker. The computer's sound can go along, without your call's voices
- Updates from Endcord's signed releases, the same way the mod gets them
- Your Endcord settings and themes come along on its first start, as a copy

Download `EndcordDesktop-win32-x64.zip` from [endcord.com/download](https://endcord.com/download), unzip it anywhere you like, and run `EndcordDesktop.exe`. It adds itself to the Start menu. To build it yourself: `pnpm buildDesktopApp`, which puts it in `dist/EndcordDesktop-<platform>-<arch>`. Windows is what it's tested on; the same build runs on Linux and macOS but hasn't been tried there yet.

Not there yet: push to talk while Discord is in the background, and showing the game you play.

## Credits

Endcord is built on [Vencord](https://github.com/Vendicated/Vencord) by Vendicated and its contributors. Most of its plugins come from [Equicord](https://github.com/Equicord/Equicord), by the Equicord contributors: Endcord includes every one of them. The code that came from both keeps its authors and its copyright notices. Endcord Desktop is Endcord's own code, written with [Vesktop](https://github.com/Vencord/Vesktop) as the example of what a desktop app around Discord's web app needs, and [arRPC](https://github.com/OpenAsar/arrpc) is what the game activity plugin talks to. Thank you all.

## License

[GPL-3.0-or-later](LICENSE), as Vencord's code requires of everything built on it. Copyright © Vendicated and the Vencord contributors, the Equicord contributors, and the Endcord team. Each file's header names the year it was first written.

Endcord is not affiliated with Discord Inc.
