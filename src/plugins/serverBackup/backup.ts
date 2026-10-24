/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { chooseFile, saveFile } from "@utils/web";
import type { Channel, Guild } from "@vencord/discord-types";
import { ChannelStore, Constants } from "@webpack/common";

import { request } from "./api";
import { settings } from "./settings";
import {
    BACKUP_FORMAT,
    BACKUP_VERSION,
    BackupChannel,
    BackupRole,
    COPYABLE_CHANNEL_TYPES,
    GuildBackup
} from "./types";

interface RawRole {
    id: string;
    name: string;
    color: number;
    hoist: boolean;
    mentionable: boolean;
    permissions: string;
    position: number;
    managed: boolean;
    unicode_emoji?: string | null;
}

interface RawOverwrite {
    id: string;
    type: 0 | 1;
    allow: string;
    deny: string;
}

interface RawChannel {
    id: string;
    type: number;
    name?: string;
    position: number;
    parent_id?: string | null;
    topic?: string | null;
    nsfw?: boolean;
    rate_limit_per_user?: number;
    bitrate?: number;
    user_limit?: number;
    default_auto_archive_duration?: number;
    video_quality_mode?: number;
    rtc_region?: string | null;
    permission_overwrites?: RawOverwrite[];
    available_tags?: {
        id: string;
        name: string;
        emoji_id?: string | null;
        emoji_name?: string | null;
        moderated: boolean;
    }[];
    default_reaction_emoji?: { emoji_id?: string | null; emoji_name?: string | null; } | null;
    default_sort_order?: number;
    default_forum_layout?: number;
    default_tag_setting?: string;
}

function normalizeOverwrites(overwrites: { id: string; type: number; allow: bigint | string; deny: bigint | string; }[] | undefined) {
    return (overwrites ?? []).map(overwrite => ({
        type: overwrite.type as 0 | 1,
        id: overwrite.id,
        allow: String(overwrite.allow),
        deny: String(overwrite.deny)
    }));
}

/** Reads channels from the client store, which also contains channels hidden by permissions. */
function getStoreChannels(guildId: string, existingIds: Set<string>): RawChannel[] {
    const channels = ChannelStore.getMutableGuildChannelsForGuild(guildId);
    if (!channels) return [];

    return Object.values(channels)
        .filter(channel => !existingIds.has(channel.id) && !!channel.name && COPYABLE_CHANNEL_TYPES.includes(channel.type))
        .map((channel: Channel) => ({
            id: channel.id,
            type: channel.type,
            name: channel.name,
            position: channel.position ?? 0,
            parent_id: channel.parent_id ?? null,
            topic: channel.topic ?? null,
            nsfw: !!channel.nsfw,
            rate_limit_per_user: channel.rateLimitPerUser ?? 0,
            bitrate: channel.bitrate,
            user_limit: channel.userLimit,
            default_auto_archive_duration: channel.defaultAutoArchiveDuration,
            video_quality_mode: channel.videoQualityMode,
            rtc_region: channel.rtcRegion ?? null,
            permission_overwrites: normalizeOverwrites(Object.values(channel.permissionOverwrites ?? {})),
            available_tags: channel.availableTags?.map(tag => ({
                id: tag.id,
                name: tag.name,
                emoji_id: tag.emojiId ?? null,
                emoji_name: tag.emojiName ?? null,
                moderated: !!tag.moderated
            })),
            default_reaction_emoji: channel.defaultReactionEmoji
                ? {
                    emoji_id: channel.defaultReactionEmoji.emojiId ?? null,
                    emoji_name: channel.defaultReactionEmoji.emojiName ?? null
                }
                : null,
            default_sort_order: channel.defaultSortOrder,
            default_forum_layout: channel.defaultForumLayout
        }));
}

interface RawGuild {
    id: string;
    name: string;
    description?: string | null;
    verification_level: number;
    explicit_content_filter: number;
    default_message_notifications: number;
    afk_timeout: number;
    afk_channel_id?: string | null;
    system_channel_id?: string | null;
    system_channel_flags: number;
    preferred_locale: string;
}

