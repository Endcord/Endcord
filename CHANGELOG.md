# Changelog

What changed in each Endcord release. Every release is signed, and the updater checks the signature before it installs anything; [SECURITY.md](SECURITY.md) explains how to check a release yourself.

## 4.1.3 (2026-11-25)

### Fixed

- CustomProfile shares profiles through the Endcord server's new profiles channel; the old one was deleted. Your profile goes to the new channel by itself the next time Discord connects after this update, and others see it once their Endcord is updated too.
- FakeDeafen and FakeMute no longer really deafen or mute you when they're on before you join a voice channel. Discord set deaf or mute on the new connection before Endcord got to it.

## 4.1.2 (2026-11-20)

### Security

- A settings file could still set protected settings through an old plugin's name. The RichPresence and MusicRichPresence migrations copied a server address and key from an imported JellyfinRichPresence or LastFMRichPresence entry over the ones this device had, so the device's Jellyfin key could go to the file's server. A migration now keeps the server and key a device already has, and the old entries are deleted once migrated, so backups no longer carry their passwords.
- ExportDM's HTML export escapes everything it writes. Names, file names, emoji and links come from other people and could add markup or scripts to the file.
- The Linux installer no longer runs a script from /tmp with admin rights: it hands the script to pkexec or sudo directly.
- FileUpload no longer sends a file to anonymous public hosts when your own server fails, unless you turn on Fall Back to Public Hosts.
- MoreStickers checks an imported sticker pack before saving it. A crafted pack could overwrite any plugin's stored data.
- Endcord Desktop's main process is held to the same lint rules as Endcord's own (programs by full path, IPC handlers that check the page), and its screen share picker ignores key presses a page makes up.

### Fixed

- Fixes for Discord's November 19 builds. NoMosaic no longer breaks the attachment view. FakeNitro's profile decoration, effect, frame, nameplate, animated avatar and banner unlocks work again (Discord now checks these in fewer places, so the profile editor and the shop also show the Nitro options; Discord still checks on its side). SilentEdit, FavoriteAnything in embeds with several images, profile collections and sections in the DM sidebar, MutualGroupDMs, WebContextMenus' Copy, VoiceSettings' push-to-talk delay, FastGifPicker, BetterRoleDot and CtrlEnterSave work again, and DisableDeepLinks covers every "open in the app" prompt.
- Patches that could land in the wrong Discord module, depending on what loaded first, now find the right one: BannersEverywhere, CustomAppIcons, FakeNitro's app icon, FakeProfileThemes, MiddleClickTweaks, PinDMs, Questify, ShowMessageEmbeds, SortFriendRequests, SurfaceTranslate and ValidUser. ImplicitRelationships drops patches Discord made unnecessary.
- ClientSideBlock and AntiSoap no longer freeze Discord for over a minute when the member list loads. StatusPresets, Timezones and WebContextMenus patch faster too.
- Plugins that load more of Discord's code when you use them (PinDMs categories, CustomUserColors, Decor, PermissionsViewer, ReviewDB pages and others) load it again. Discord's newer builds number that code, and Endcord asked for it by name.
- MessageLoggerEnhanced keeps logging after Clear Logs. It stopped until the next restart, and with Clear logs on restart its start could hang.
- ScheduledMessages keeps a message queued when sending fails and tries again later, instead of losing it.
- RemindMe reminders more than 24.8 days away no longer go off at once.
- A settings file with a wrong kind of value (a number where a section goes, an empty plugin entry) no longer stops Endcord from starting.
- A damaged startup cache no longer stops Endcord from loading: it's ignored and made again.
- Updates: popouts and the game overlay no longer count as failed starts of a new release, two installs of an update can't run at once, Update Now tries again after a failed install, and a reinstall with an installer is no longer undone by the update's rollback.
- Safe mode: Restart normally no longer lands in safe mode again, and the browser version no longer goes into safe mode because of Discord's home, developer or sign-in pages.
- Endcord Desktop retries when Discord's page doesn't load (offline at sign-in), Restart no longer hides it in the tray after it started with Windows, a window saved on a monitor that's gone opens on screen, game detection tries again when Discord's list fails, and the screen share picker speaks Spanish, French and Russian too.
- Windows installer: an interrupted install no longer leaves Discord unable to start, an unreadable settings.json is left alone, the cancel and uninstall screens say what really happened, an Endcord install on a custom path is counted before Endcord's files are removed, two installers can't run at once, and closing Endcord Desktop's setup while it works cancels it cleanly.
- Linux installers: Uninstall keeps your Endcord settings and themes, Repair after a Discord update keeps the new app.asar, files get readable permissions whatever the umask, a failed patch puts Discord's files back, another mod's loader is backed up instead of deleted, gui.py refuses to run as root, and a Flatpak Discord restarts inside its sandbox.
- Plugins: QuickDelete no longer deletes several messages when the key is held, VoiceChatUtilities paces its bulk changes, SharePerms limits hold when commands arrive at once, AntiNickname keeps the nickname you set yourself, FakeTag and FakeNitroAge can be turned off separately, EventLogs no longer rewrites its whole log on every event and can't be crashed by a message that says "constructor", ExportDM waits out rate limits and says when an export is incomplete, SongLink shows an error instead of loading forever, MessageTranslate and ReviewDB back off after rate limits, Streaks syncs at most every ten minutes per friend, PullUserIntoVoice waits until the user is in a voice channel, VoiceMessages lets go of the microphone, RecordUrMic deletes Discord's raw copy of a recording once it's saved, Jellyfin's privacy mode hides the title everywhere, NoDMWhileStreaming blocks Discord's own DM notifications, SelfDestruct keeps planned deletions across restarts, MessageVault keeps each account's messages apart, GifCollections checks imported collections, FileUpload and ZIP+ upload through Endcord Desktop's own process, and SekaiStickers and TriviaAI work on desktop (their hosts were missing from the content security policy).
- MusicControls' lyrics fallback setting works and is off by default, so the Spotify track id only goes to the Vercel lyrics proxy when you turn it on, and lyrics stop being fetched when you turn them off.
- ChannelWallpaper only uploads a wallpaper picked from a file to Imgur in a DM with sync on (it did in every channel), only sends its sync message when sync is on, and keeps other files on this PC, up to 2 MB.

