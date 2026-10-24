/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sleep } from "@utils/misc";
import { Constants, GuildMemberStore, GuildStore } from "@webpack/common";

import { getErrorMessage, request } from "./api";
import {
    BackupChannel,
    ChannelTypeFallback,
    ChannelTypes,
    COPYABLE_CHANNEL_TYPES,
    GuildBackup,
    RestoreOptions,
    RestoreReport
} from "./types";

interface ExistingRole {
    id: string;
    name: string;
    position: number;
    managed: boolean;
}

interface ExistingChannel {
    id: string;
    name?: string;
}

interface CreatedRole {
    id: string;
}

interface CreatedChannel {
    id: string;
}

const MAX_BITRATE_BY_TIER = [96000, 128000, 256000, 384000] as const;

function clampBitrate(bitrate: number | undefined, premiumTier: number): number | undefined {
    if (!bitrate) return undefined;

    const max = MAX_BITRATE_BY_TIER[Math.min(premiumTier, MAX_BITRATE_BY_TIER.length - 1)];
    return Math.min(bitrate, max);
}

function isTextLike(type: number) {
    return type === ChannelTypes.GUILD_TEXT
        || type === ChannelTypes.GUILD_ANNOUNCEMENT
        || type === ChannelTypes.GUILD_FORUM
        || type === ChannelTypes.GUILD_MEDIA;
}

function isVoiceLike(type: number) {
    return type === ChannelTypes.GUILD_VOICE || type === ChannelTypes.GUILD_STAGE_VOICE;
}

function isForumLike(type: number) {
    return type === ChannelTypes.GUILD_FORUM || type === ChannelTypes.GUILD_MEDIA;
}

