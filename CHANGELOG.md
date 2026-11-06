# Changelog

What changed in each Endcord release. Every release is signed, and the updater checks the signature before it installs anything; [SECURITY.md](SECURITY.md) explains how to check a release yourself.

## 4.1.0 (2026-11-07)

### Added

- Control Center: the panda in the title bar opens your looks, profiles, Game Mode and memory use in one place.
- Theme Studio: pick colors, font and corners and watch Discord change as you go, with no code.
- Diagnostics: how long each plugin took to start and how much memory Discord uses, measured on your PC.
- Game Mode: while you play, Discord draws at a lower frame rate and pauses its animations.
- Streamer Shield: blurs your DM list in Streamer Mode, and can turn Streamer Mode on when you share your screen.
- A live security card that shows whether the running release is signed and its files are intact.
- A What's New card after big updates.
- 8 new plugins:
  - SecretGuard holds back a message that looks like it has a token, key, password or card number in it, until you press Enter again.
  - SuspiciousLinks warns under a message when a link only pretends to be Discord, Steam or another well-known site. Nothing is looked up online.
  - LocalTimes shows a time written with a time zone, like "8pm EST", in your own time zone.
  - QuoteMessage quotes a message in your message box, with who wrote it and a link back.
  - ReplyChain shows the whole conversation a reply answers, in one window.
  - DraftList lists every chat where you left a message unsent.
  - ColorText's /color writes your message in color.
  - PrivacyCurtain blurs Discord while you're away.
- An Endcord Developer badge, the panda, for the people who make Endcord. The Endcord Contributor badge is now a stalk of bamboo.
- A welcome screen on the first start: pick a look and a few packs of plugins, or start with none.
- CustomProfile is shared: other Endcord users see your profile, through the #profiles channel on Endcord's Discord server, a few seconds after you save it. Nothing goes through a server of Endcord's own.
- CustomProfile has a Nitro date: the day your Nitro badge says you subscribed, shown when someone hovers it.
- When Discord can't finish starting, Endcord looks for a newer release by itself after a few minutes, installs it and loads Discord again. Before, a release that broke on a new Discord could only be fixed by downloading the installer again.

### Changed

- Every Endcord screen uses one look, the Endcord theme, and one way of moving.
- The repository root is tidier: the installer's sources are in `installer/` and the app icons in `assets/`.
- File headers carry their original copyright notices again, as written in Vencord and Equicord.
- 18 plugins that did the same job as another plugin are gone. If you had one on, the plugin that does its job is turned on for you:
  - SpotifyControls → MusicControls
  - RecentDMSwitcher → RecentChannelSwitcher
  - FollowVoiceUser → FollowUser
  - CancelFriendRequestNC → CancelFriendRequest
  - ZipPreview and AutoZipper → ZIP+
  - GifCaptioner → GifMaker
  - LastFMRichPresence → MusicRichPresence
  - TalkInReverse → ReverseText
  - DoubleClickEdit → MessageClickActions
  - FavoriteMedia → FavoriteAnything
  - ProfileMedia → ViewIcons
  - StreamerModeOnStream → StreamerShield
  - Translate+ → Translate
  - ClickableRoles → InRole
  - FriendInvites → FriendCodes
  - rzStudioAudio → VoiceSettings
  - FavoriteGifSearch had nothing left to do, since Discord now searches favorite GIFs itself.
- The Plugins tab opens faster and stays smooth: it draws the first cards at once and the rest just after, and turning one plugin on no longer draws every card again. Its switch slides first, then the plugin starts.
- The CustomProfile editor has a wider scrollbar with room around it.
- The Privacy pack on the welcome screen includes SecretGuard and SuspiciousLinks.

### Fixed

- Discord Canary no longer stays on its "Starting" screen with Endcord installed. Newer Discord builds pass some exports as plain values and no longer mark modules as loaded, and Endcord now handles both.
- Discord's old color names point at the new ones, so themes written for them keep working.
- FileViewer works again. It read the file type from the link, which ends in Discord's signature, so it never showed its button, and Discord's security policy blocked the viewers it opens.
- With PdfViewer on, FileViewer leaves PDFs to it, so they aren't sent to Google's viewer.
- F8Break and HideEndcord both use F8. Turning one of them on now offers to turn the other off.
- ChannelTabs and RecentChannelSwitcher both use Ctrl+Tab. Turning one of them on now offers to turn the other off.
- Discord's update of November 6 broke these, and they work again:
  - Questify (the Quests tab in Discovery)
  - BetterSettings (the settings fade delay)
  - OnePingPerDM
  - KeywordNotify (its inbox tab)
  - BetterForwards (its footer)
  - The icons in IconViewer, ChannelTabs' folders and BetterForwards
  - SidebarChat's forum view
  - Every plugin that loads a part of Discord on demand
- Plugins fixed for the same new Discord: BadgeAPI, SurfaceClassesAPI, FakeNitro, AlwaysAnimate, VolumeBooster, CustomIdle, MoreJumboEmoji, NoDraftLengthLimit, OpenInApp, FavoriteAnything, FullVCPFP, USRBG, ImageLink, NoReplyMention, BetterImageEditor and PermissionFreeWill.
- RoleColorEverywhere colors reaction lists and poll results again, and the member list's role headers alongside BetterRoleContext.
- CustomTimestamps and RealtimeTimestamps show their tooltips on Discord's timestamps again.
- Notices from Endcord show again, and so does the version line in Settings.
- Questify keeps quest videos playing again.
- DmReadReceipt no longer breaks message previews, such as the one in CustomTimestamps' settings.
- BetterSessions no longer announces every session you already have as new the first time it runs.
- The welcome screen and the new plugins window no longer open on top of each other.
- ShowBadgesInChat's contributor badge shows again: its picture came from a site Discord blocks.

## 4.0.33 (2026-11-01)

### Fixed

- The window drags from its title bar again.
- Old Stable profiles that still use discordapp.com are trusted.

## 4.0.32 (2026-11-01)

### Security

- Releases are verified before they're installed, and the installers are hardened.
- The main process, the preload script and plugin natives are locked down.
- The browser extension and the build toolchain are hardened.
- Security tests, a threat model and architecture docs were added.

### Changed

- Translations are split into one file per language.
- Every repository link points at Endcord/Endcord.

### Fixed

- Plugin patches broken by Discord updates.

## 4.0.31 (2026-10-29)

- SupportHelper asks only once to join the Endcord server and to star the repository.

## 4.0.30 (2026-10-28)

- CustomProfile: hiding Nitro no longer breaks file uploads.

## 4.0.29 (2026-10-26)

- CustomProfile: avatar decorations and profile effects work again.
- Each plugin contributor is listed once.

## 4.0.27 (2026-10-24)

- Linux and macOS installs work even when the site's scripts are blocked.
- A macOS installer app that carries its own copy of Endcord.
- The unused profile-fetch code and the stale `api.endcord.com` entry in the content security policy are removed.

## 4.0.26 (2026-10-24)

The first release from this repository.

- Plugins that are off aren't loaded at all, and translations are built on first use, so Endcord starts faster and uses less memory.
- A new installer around the logo's pixel panda, which never removes a mod another Discord install still uses.
- Every plugin description, setting and message is available in English, Turkish, Russian, Spanish and French.
- Dozens of plugins fixed for current Discord, plugins that patch the same spot run together, and plugin conflicts are explained instead of crashing.
- Updater checksums, a reproducible [benchmark](benchmark/README.md) against Vencord, Equicord and plain Discord, and one-command releases.