### Changed

- The Language setting changes Endcord's language only. It said it changed Discord's too, but only forced an old Discord helper to English at every start.
- Descriptions say where data goes: MessageTranslate and SurfaceTranslate send text to Google Translate, and ChannelWallpaper's sync uses Imgur.
- The release build sorts files the same way on every machine, and the chunked build keeps the styles of five components it used to drop.
- The daily patch report lists noWarn patches that do nothing in a section of their own.

## 4.1.1 (2026-11-15)

### Added

- Panda visits: now and then the panda somersaults along the bottom of Discord, head to toe. Click it to catch it. It never comes while you're typing, sharing your screen or watching something full screen, and Panda visits in the Endcord tab turns it off. A few smaller surprises came with it.

### Security

- SharePerms kept its limits only for well-formed commands. The user named in a command went into the request's address as typed, so someone given a single permission could reach other parts of the account: `+kick ../../../channels/<id>` deleted a channel. Commands now take a mention or an ID and nothing else.
- AntiDeleteMessage no longer sends back a message you deleted yourself on this device. It used to, so something pasted by mistake couldn't be removed while the plugin was on.
- A settings file or cloud sync can't set the protected settings at all. Until now a hand-made file could on a device that had none of them set, which let it choose who may use SharePerms or where uploads go. Whom FollowUser follows into voice channels and calls, and whom AutoDisconnect acts on, are protected the same way.
- The updater, install.sh and the Linux installer check the shape of a release manifest as well as its signature. The signature covers the fields joined by line breaks, so a file's line could be moved into the installer hash and the release would verify with that file left out; a manifest must now list exactly Endcord's files and keep each field to its own line.
- A download or upload that is redirected to another host no longer takes its headers or its file along: an upload service's key stays with the server it was typed for.
- PdfViewer's pdf.js and its worker, and InvisibleChat's StegCloak, only run when they match their known hashes. Both run inside Discord's own page, and until now whatever the CDN served was trusted.
- ChannelWallpaper takes a friend's sync message only in your DM with that friend (it used to take one from any channel you share) and no longer asks Discord to delete the friend's message. The default password for a sync server is now `endcord`; a server still set to the old default needs it typed in.
- FileViewer opens its viewer in a sandboxed frame, and its description says the file's link goes to Google, Microsoft or viewstl.com.
- The browser extension and the userscript only run on discord.com and its PTB and Canary apps. They used to load on every discord.com subdomain, such as the support site, and removed that site's content security policy too.
- The Linux installer's window address carries a code that works once instead of the token its API trusts, since other users of the computer can read a process's command line. It only uses admin rights in a folder that belongs to root.
- install.sh only downloads over https, and takes just Endcord's four files out of the archive, by name.
- Starting Discord signed out no longer counts against an update. Three starts on the login page used to undo a working update and refuse it for a day.
- The loader the installers write no longer reads the folder override that exists for the installer's own tests.
- Smaller hardening: CallRecorder never overwrites a file or writes to a device name, arRPC's local server can't send Discord other kinds of events, MessageLoggerEnhanced caps how much one log read may ask for, the toolbox only opens a download link on endcord.com, an unused host left the content security policy, and the build workflow no longer leaves its token in the checkout.
- A profile another Endcord user shared is checked harder before it's shown. Its picture links may only hold the characters Discord's own links do: anything else could have reached into a theme's CSS through FullVCPFP and ThemeAttributes, which now quote the link as well. Badge bits that mean something else to Discord (system account, verified bot, spammer) are dropped, badge ids, tiers and nameplate palettes are matched against what Endcord knows, and the invisible characters that hide text or flip its direction are removed from names, pronouns and bios.