export async function restoreBackup(targetGuildId: string, backup: GuildBackup, options: RestoreOptions = {}): Promise<RestoreReport> {
    const targetGuild = GuildStore.getGuild(targetGuildId);
    if (!targetGuild) throw new Error("The target server is not loaded.");

    const delay = Math.max(0, options.requestDelay ?? 250);
    const wait = () => delay > 0 ? sleep(delay) : Promise.resolve();

    const report: RestoreReport = { rolesCreated: 0, channelsCreated: 0, errors: [] };
    const roleMap = new Map<string, string>([[backup.guild.id, targetGuildId]]);
    const channelMap = new Map<string, string>();

    const sourceEveryone = backup.roles.find(role => role.id === backup.guild.id);
    const rolesToCreate = backup.roles
        .filter(role => role.id !== backup.guild.id)
        .sort((a, b) => a.position - b.position);

    const copyableChannels = backup.channels
        .filter(channel => COPYABLE_CHANNEL_TYPES.includes(channel.type))
        .sort((a, b) => a.position - b.position);

    const categories = copyableChannels.filter(channel => channel.type === ChannelTypes.GUILD_CATEGORY);
    const regularChannels = copyableChannels.filter(channel => channel.type !== ChannelTypes.GUILD_CATEGORY);

    let existingRoles: ExistingRole[] = [];
    let existingChannels: ExistingChannel[] = [];
    let rolesToDelete: ExistingRole[] = [];

    if (options.deleteExisting) {
        [existingRoles, existingChannels] = await Promise.all([
            request<ExistingRole[]>("get", { url: Constants.Endpoints.GUILD_ROLES(targetGuildId) }),
            request<ExistingChannel[]>("get", { url: Constants.Endpoints.GUILD_CHANNELS(targetGuildId) })
        ]);

        // Never remove roles we need to keep managing the server.
        const self = GuildMemberStore.getCachedSelfMember(targetGuildId);
        const myRoleIds = new Set(self?.roles ?? []);
        const myHighestPosition = Math.max(
            0,
            ...existingRoles.filter(role => myRoleIds.has(role.id)).map(role => role.position)
        );

        rolesToDelete = existingRoles
            .filter(role =>
                role.id !== targetGuildId
                && !role.managed
                && !myRoleIds.has(role.id)
                && role.position < myHighestPosition
            )
            .sort((a, b) => b.position - a.position);
    }

    const total = rolesToCreate.length
        + (sourceEveryone ? 1 : 0)
        + copyableChannels.length
        + existingChannels.length
        + rolesToDelete.length
        // Role and channel reordering
        + 2
        + (options.restoreGuildSettings ? 1 : 0);

    let current = 0;
    const step = (stage: string, detail?: string) => {
        current++;
        options.onProgress?.({ stage, detail, current, total });
    };

    if (options.deleteExisting) {
        for (const channel of existingChannels) {
            try {
                await request("del", { url: Constants.Endpoints.CHANNEL(channel.id) });
            } catch (error) {
                report.errors.push(`Could not delete channel #${channel.name ?? channel.id}: ${getErrorMessage(error)}`);
            }

            step("Deleting existing channels", channel.name ? `#${channel.name}` : undefined);
            await wait();
        }

        for (const role of rolesToDelete) {
            try {
                await request("del", { url: Constants.Endpoints.GUILD_ROLE(targetGuildId, role.id) });
            } catch (error) {
                report.errors.push(`Could not delete role ${role.name}: ${getErrorMessage(error)}`);
            }

            step("Deleting existing roles", role.name);
            await wait();
        }
    }

    if (sourceEveryone) {
        try {
            await request("patch", {
                url: Constants.Endpoints.GUILD_ROLE(targetGuildId, targetGuildId),
                body: { permissions: sourceEveryone.permissions }
            });
        } catch (error) {
            report.errors.push(`Could not update @everyone permissions: ${getErrorMessage(error)}`);
        }

        step("Updating @everyone permissions");
        await wait();
    }

    for (const role of rolesToCreate) {
        const body: Record<string, any> = {
            name: role.name || "role",
            permissions: role.permissions,
            color: role.color ?? 0,
            hoist: !!role.hoist,
            mentionable: !!role.mentionable
        };

        if (role.unicodeEmoji) body.unicode_emoji = role.unicodeEmoji;

        try {
            const created = await request<CreatedRole>("post", {
                url: Constants.Endpoints.GUILD_ROLES(targetGuildId),
                body
            });

            roleMap.set(role.id, created.id);
            report.rolesCreated++;
        } catch (error) {
            // Role icons need the ROLE_ICONS feature, so retry without the emoji if it failed.
            if (body.unicode_emoji) {
                delete body.unicode_emoji;

                try {
                    const created = await request<CreatedRole>("post", {
                        url: Constants.Endpoints.GUILD_ROLES(targetGuildId),
                        body
                    });

                    roleMap.set(role.id, created.id);
                    report.rolesCreated++;
                } catch (retryError) {
                    report.errors.push(`Could not create role ${role.name}: ${getErrorMessage(retryError)}`);
                }
            } else {
                report.errors.push(`Could not create role ${role.name}: ${getErrorMessage(error)}`);
            }
        }

        step("Creating roles", role.name);
        await wait();
    }

    if (report.rolesCreated > 0) {
        const positions = rolesToCreate
            .map(role => ({ id: roleMap.get(role.id), position: role.position }))
            .filter((entry): entry is { id: string; position: number; } => entry.id != null);

        try {
            await request("patch", { url: Constants.Endpoints.GUILD_ROLES(targetGuildId), body: positions });
        } catch (error) {
            report.errors.push(`Could not reorder roles: ${getErrorMessage(error)}`);
        }
    }

    step("Reordering roles");

    const buildOverwrites = (channel: BackupChannel) => {
        const overwrites: Record<string, any>[] = [];

        for (const overwrite of channel.permissionOverwrites ?? []) {
            if (overwrite.type === 1) {
                if (!options.includeMemberOverwrites) continue;
                if (!GuildMemberStore.isMember(targetGuildId, overwrite.id)) continue;

                overwrites.push({
                    id: overwrite.id,
                    type: 1,
                    allow: overwrite.allow,
                    deny: overwrite.deny
                });
            } else {
                const newRoleId = roleMap.get(overwrite.id);
                if (!newRoleId) continue;

                overwrites.push({
                    id: newRoleId,
                    type: 0,
                    allow: overwrite.allow,
                    deny: overwrite.deny
                });
            }
        }

        return overwrites;
    };

    const buildChannelBody = (channel: BackupChannel, type: number) => {
        const body: Record<string, any> = {
            name: channel.name,
            type,
            position: channel.position,
            permission_overwrites: buildOverwrites(channel)
        };

        if (channel.parentId) {
            const parentId = channelMap.get(channel.parentId);
            if (parentId) body.parent_id = parentId;
        }

        if (isTextLike(type)) {
            if (channel.topic) body.topic = channel.topic;
            if (channel.nsfw) body.nsfw = true;
            if (channel.rateLimitPerUser) body.rate_limit_per_user = channel.rateLimitPerUser;
            if (channel.defaultAutoArchiveDuration) body.default_auto_archive_duration = channel.defaultAutoArchiveDuration;
        }

        if (isVoiceLike(type)) {
            const bitrate = clampBitrate(channel.bitrate, targetGuild.premiumTier);
            if (bitrate) body.bitrate = bitrate;
            if (channel.userLimit) body.user_limit = Math.min(channel.userLimit, 99);
            if (channel.videoQualityMode) body.video_quality_mode = channel.videoQualityMode;
            if (channel.rtcRegion) body.rtc_region = channel.rtcRegion;
        }

        if (isForumLike(type)) {
            if (channel.availableTags?.length) {
                body.available_tags = channel.availableTags.map(tag => ({
                    name: tag.name,
                    emoji_id: tag.emojiId ?? null,
                    emoji_name: tag.emojiName ?? null,
                    moderated: !!tag.moderated
                }));
            }

            if (channel.defaultReactionEmoji) {
                body.default_reaction_emoji = {
                    emoji_id: channel.defaultReactionEmoji.emojiId ?? null,
                    emoji_name: channel.defaultReactionEmoji.emojiName ?? null
                };
            }

            if (channel.defaultSortOrder != null) body.default_sort_order = channel.defaultSortOrder;
            if (channel.defaultForumLayout != null) body.default_forum_layout = channel.defaultForumLayout;
            if (channel.defaultTagSetting) body.default_tag_setting = channel.defaultTagSetting;
        }

        return body;
    };

    // Categories must exist before the channels that use them as a parent.
    for (const channel of [...categories, ...regularChannels]) {
        let created: CreatedChannel | undefined;
        let lastError: unknown;

        const fallback = ChannelTypeFallback[channel.type];
        const typesToTry = fallback != null ? [channel.type, fallback] : [channel.type];

        for (const type of typesToTry) {
            try {
                created = await request<CreatedChannel>("post", {
                    url: Constants.Endpoints.GUILD_CHANNELS(targetGuildId),
                    body: buildChannelBody(channel, type)
                });
                break;
            } catch (error) {
                lastError = error;
                if (typesToTry.length > 1) await wait();
            }
        }

        if (created) {
            channelMap.set(channel.id, created.id);
            report.channelsCreated++;
        } else {
            report.errors.push(`Could not create channel #${channel.name}: ${getErrorMessage(lastError)}`);
        }

        step("Creating channels", `#${channel.name}`);
        await wait();
    }

    const sourceChannelById = new Map(copyableChannels.map(channel => [channel.id, channel]));
    const positions = [...channelMap.entries()]
        .map(([sourceId, newId]) => ({
            id: newId,
            position: sourceChannelById.get(sourceId)?.position ?? 0
        }))
        .sort((a, b) => a.position - b.position);

    if (positions.length) {
        try {
            await request("patch", {
                url: Constants.Endpoints.GUILD_CHANNELS(targetGuildId),
                body: positions
            });
        } catch (error) {
            report.errors.push(`Could not reorder channels: ${getErrorMessage(error)}`);
        }
    }

    step("Reordering channels");

    if (options.restoreGuildSettings) {
        const source = backup.guild;
        const body: Record<string, any> = {
            verification_level: source.verificationLevel,
            explicit_content_filter: source.explicitContentFilter,
            default_message_notifications: source.defaultMessageNotifications,
            afk_timeout: source.afkTimeout,
            system_channel_flags: source.systemChannelFlags,
            preferred_locale: source.preferredLocale
        };

        if (source.afkChannelId) {
            const afkChannelId = channelMap.get(source.afkChannelId);
            if (afkChannelId) body.afk_channel_id = afkChannelId;
        }

        if (source.systemChannelId) {
            const systemChannelId = channelMap.get(source.systemChannelId);
            if (systemChannelId) body.system_channel_id = systemChannelId;
        }

        if (options.restoreName) body.name = source.name;

        try {
            await request("patch", { url: Constants.Endpoints.GUILD(targetGuildId), body });
        } catch (error) {
            report.errors.push(`Could not update server settings: ${getErrorMessage(error)}`);
        }

        step("Updating server settings");
    }

    return report;
}
