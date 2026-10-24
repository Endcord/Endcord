using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace EndcordInstaller.Core
{
    public static class KnownPlugins
    {
        static readonly string[] BuiltIn = new string[] {
            "AccountPanelServerProfile", "AdvancedPermissions", "AltKrispSwitch", "AlwaysAnimate", "AlwaysExpandProfiles", "AlwaysExpandRoles", "AlwaysTrust", "Animalese", "AnonymiseFileNames", "AppleMusicRichPresence", "AtSomeone", "AutoDNDWhilePlaying", "AutoJumpToMessage", "AutoReact", "AutoVaporwave", "AutoZipper", "AvatarGrabber", "BadgeAPI", "BannersEverywhere", "BetterActivities", "BetterAudioPlayer", "BetterBanReasons", "BetterBlockedUsers", "BetterCommands", "BetterFolders", "BetterForwards", "BetterGifAltText", "BetterGifPicker", "BetterImageEditor", "BetterInvites", "BetterPlusReacts", "BetterRoleContext", "BetterRoleDot", "BetterScreenShare", "BetterSessions", "BetterSettings", "BetterUploadButton", "BiggerStreamPreview", "BlockKrisp", "BlurNSFW", "BoldText", "BypassPinPrompt", "BypassStatus", "Calculator", "CallTimer", "ChannelBadges", "ChannelTabs", "CharacterCounter", "ClapText", "CleanChannelName", "CleanerChannelGroups", "ClearURLs", "ClickableRoles", "ClickSparkles", "ClientSideBlock", "ClientTheme", "ClipsEnhancements", "ClipUpload", "CollapsibleUI", "ColorSighted", "CommandPalette", "ConsoleJanitor", "ConsoleShortcuts", "ContentWarning", "CopyEmojiMarkdown", "CopyFileContents", "CopyProfileColors", "CopyStatusUrls", "CopyStickerLinks", "CopyUserMention", "CopyUserURLs", "CrashHandler", "CursorBuddy", "CustomCommands", "CustomCursor", "CustomFolderIcons", "CustomIdle", "CustomProfile", "CustomRPC", "CustomSounds", "CustomStatusTimeouts", "CustomTimestamps", "CustomUserColors", "Dearrow", "Declutter", "Decor", "DevCompanion", "DisableCallIdle", "DisableCameras", "DisableDeepLinks", "DiscordDevBanner", "DontRoundMyTimestamps", "DoubleClickEdit", "DownloadAllAttachments", "DragFavoriteEmotes", "Dragify", "EndcordToolbox", "ExitSounds", "Experiments", "ExportMessages", "ExpressionCloner", "F8Break", "FakeConnections", "FakeDeafen", "FakeLag", "FakeMessage", "FakeMute", "FakeNitro", "FakeNitroAge", "FakeProfileThemes", "FakeTag", "FastDeleteChannels", "FavoriteEmojiFirst", "FavoriteGifSearch", "FavouriteAnything", "FileUpload", "FindReply", "FixCodeblockGap", "FixFileExtensions", "FixImagesQuality", "FixSpotifyEmbeds", "FixYoutubeEmbeds", "FollowVoiceUser", "FontLoader", "ForceOwnerCrown", "FrequentQuickSwitcher", "FriendCodes", "FriendInvites", "FriendshipRanks", "FullSearchContext", "FullUserInChatbox", "FullVCPFP", "GameActivityToggle", "Ghosted", "GifCollections", "GifMaker", "GifPaste", "GitHubRepos", "GlobalBadges", "GoogleThat", "GreetStickerPicker", "HideChatButtons", "HideEndcord", "HideMedia", "HideMessages", "HideServers", "HomeTyping", "HopOn", "IconViewer", "IdleAutoRestart", "IgnoreActivities", "IgnoreCalls", "ImageFilename", "ImageLink", "ImageZoom", "ImplicitRelationships", "InRole", "InstantScreenshare", "InviteDefaults", "IrcColors", "IRememberYou", "iLoveSpam", "Jumpscare", "KeepCurrentChannel", "KeyboardNavigation", "KeyboardSounds", "KeywordNotify", "LastActive", "LastFMRichPresence", "LeetText", "LimitlessScreenshare", "LoadingQuotes", "LoginWithQR", "MarkdownTables", "MediaPlaybackSpeed", "MemberCount", "MemberListDecoratorsAPI", "MentionAvatars", "MessageBurst", "MessageClickActions", "MessageColors", "MessageDecorationsAPI", "MessageFetchTimer", "MessageLatency", "MessageLinkEmbeds", "MessageLinkTooltip", "MessageLogger", "MessageLoggerEnhanced", "MessageNotifier", "MessagePeek", "MessageTranslate", "MicLoopbackTester", "MoreCommands", "MoreQuickReactions", "MoreStickers", "Moyai", "MusicControls", "MutualGroupDMs", "NeonGlow", "NewGuildSettings", "NoBlockedMessages", "NoDevtoolsWarning", "NoF1", "NoMaskedUrlPaste", "NoMiddleClickPaste", "NoMosaic", "NoNitroUpsell", "NoOnboardingDelay", "NoPendingCount", "NoProfileThemes", "NoPushToTalk", "NoReplyMention", "NormalizeMessageLinks", "NoRoleHeaders", "NoServerEmojis", "NoSystemBadge", "NoSystemHelper", "NotificationVolume", "NoTypingAnimation", "NoUnblockToJump", "oneko", "OnePingPerDM", "OpenInApp", "OverrideForumDefaults", "PartyMode", "PauseInvitesForever", "PermissionFreeWill", "PermissionsViewer", "petpet", "PictureInPicture", "PinDMs", "PinIcon", "PlainFolderIcon", "PlatformIndicators", "PlatformSpoofer", "PreviewMessage", "Questify", "QuickDelete", "QuickMention", "QuickReply", "QuickThemeSwitcher", "RandomVoice", "ReactErrorDecoder", "ReactionTimestamps", "ReadAllNotificationsButton", "RecentDMSwitcher", "RelationshipNotifier", "RemindMe", "RemixRevived", "RepeatMessages", "ReplaceGoogleSearch", "ReplyPingControl", "ReplyTimestamp", "RevealAllSpoilers", "ReverseImageSearch", "ReverseText", "ReviewDB", "RichMagnetLinks", "RichPresence", "RoleColorEverywhere", "RPCEditor", "SaveFavoriteGIFs", "ScheduledMessages", "SearchFix", "SecretRingToneEnabler", "SedEnhanced", "SekaiStickers", "SendTimestamps", "ServerInfo", "ServerListIndicators", "ServerSearch", "ShikiCodeblocks", "ShipCalc", "ShowAllMessageButtons", "ShowBadgesInChat", "ShowConnections", "ShowHiddenChannels", "ShowHiddenThings", "ShowMessageEmbeds", "ShowMeYourName", "ShowResourceChannels", "ShowRolesInChat", "ShowTimeoutDuration", "ShowTypingUsers", "SidebarChat", "Signature", "SilenceUsers", "SilentEdit", "SilentMessageToggle", "SilentTyping", "SmoothType", "Snowfall", "SongLink", "SongSpotlight", "SortFriendRequests", "SpaceOut", "SplitLargeMessages", "SpotifyActivityToggle", "SpotifyControls", "SpotifyCrack", "SpotifyShareCommands", "Starify", "StartupTimings", "StatusPresets", "StatusWhileActive", "SteamStatusSync", "StickerBlocker", "StickerPaste", "StopAutoUnread", "Streaks", "StreamerModeOnStream", "StreamingCodecDisabler", "Summaries", "SuperReactionTweaks", "TalkInReverse", "TextReplace", "ThemeAttributes", "ThemeLibrary", "TidalEmbeds", "Timezones", "Title", "ToneIndicators", "Translate", "Translate+", "TriviaAI", "TypingIndicator", "TypingTweaks", "Unindent", "UnitConverter", "UniversalMention", "UnlimitedAccounts", "UnlockedAvatarZoom", "UnreadCountBadge", "UnsuppressEmbeds", "UrlHighlighter", "UserMessagesPronouns", "UserPFP", "UserpluginInstaller", "UserVoiceShow", "USRBG", "ValidReply", "ValidUser", "VcNarrator", "VCPanelSettings", "ViewIcons", "ViewRaw", "VoiceButtons", "VoiceChannelLog", "VoiceChatDoubleClick", "VoiceChatUtilities", "VoiceDownload", "VoiceJoinMessages", "VoiceMessages", "VoiceMessagesInBackground", "VoiceRejoin", "VoiceSettings", "VoiceStats", "VolumeBooster", "WaitForSlot", "WebContextMenus", "WebKeybinds", "WebpackTarball", "WebRichPresence (arRPC)", "WebScreenShareFixes", "WhitelistedEmojis", "WhoReacted", "WhosWatching", "WigglyText", "WikiLookup", "WriteUpperCase", "XSOverlay", "YoutubeAdblock", "ZipPreview"
        };

        public static readonly HashSet<string> All = BuildSet();

        static HashSet<string> BuildSet()
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var p in BuiltIn) set.Add(p);
            // Core internal plugins always present in Vencord/Endcord
            set.Add("Settings");
            set.Add("SupportHelper");
            set.Add("NoTrack");
            set.Add("WebContextMenus");
            set.Add("BadgeAPI");
            set.Add("ChatInputButtonAPI");
            set.Add("CommandsAPI");
            set.Add("ContextMenuAPI");
            set.Add("DynamicImageModalAPI");
            set.Add("MemberListDecoratorsAPI");
            set.Add("MessageAccessoriesAPI");
            set.Add("MessageClickActions");
            set.Add("MessageDecorationsAPI");
            set.Add("MessageEventsAPI");
            set.Add("MessagePopoverAPI");
            set.Add("MessageUpdaterAPI");
            set.Add("NoticesAPI");
            set.Add("ServerListAPI");
            set.Add("UserSettingsAPI");
            return set;
        }

        public static bool IsSupported(string pluginName)
        {
            if (string.IsNullOrEmpty(pluginName)) return false;
            return All.Contains(pluginName);
        }

        public static void RegisterFromRendererJs(string rendererJsContent)
        {
            if (string.IsNullOrEmpty(rendererJsContent)) return;
            try
            {
                var matches = Regex.Matches(rendererJsContent, @"name:\s*""([A-Za-z0-9_\- ]{2,50})""");
                foreach (Match m in matches)
                {
                    if (m.Success) All.Add(m.Groups[1].Value);
                }
            }
            catch { }
        }
    }
}