### Fixed

- With CustomProfile on, Discord no longer crashes for a moment as it starts, when you save a profile, or when another Endcord user's profile arrives. For names it changes, CustomProfile skipped part of Discord's own code, so the chat drew a message with fewer of its parts than the time before, which React can't handle.
- "+N" next to a profile's badges shows the rest of them again. With Discord's new badge pages, a profile shows six badges and "+N" opened Discord's page, which only lists the badges Discord gives out: Endcord's and the plugins' were missing, so for many profiles it was empty, or showed an error when Discord's servers didn't answer. It opens Endcord's badge window now, with every badge on the profile.
- CustomProfile lists the whole shop again. When Discord had already loaded a few items, such as the decoration on a profile it showed, the window took those few for the shop and offered only them.
- The link at the top of a plugin's window opens the plugin's source code on GitHub. It went to a page on endcord.com that doesn't exist.
- Plugins can show their small pop-up messages (toasts) again. Discord's November 14 update rebuilt how toasts work, and every plugin action that ended with one failed with an error.
- Fixes for Discord's November 14 update. BetterForwards' footer under a forwarded message opens the channel it came from again: it goes there with Discord's own navigation instead of the code Discord removed. Questify's button in the server list, and the classes and colors it gives quest tiles (Canary), work again.
- RoleColorEverywhere colors names in voice channels again while VoiceFakeDetector is on: the two changed the same spot, and whichever started second did nothing.
- WebScreenShareFixes keeps stereo on whenever DTX is off in the browser while VoiceSettings is on too. VoiceSettings' Force Stereo changed the same line first, and WebScreenShareFixes then found nothing to change.
- A creation date chosen in CustomProfile showed only on your own screen. Other Endcord users see it now, in your profile and as your account's age, like the rest of what you set there. A date someone else shares is only taken when it's a real day.
- Fixes for Discord's November 10 update. NoBlockedMessages hides blocked messages again. WebScreenShareFixes no longer adds stereo twice now that Discord adds it too. FakeNitro's and BetterScreenShare's quality and theme unlocks also work where Discord moved its Nitro checks (Canary). ShowHiddenChannels drops a patch for voice joins Discord no longer makes when you click a channel mention.
- The Plugins tab no longer breaks with "Plugin code … isn't in this build" when Endcord's files were replaced while Discord was open. Search skips the plugins it can't load and asks once for a restart, and those plugins are listed with a note to restart.
- The Linux installer falls back to endcord.com's release archive when GitHub can't be reached. It used to read single files from the site, which Cloudflare's warning on endcord.com held back, so the fallback never worked.
- More names left over from other clients are gone. Endcord Desktop's build flag and API no longer carry Vesktop's name, and its theme style is `endcord-desktop-css-core`. MusicControls' Tidal player and FontLoader use Endcord's `ec-` classes instead of Equicord's `eq-`; themes that styled the old names need the new ones. ShowBadgesInChat no longer lists the donor and contributor badges twice, once under Vencord's name. ServerBackup writes `endcord-server-backup` and still opens older backups. Questify's quest notes, three loading quotes and three plugin READMEs no longer talk about other clients, and checks for Legcord, which Endcord never runs in, are gone.
- 12 translations nothing showed any more were removed.
- UserPFP loads its list of avatars again; Endcord's content security policy was blocking it.
- Names left over from other clients are gone from what you see: SharePerms' messages and its help (which listed a command that doesn't exist), EventLogs' export file, DiscordDevBanner's variables and its "Vesktop" label inside Endcord Desktop, and three plugin descriptions that pointed at Vesktop. EventLogs and FakeDM keep what they saved under the old names. Three console shortcuts and a settings icon that only worked in Vesktop were removed.
- ChannelWallpaper's "From a URL…" did nothing in the desktop app, which has no browser prompt. It asks in a window of its own now, and checks the link is an image or a video.
- BetterSessions, Decor, IRememberYou and ProfileSets threw when they started before an account had signed in. IRememberYou's tab no longer breaks when it opens before its saved list has loaded, and Wellbeing's tab is there even when its saved numbers can't be read.
- Eight plugins (ChannelTabs, EventLogs, ExportDM, FakeDM, MoreStickers, ProfileSets, ReorderAttachments, ThemeLibrary) animated every property of some elements, including ones that change their layout; they now animate only what changes.
- A dropdown in the Endcord tab, like Language or Badge dates, opened under the group below it.
- Typing in the CustomProfile window was slow: every key redrew all of the shop's decorations, effects, frames and nameplates and two dozen styled names. Each shelf now redraws only when its own pick changes, and pictures out of view aren't drawn.
- An older installer no longer takes Endcord back to its own release. Endcord updates itself, so an installer kept in Downloads can be older than the Endcord it finds; it now keeps the newer one and only hooks Discord up again, and says so. It keeps those files only when the signed release manifest confirms they are Endcord's: anything else, a file planted there under a high version included, is replaced with the installer's own.
- Turning FakeFriends and SurfaceTranslate off and on in some orders broke Discord until a restart: both changed the same parts of Discord, and one could bring back the other's code after that plugin was off, or end up calling itself. Plugins that change Discord's stores now share one way of doing it that works in any order. MessageLoggerEnhanced and CustomProfile use it too.
- CustomCommands turned off now takes your tags with it, and turning it on again works. Before, the tags stayed usable and the plugin couldn't start again until Discord restarted.
- A command with sub-commands, like /tags, leaves the list when its plugin is turned off.
- AlwaysAnimate keeps animating gradient role colors in the member list on Discord's next update, which adds another place its old search matched first.
- WebScreenShareFixes and VoiceSettings' Force Stereo keep stereo audio, and Questify keeps blocking quest fetches, on Discord's next update, which rewrites both places.
- ImageZoom stops listening to the video it zoomed once the zoom closes.
- When a plugin's change makes one of Discord's modules fail, the log and the plugin report say which plugins changed it, instead of a bare TypeError.
- When a plugin's change made one of Discord's modules fail, Discord's own code ran in its place, but on top of the failed attempt, so the module stayed broken and every plugin that searched past it failed too. Signed out on Discord Stable this hit Discord's settings menu, which is why the daily plugin report listed about 440 broken searches; it lists none now.
- DefaultStatusForever did nothing; the custom status window now starts "Clear after" at Don't clear.
- MusicControls can translate lyrics again. The translation always failed, so lyrics stayed in their own language.
- Settings that did nothing now work: GlobalBadges' Paicord badges switch, MentionColors' server list and channel list switches, WhosWatching's spectator panel switch, and MessageLoggerEnhanced's switch to stop saving messages.
- MentionColors gives the badges back to Discord when it is turned off, instead of leaving them colored.
- VoiceMessagesInBackground's player shows its pulsing ring while a message plays.
- TidalEmbeds' player never showed in the desktop app: Discord's page doesn't allow frames from embed.tidal.com, and Endcord now does.
- A HopOn or BlockKeywords pattern that isn't a valid regex no longer breaks the plugin: HopOn threw on every message and BlockKeywords failed to start. Such a pattern just doesn't match now, and BlockKeywords' Regex Helper shows which one it is. HopOn also builds its pattern once instead of on every message.
- ClearURLs skips a provider whose pattern JavaScript can't read, instead of losing every provider.
- EncryptedMessage's decrypted text could end up under the copy of a message that MessageLinkEmbeds shows, instead of under the message itself: it checked a mark by its old Vencord name. UnlimitedFavoriteGIFs' fallback looked for Discord's modules under Vencord's name too, so it never found them.
- CustomProfile's shop sections missed what Discord only sells in a bundle, and a product opened in the shop never showed up in them: they asked Discord for a smaller catalog than its own shop does, and only refreshed when the whole catalog came in. They now ask the way the shop does, so either one's fetch serves both, list a bundle's parts and every variant, and take in products as they arrive. The catalog is also kept on this computer, so the window lists it at once instead of waiting for the shop after every start, and a search field finds an item by name across all four sections.
- MessageLoggerEnhanced's first start could fail to make its image folder when its data folder didn't exist yet. It also read, and the first time wrote, its settings file every time Discord started, with the plugin off too; now that waits until the plugin uses it.
- Turning on a plugin did nothing, its switch just slid back, when Endcord's files had been replaced while Discord was open: that plugin's code wasn't in the files any more and the error went nowhere. After an update Endcord now reads the code from the copy of the running version the updater keeps, and when that's gone too (files replaced by the installer or by hand), a notice says to restart Discord, with a button for it.
- Turning on a plugin that needs a restart made the Plugins tab jump: the restart card appeared at the top and pushed the whole list, the card you just clicked included, down by its height. The card you switch now stays exactly where it was.
- The weekly mutation test failed after 4.1.0: two of its entries, the rollback's file restore and the secret scrub on settings exports, still named the lines as they read before that release rewrote them. They match again, and every test run now checks that each entry still matches one place in the source, so a rewritten line is noticed with the change that rewrote it.