export async function createBackup(guild: Guild): Promise<GuildBackup> {
    const [rawGuild, rawRoles, restChannels] = await Promise.all([
        request<RawGuild>("get", { url: Constants.Endpoints.GUILD(guild.id) }),
        request<RawRole[]>("get", { url: Constants.Endpoints.GUILD_ROLES(guild.id) }),
        request<RawChannel[]>("get", { url: Constants.Endpoints.GUILD_CHANNELS(guild.id) })
    ]);

    const visibleChannelIds = new Set(restChannels.map(channel => channel.id));
    const hiddenChannels = settings.store.includeHiddenChannels ? getStoreChannels(guild.id, visibleChannelIds) : [];
    const rawChannels = [...restChannels, ...hiddenChannels];

    const roles: BackupRole[] = rawRoles
        .filter(role => !role.managed)
        .map(role => ({
            id: role.id,
            name: role.name,
            color: role.color ?? 0,
            hoist: !!role.hoist,
            mentionable: !!role.mentionable,
            permissions: role.permissions,
            position: role.position,
            unicodeEmoji: role.unicode_emoji ?? null
        }));

    const channels: BackupChannel[] = rawChannels
        .filter((channel): channel is RawChannel & { name: string; } =>
            !!channel.name && COPYABLE_CHANNEL_TYPES.includes(channel.type))
        .map(channel => ({
            id: channel.id,
            hidden: !visibleChannelIds.has(channel.id),
            name: channel.name,
            type: channel.type,
            position: channel.position,
            parentId: channel.parent_id ?? null,
            topic: channel.topic ?? null,
            nsfw: !!channel.nsfw,
            rateLimitPerUser: channel.rate_limit_per_user ?? 0,
            bitrate: channel.bitrate,
            userLimit: channel.user_limit,
            defaultAutoArchiveDuration: channel.default_auto_archive_duration,
            videoQualityMode: channel.video_quality_mode,
            rtcRegion: channel.rtc_region ?? null,
            permissionOverwrites: (channel.permission_overwrites ?? []).map(overwrite => ({
                type: overwrite.type,
                id: overwrite.id,
                allow: overwrite.allow,
                deny: overwrite.deny
            })),
            availableTags: channel.available_tags?.map(tag => ({
                name: tag.name,
                emojiId: tag.emoji_id ?? null,
                emojiName: tag.emoji_name ?? null,
                moderated: !!tag.moderated
            })),
            defaultReactionEmoji: channel.default_reaction_emoji
                ? {
                    emojiId: channel.default_reaction_emoji.emoji_id ?? null,
                    emojiName: channel.default_reaction_emoji.emoji_name ?? null
                }
                : null,
            defaultSortOrder: channel.default_sort_order,
            defaultForumLayout: channel.default_forum_layout,
            defaultTagSetting: channel.default_tag_setting
        }));

    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        guild: {
            id: rawGuild.id,
            name: rawGuild.name,
            description: rawGuild.description ?? null,
            verificationLevel: rawGuild.verification_level,
            explicitContentFilter: rawGuild.explicit_content_filter,
            defaultMessageNotifications: rawGuild.default_message_notifications,
            afkTimeout: rawGuild.afk_timeout,
            afkChannelId: rawGuild.afk_channel_id ?? null,
            systemChannelId: rawGuild.system_channel_id ?? null,
            systemChannelFlags: rawGuild.system_channel_flags,
            preferredLocale: rawGuild.preferred_locale
        },
        roles,
        channels
    };
}

export function serializeBackup(backup: GuildBackup): string {
    return JSON.stringify(backup, null, 2);
}

export function parseBackup(text: string): GuildBackup {
    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("The selected file is not valid JSON.");
    }

    if (!data || typeof data !== "object" || data.format !== BACKUP_FORMAT) {
        throw new Error("This file is not a ServerBackup backup.");
    }

    if (data.version !== BACKUP_VERSION) {
        throw new Error(`Unsupported backup version: ${data.version ?? "unknown"}.`);
    }

    if (!data.guild || !Array.isArray(data.roles) || !Array.isArray(data.channels)) {
        throw new Error("The backup is missing its server, roles or channels data.");
    }

    return data as GuildBackup;
}

function sanitizeFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "server";
}

export async function saveBackupFile(backup: GuildBackup): Promise<void> {
    const date = backup.createdAt.slice(0, 10);
    const fileName = `${sanitizeFileName(backup.guild.name)}-backup-${date}.json`;
    const json = serializeBackup(backup);

    if (IS_DISCORD_DESKTOP) {
        await DiscordNative.fileManager.saveWithDialog(new TextEncoder().encode(json), fileName);
    } else {
        saveFile(new File([json], fileName, { type: "application/json" }));
    }
}

export async function readBackupFile(): Promise<string | null> {
    if (IS_DISCORD_DESKTOP) {
        const [file] = await DiscordNative.fileManager.openFiles({
            filters: [
                { name: "Server Backup", extensions: ["json"] },
                { name: "All files", extensions: ["*"] }
            ]
        });

        return file ? new TextDecoder().decode(file.data) : null;
    }

    const file = await chooseFile("application/json,.json");
    return file ? file.text() : null;
}
