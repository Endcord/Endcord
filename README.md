# Endcord

Endcord is a desktop client mod for Discord. It loads with the official app and adds plugins, themes, and a settings panel inside Discord.

Endcord is a fork of [Equicord](https://github.com/Equicord/Equicord) which is fork of [Vencord](https://github.com/Vendicated/Vencord).

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
git clone https://github.com/rootpoii/endcord.git
cd endcord
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

## License

[GPL-3.0-or-later](LICENSE). Copyright © rootpoi and contributors.

Endcord is not affiliated with Discord Inc.
