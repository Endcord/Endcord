/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Message } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, GuildStore, UserStore } from "@webpack/common";

const settings = definePluginSettings({
  translateUserIds: {
    type: OptionType.BOOLEAN,
    description: "Convert user IDs to clickable @ mentions",
    default: true,
  },
  translateChannelIds: {
    type: OptionType.BOOLEAN,
    description: "Convert channel IDs to clickable # references",
    default: true,
  },
  translateRoleIds: {
    type: OptionType.BOOLEAN,
    description: "Convert role IDs to clickable @& mentions",
    default: true,
  },
  translateMessageIds: {
    type: OptionType.BOOLEAN,
    description: "Convert message IDs to clickable links",
    default: false,
  },
  translateOwnMessages: {
    type: OptionType.BOOLEAN,
    description: "Translate IDs in your own sent messages",
    default: false,
  },
  minIdLength: {
    type: OptionType.NUMBER,
    description: "Minimum ID length to convert (Discord: 17-19 digits)",
    default: 17,
  },
  maxIdLength: {
    type: OptionType.NUMBER,
    description: "Maximum ID length to convert",
    default: 19,
  },
});

// Snowflakes are 17-19 digits
function createIdRegex(minLength: number, maxLength: number): RegExp {
  return new RegExp(`\\b\\d{${minLength},${maxLength}}\\b`, "g");
}

function isUserId(id: string): boolean {
  try {
    const user = UserStore.getUser(id);
    return user !== undefined && user !== null;
  } catch {
    return false;
  }
}

function isChannelId(id: string): boolean {
  try {
    const channel = ChannelStore.getChannel(id);
    return channel !== undefined && channel !== null;
  } catch {
    return false;
  }
}

// Roles are looked up in the current channel's server
function isRoleId(id: string, channelId?: string): boolean {
  if (!channelId) return false;
  try {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel?.guild_id) return false;

    const guild = GuildStore.getGuild(channel.guild_id);
    if (!guild) return false;

    return (guild as any).roles?.[id] !== undefined;
  } catch {
    return false;
  }
}

// Already inside a mention or a URL?
function isIdInContext(content: string, id: string, index: number): boolean {
  const beforeStart = Math.max(0, index - 5);
  const before = content.substring(beforeStart, index);

  const afterEnd = Math.min(content.length, index + id.length + 5);
  const after = content.substring(index + id.length, afterEnd);

  // Part of a mention
  if (
    before.includes("<@") ||
    before.includes("<#") ||
    before.includes("<@&")
  ) {
    return true;
  }

  // Part of a URL
  if (before.match(/[:/.]/) || after.match(/[:/.]/)) {
    return true;
  }

  // Right next to @ or #
  if (
    before.endsWith("@") ||
    before.endsWith("#") ||
    after.startsWith("@") ||
    after.startsWith("#")
  ) {
    return true;
  }

  return false;
}

function translateIds(content: string, channelId?: string): string {
  if (!content) return content;

  const {
    translateUserIds,
    translateChannelIds,
    translateRoleIds,
    translateMessageIds,
    minIdLength,
    maxIdLength,
  } = settings.store;

  if (
    !translateUserIds &&
    !translateChannelIds &&
    !translateRoleIds &&
    !translateMessageIds
  ) {
    return content;
  }

  const idRegex = createIdRegex(minIdLength, maxIdLength);
  let translatedContent = content;
  const processedIds = new Map<string, string>(); // ID -> replacement

  let match;
  const idMatches: Array<{ id: string; index: number }> = [];

  while ((match = idRegex.exec(content)) !== null) {
    const id = match[0];
    const { index } = match;

    if (isIdInContext(content, id, index)) {
      continue;
    }

    // Avoid duplicates
    if (processedIds.has(id)) {
      continue;
    }

    let replacement: string | null = null;

    if (translateUserIds && isUserId(id)) {
      replacement = `<@${id}>`;
    } else if (translateChannelIds && isChannelId(id)) {
      replacement = `<#${id}>`;
    } else if (translateRoleIds && channelId && isRoleId(id, channelId)) {
      replacement = `<@&${id}>`;
    } else if (translateMessageIds && channelId) {
      // For messages, create a Discord link
      const channel = ChannelStore.getChannel(channelId);
      if (channel?.guild_id) {
        replacement = `https://discord.com/channels/${channel.guild_id}/${channelId}/${id}`;
      } else {
        // DM
        replacement = `https://discord.com/channels/@me/${channelId}/${id}`;
      }
    }

    if (replacement) {
      processedIds.set(id, replacement);
      idMatches.push({ id, index });
    }
  }

  // Back to front, so the indices stay valid
  idMatches.reverse().forEach(({ id, index }) => {
    const replacement = processedIds.get(id);
    if (replacement) {
      translatedContent =
        translatedContent.substring(0, index) +
        replacement +
        translatedContent.substring(index + id.length);
    }
  });

  return translatedContent;
}

function modifyIncomingMessage(message: Message): string {
  if (!message.content) return message.content || "";

  const currentUser = UserStore.getCurrentUser();
  const messageAuthor = message.author;
  const isOwnMessage =
    currentUser?.id && messageAuthor?.id && messageAuthor.id === currentUser.id;

  // Own messages only with that option on
  if (isOwnMessage && !settings.store.translateOwnMessages) {
    return message.content;
  }

  // Skip messages that already have mentions, so nothing is doubled (a lone message link is fine)
  if (message.content.includes("<@") || message.content.includes("<#")) {
    return message.content;
  }

  return translateIds(message.content, message.channel_id);
}

export default definePlugin({
  name: "ID Translater",
  description:
    "Automatically translates Discord IDs to clickable @ mentions or # references",
    tags: ["Chat", "Utility"],
  authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
  isModified: true,

  settings,
  modifyIncomingMessage,

  patches: [
    {
      find: "!1,hideSimpleEmbedContent",
      replacement: {
        match: /(let{toAST:.{0,125}?\i=)(?:\(null!=\i\?\i:\i\)|\(\i\?\?\i\)|\i)(?:\.content)?/,
        replace:
          "const idTranslaterContent=$self.modifyIncomingMessage(arguments[2]?.contentMessage??arguments[1]);$1idTranslaterContent",
      },
    },
  ],

  start() {
    console.debug(
      "[ID Translater] Plugin started - Automatic ID conversion enabled"
    );
  },

  stop() {
    console.debug("[ID Translater] Plugin stopped");
  },
});