### Removed

- About 2,000 lines nothing used: functions, plugin parts left behind by older versions of their patches, styles no element has, 119 translations per language of text Endcord no longer shows, and four packages.
- MotionBlur's "whole app" switch, which did nothing: the blur always covers the whole window. Its strength slider now stops at 6 px, where the blur stops.
- FileSplitter's "join files after download" switch, which did nothing.

### Changed

- Downloads come from Endcord's [GitHub releases](https://github.com/Endcord/Endcord/releases) instead of endcord.com, which keeps its pages, install.sh and the update archive. Every release lists its files with a SHA256SUMS. Old links to the files on endcord.com lead to the same downloads.
- The installer says what Endcord sends over the network: nothing to us, an update check on GitHub, and whatever a plugin you turn on uses. endcord.com has a [code signing policy](https://endcord.com/code-signing-policy) for the coming signed Windows downloads.
- CustomProfile's window has the switch for seeing other Endcord users' profiles at the top. It was only in the plugin's settings, where it was easy to turn off without noticing.
- The Endcord tab is laid out like the installer: the panda logo, the version and how many plugins and themes are on at the top, with the contribution and donation cards right under it, then quick actions and the settings in groups (General, Appearance, Window, Performance, Advanced). Where the Endcord section goes in Settings can be picked right there. The panda on the logo wakes up while you point at it.
- Endcord's entry in Discord's settings has the logo, the E with the panda asleep on it, and every Endcord tab, including those plugins add, has a new two-tone icon that matches Discord's own, in pixel style too.
- Endcord's switches, settings and Control Center move more like things a hand moves. A switch's knob stretches while pressed, springs across a little past the end and settles, and its mark rolls with it. Settings pages come in a part at a time, the first plugin cards and the ones a search brings back come in as a wave, and a plugin's card takes a blue edge when it's on. Tiles, buttons and the logo sink when pressed and spring back. The Control Center grows out of its button and goes back into it, one highlight slides between its rows, the counts and the memory number count to their values, and a switched-on row's icon hops. Endcord's entries in Discord's settings sidebar share one blue light that slides to the one under the pointer, and their icons spring, while Discord's own entries keep Discord's hover. The CustomProfile window comes in a part at a time, and its choices, toggle, fields and buttons move the same way. With Discord's reduced motion on, none of it moves.
- FakeNitro, CustomProfile, HideEndcord, MessageLogger, SmoothType and oneko list rootpoi as their author.
- Plugin windows, about 75 of them, open in Endcord's colors and move like Endcord's own: their parts come in one after another and buttons sink when pressed and spring back. Plain fields and buttons a plugin left unstyled are drawn as Endcord's, and SharePerms, FakeDM, EventLogs and ExportDM no longer fix Discord's old colors, white text or neon greens in place.
- Every plugin's preview video is redone in a finished look: the Discord window sits on Endcord's night with the plugin's name above it and the caption under it, so nothing covers the chat, at 1280×720 and 60 fps. The "plugin turned on" switch the videos were meant to show now appears.
- Thirteen plugin descriptions that read as unfinished are rewritten, among them RecordUrMic, NoRoleHeaders, InRole, PlainFolderIcon and SteamStatusSync.
- The bug report form asks which Endcord version you have and points to the Endcord server and endcord.com/download, instead of Vencord's.
- The last places where Endcord's own text or code still said Vencord say Endcord: UserpluginInstaller's settings and messages, the translations ShowBadgesInChat no longer used, and a few internal names. The copyright notices in file headers stay, as the GPL requires.
- Code comments across Endcord read like a person wrote them: about 800 rewritten in plain technical English and 170 that only repeated the next line removed. Leftovers in French, Turkish and Italian are in English, "Step 1:" and "FIX:" notes, box-drawing banners and doc comments that restate a method's name are gone, and a few log messages lost their emoji. ZIP+ lost an unreachable fallback branch. No behaviour changes.

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

- ChannelWallpaper's "From a URL…" did nothing in the desktop app, which has no browser prompt. It asks in a window of its own now, and checks the link is an image or a video.
- BetterSessions, Decor, IRememberYou and ProfileSets threw when they started before an account had signed in. IRememberYou's tab no longer breaks when it opens before its saved list has loaded, and Wellbeing's tab is there even when its saved numbers can't be read.
- Eight plugins (ChannelTabs, EventLogs, ExportDM, FakeDM, MoreStickers, ProfileSets, ReorderAttachments, ThemeLibrary) animated every property of some elements, including ones that change their layout; they now animate only what changes.
- A dropdown in the Endcord tab, like Language or Badge dates, opened under the group below it.
- Typing in the CustomProfile window was slow: every key redrew all of the shop's decorations, effects, frames and nameplates and two dozen styled names. Each shelf now redraws only when its own pick changes, and pictures out of view aren't drawn.
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

- ChannelWallpaper's "From a URL…" did nothing in the desktop app, which has no browser prompt. It asks in a window of its own now, and checks the link is an image or a video.
- BetterSessions, Decor, IRememberYou and ProfileSets threw when they started before an account had signed in. IRememberYou's tab no longer breaks when it opens before its saved list has loaded, and Wellbeing's tab is there even when its saved numbers can't be read.
- Eight plugins (ChannelTabs, EventLogs, ExportDM, FakeDM, MoreStickers, ProfileSets, ReorderAttachments, ThemeLibrary) animated every property of some elements, including ones that change their layout; they now animate only what changes.
- A dropdown in the Endcord tab, like Language or Badge dates, opened under the group below it.
- Typing in the CustomProfile window was slow: every key redrew all of the shop's decorations, effects, frames and nameplates and two dozen styled names. Each shelf now redraws only when its own pick changes, and pictures out of view aren't drawn.
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

- ChannelWallpaper's "From a URL…" did nothing in the desktop app, which has no browser prompt. It asks in a window of its own now, and checks the link is an image or a video.
- BetterSessions, Decor, IRememberYou and ProfileSets threw when they started before an account had signed in. IRememberYou's tab no longer breaks when it opens before its saved list has loaded, and Wellbeing's tab is there even when its saved numbers can't be read.
- Eight plugins (ChannelTabs, EventLogs, ExportDM, FakeDM, MoreStickers, ProfileSets, ReorderAttachments, ThemeLibrary) animated every property of some elements, including ones that change their layout; they now animate only what changes.
- A dropdown in the Endcord tab, like Language or Badge dates, opened under the group below it.
- Typing in the CustomProfile window was slow: every key redrew all of the shop's decorations, effects, frames and nameplates and two dozen styled names. Each shelf now redraws only when its own pick changes, and pictures out of view aren't drawn.
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
