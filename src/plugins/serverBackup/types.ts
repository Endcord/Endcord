/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const BACKUP_FORMAT = "equicord-server-backup";
export const BACKUP_VERSION = 1;

export const ChannelTypes = {
    GUILD_TEXT: 0,
    GUILD_VOICE: 2,
    GUILD_CATEGORY: 4,
    GUILD_ANNOUNCEMENT: 5,
    GUILD_STAGE_VOICE: 13,
    GUILD_FORUM: 15,
    GUILD_MEDIA: 16
} as const;

export type CopyableChannelType = typeof ChannelTypes[keyof typeof ChannelTypes];

/** Channel types that can be created through the API. */
export const COPYABLE_CHANNEL_TYPES: readonly number[] = Object.values(ChannelTypes);

/**
 * Some channel types require server features (community, etc).
 * If creating the original type fails, retry with a compatible one.
 */
export const ChannelTypeFallback: Partial<Record<number, CopyableChannelType>> = {
    [ChannelTypes.GUILD_ANNOUNCEMENT]: ChannelTypes.GUILD_TEXT,
    [ChannelTypes.GUILD_STAGE_VOICE]: ChannelTypes.GUILD_VOICE,
    [ChannelTypes.GUILD_FORUM]: ChannelTypes.GUILD_TEXT,
    [ChannelTypes.GUILD_MEDIA]: ChannelTypes.GUILD_TEXT
};

export interface BackupRole {
    /** Role ID in the source guild. Used to remap permission overwrites on restore. */
    id: string;
    name: string;
    color: number;
    hoist: boolean;
    mentionable: boolean;
    /** BigInt serialised as a decimal string. */
    permissions: string;
    position: number;
    unicodeEmoji?: string | null;
}

export interface BackupOverwrite {
    /** 0 = role, 1 = member */
    type: 0 | 1;
    /** Role or user ID in the source guild. */
    id: string;
    /** BigInt serialised as a decimal string. */
    allow: string;
    /** BigInt serialised as a decimal string. */
    deny: string;
}

export interface BackupForumTag {
    name: string;
    emojiId?: string | null;
    emojiName?: string | null;
    moderated: boolean;
}

export interface BackupChannel {
    id: string;
    name: string;
    type: number;
    position: number;
    parentId?: string | null;
    topic?: string | null;
    nsfw?: boolean;
    rateLimitPerUser?: number;
    bitrate?: number;
    userLimit?: number;
    defaultAutoArchiveDuration?: number;
    videoQualityMode?: number;
    rtcRegion?: string | null;
    permissionOverwrites: BackupOverwrite[];
    availableTags?: BackupForumTag[];
    defaultReactionEmoji?: { emojiId?: string | null; emojiName?: string | null; } | null;
    defaultSortOrder?: number;
    defaultForumLayout?: number;
    defaultTagSetting?: string;
    /** True when the channel has no VIEW_CHANNEL for the exporting user (read from the client store). */
    hidden?: boolean;
}

export interface BackupGuildSettings {
    /** Source guild ID. Also the ID of the @everyone role. */
    id: string;
    name: string;
    description?: string | null;
    verificationLevel: number;
    explicitContentFilter: number;
    defaultMessageNotifications: number;
    afkTimeout: number;
    afkChannelId?: string | null;
    systemChannelId?: string | null;
    systemChannelFlags: number;
    preferredLocale: string;
}

export interface GuildBackup {
    format: typeof BACKUP_FORMAT;
    version: typeof BACKUP_VERSION;
    createdAt: string;
    guild: BackupGuildSettings;
    roles: BackupRole[];
    channels: BackupChannel[];
}

export interface RestoreProgress {
    stage: string;
    detail?: string;
    current: number;
    total: number;
}

export interface RestoreReport {
    rolesCreated: number;
    channelsCreated: number;
    errors: string[];
}

export interface RestoreOptions {
    /** Delete every existing channel and role (except roles the current user needs) before restoring. */
    deleteExisting?: boolean;
    /** Restore server-level settings like verification level and the system channel. */
    restoreGuildSettings?: boolean;
    /** Restore the server name from the backup. */
    restoreName?: boolean;
    /** Also copy permission overwrites that target individual members. */
    includeMemberOverwrites?: boolean;
    /** Delay in ms between write requests. */
    requestDelay?: number;
    onProgress?(progress: RestoreProgress): void;
}
