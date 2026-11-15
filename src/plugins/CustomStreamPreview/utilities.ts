/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { ApplicationStreamingStore, ChannelStore, RestAPI, SelectedChannelStore, UserStore } from "@webpack/common";

import { ParsedStreamKey } from "./types";

const logger = new Logger("CustomStreamPreview");

/** DataStore key holding the chosen preview image (base64 JPEG data URI). */
export const PREVIEW_IMAGE_KEY = "CustomStreamPreview_image";

/** Resend the preview every 5 minutes while the stream is live. */
const RESEND_INTERVAL_MS = 300_000;
/** Discord takes one preview per 60s, plus 10s of margin */
const RATE_LIMIT_MS = 70_000;

// Discord voice-channel type -> stream key prefix.
const ChannelTypeToStreamPrefix: Record<number, "call" | "guild"> = {
    1: "call", // DM
    2: "guild", // Guild voice
    3: "call", // Group DM
    13: "guild" // Stage voice
};

// Plain module state. A Flux store would be overkill for one resend loop
let resendIntervalId: ReturnType<typeof setInterval> | null = null;
let pendingTimeoutId: ReturnType<typeof setTimeout> | null = null;
let lastSentAt = 0;

// ---- Streaming state ----
/** Whether we're streaming right now */
export const getStreamingState = (): boolean =>
    Boolean(ApplicationStreamingStore.getCurrentUserActiveStream());

// ---- Saved preview image ----
export const getSavedPreview = async (): Promise<string | null> =>
    (await DataStore.get<string>(PREVIEW_IMAGE_KEY)) ?? null;

export const savePreview = (image: string): Promise<void> =>
    DataStore.set(PREVIEW_IMAGE_KEY, image);

// ---- Stream key ----
export const parseStreamKey = (streamKey: string): ParsedStreamKey | null => {
    const [type, ...rest] = streamKey.split(":");

    if (type === "call") {
        const [channelId, userId] = rest;
        return { voiceChannelType: "call", channelId, userId };
    }

    if (type === "guild") {
        const [guildId, channelId, userId] = rest;
        return { voiceChannelType: "guild", guildId, channelId, userId };
    }

    return null;
};

/** Build the raw stream key for the current user's active voice channel, or null. */
const buildCurrentStreamKey = (): string | null => {
    const channelId = SelectedChannelStore.getVoiceChannelId();
    if (!channelId) return null;

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return null;

    const prefix = ChannelTypeToStreamPrefix[channel.type];
    if (!prefix) return null;

    const userId = UserStore.getCurrentUser().id;
    const guildId = channel.getGuildId?.() ?? null;

    if (prefix === "guild" && guildId) return `guild:${guildId}:${channelId}:${userId}`;
    return `call:${channelId}:${userId}`;
};

// ---- Upload ----
const uploadPreviewOnce = async (image: string): Promise<void> => {
    const streamKey = buildCurrentStreamKey();
    if (!streamKey) {
        logger.warn("No active voice stream; skipping preview upload.");
        return;
    }

    try {
        // RestAPI adds the auth headers itself. The colons in the key are URL-encoded
        await RestAPI.post({
            url: `/streams/${encodeURIComponent(streamKey)}/preview`,
            body: { thumbnail: image }
        });
        lastSentAt = Date.now();
        logger.info("Custom stream preview sent.");
    } catch (err) {
        logger.error("Failed to send custom stream preview.", err);
    }
};

/** Sends the preview for the current stream now (or once the rate limit allows), then every 5 minutes until stopped */
export const startSendingPreview = (image: string): void => {
    stopSendingPreview();

    const wait = Math.max(lastSentAt + RATE_LIMIT_MS - Date.now(), 0);
    pendingTimeoutId = setTimeout(() => {
        pendingTimeoutId = null;
        void uploadPreviewOnce(image);
        resendIntervalId = setInterval(() => void uploadPreviewOnce(image), RESEND_INTERVAL_MS);
    }, wait);
};

/** Stops resending and cancels an upload that's waiting on the rate limit */
export const stopSendingPreview = (): void => {
    if (pendingTimeoutId !== null) {
        clearTimeout(pendingTimeoutId);
        pendingTimeoutId = null;
    }
    if (resendIntervalId !== null) {
        clearInterval(resendIntervalId);
        resendIntervalId = null;
    }
};

/** Whether a preview is being sent, or waiting to be */
export const isSendingPreview = (): boolean =>
    resendIntervalId !== null || pendingTimeoutId !== null;

// ---- Image conversion ----
/**
 * Converts an image to what Discord uses for stream previews: cropped to 454x256, JPEG at 10% quality, as a data
 * URI
 */
export const imageFileToStreamPreview = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = e => {
            if (e.target !== null) {
                img.src = e.target.result as string;
            } else {
                reject("FileReader failed to load file.");
            }
        };

        img.onload = () => {
            const targetWidth = 454;
            const targetHeight = Math.round((9 / 16) * targetWidth);

            const originalAspect = img.width / img.height;
            const targetAspect = 16 / 9;

            let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;

            if (originalAspect > targetAspect) {
                sWidth = img.height * targetAspect;
                sx = (img.width - sWidth) / 2;
            } else {
                sHeight = img.width / targetAspect;
                sy = (img.height - sHeight) / 2;
            }

            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext("2d");

            if (!ctx) {
                reject("Failed to get canvas context.");
                return;
            }

            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
            resolve(canvas.toDataURL("image/jpeg", 0.1));
        };

        img.onerror = () => reject("Image failed to load.");
        reader.onerror = () => reject("FileReader failed.");

        reader.readAsDataURL(file);
    });
};
