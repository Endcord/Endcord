/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Plugins whose work Discord can see and punish: acting on the account by themselves, sending many requests in a row,
// or telling Discord's servers something that isn't true. Plugins that only change what you see aren't here.
// The values are English text, translated where they're shown.
export const BAN_RISK: Readonly<Record<string, string>> = {
    AutoReact: "It reacts to messages by itself.",
    ScheduledMessages: "It sends messages by itself at the time you set.",
    SelfDestruct: "It deletes your messages by itself after a delay.",
    AntiDeleteMessage: "It sends your messages again by itself when someone deletes them.",
    AntiNickname: "It changes your nickname back by itself.",
    AutoDisconnectAndAutoMute: "It disconnects and mutes people by itself, again and again.",
    FollowUser: "It joins voice channels by itself.",
    FollowVoiceUser: "It joins voice channels by itself.",
    WaitForSlot: "It joins voice channels by itself.",
    PullUserIntoVoice: "It moves someone into your voice channel again and again.",
    SpotifyLyricsStatus: "It changes your status every few seconds.",
    ClearMyMessages: "It deletes many messages in a row.",
    ExportDM: "It loads a whole conversation's history in one go.",
    MutualServerMembers: "It asks Discord for whole member lists.",
    SplitLargeMessages: "It sends several messages in a row.",
    FakeDeafen: "It tells Discord's servers you're deafened when you aren't.",
    FakeMute: "It tells Discord's servers you're muted when you aren't.",
    PlatformSpoofer: "It tells Discord's servers you're on a different device.",
    ClanSwitcher: "It changes your server tag by itself, again and again.",
    Questify: "It can complete Quests for you without playing or watching them.",
    SilentDelete: "It edits and deletes many of your messages in a row.",
    VoiceChatUtilities: "It moves, mutes or disconnects a whole voice channel at once.",
};

export const BAN_RISK_LEAD = "Discord can suspend accounts for this.";
