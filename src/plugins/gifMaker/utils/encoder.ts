/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CAPTIONS } from "@plugins/gifMaker/captions";
import { measureTextLines } from "@plugins/gifMaker/captions/caption";
import type { GifMakerOptions } from "@plugins/gifMaker/types";
import { sleep } from "@utils/misc";
import type { PluginNative } from "@utils/types";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { decompressFrames, parseGIF } from "gifuct-js";

const MAX_FRAMES = 200;
const INTERNAL_FPS = 30;
const PALETTE_COLORS = 255;

const ALLOWED_MEDIA_HOSTS = new Set([
    "cdn.discordapp.com",
    "images-ext-1.discordapp.net",
    "images-ext-2.discordapp.net",
    "media.discordapp.net",
    "media.tenor.com",
    "tenor.com",
    "media.giphy.com",
    "media0.giphy.com",
    "media1.giphy.com",
    "media2.giphy.com",
    "media3.giphy.com",
    "media4.giphy.com",
]);

const MediaNative = EndcordNative?.pluginHelpers?.gifMaker as PluginNative<typeof import("../native")> | undefined;

const blobUrlMap = new WeakMap<HTMLElement, string>();

function isDiscordCdnUrl(url: string): boolean {
    try {
        return ALLOWED_MEDIA_HOSTS.has(new URL(url).hostname);
    } catch {
        return false;
    }
}

async function fetchFullGifBytes(url: string): Promise<Uint8Array> {
    const resolved = resolveMediaUrl(url);
    if (MediaNative) {
        const { data } = await MediaNative.fetchMedia(resolved);
        return new Uint8Array(data);
    }
    const res = await fetch(resolved);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
}

async function getMediaBlobUrl(url: string): Promise<string> {
    if (MediaNative) {
        const { data, type } = await MediaNative.fetchMedia(url);
        if (data) return URL.createObjectURL(new Blob([data], { type }));
    }
    const res = await fetch(url);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
}

const mediaProxyParser = /^https:\/\/(?:images-ext-\d+|cdn)\.discord(?:app|cdn)\.net\/external\/[^/]+\/(?<protocol>https?)\/(?<rest>.+)$/i;

function resolveMediaUrl(url: string): string {
    const normalized = url.startsWith("//") ? `https:${url}` : url;
    const match = normalized.match(mediaProxyParser);
    if (match?.groups) {
        const { protocol, rest } = match.groups;
        return `${decodeURIComponent(protocol)}://${decodeURIComponent(rest)}`;
    }
    return normalized;
}

export function cleanupBlobUrl(el: HTMLElement) {
    const blobUrl = blobUrlMap.get(el);
    if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrlMap.delete(el);
    }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        img.crossOrigin = "anonymous";

        const resolved = resolveMediaUrl(url);
        if (isDiscordCdnUrl(resolved)) {
            getMediaBlobUrl(resolved).then(blobUrl => {
                blobUrlMap.set(img, blobUrl);
                img.src = blobUrl;
            }).catch(reject);
        } else {
            img.src = resolved;
        }
    });
}

function createVideoElement(src: string): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
        const v = document.createElement("video");
        v.preload = "auto";
        v.muted = true;
        v.crossOrigin = "anonymous";

        v.addEventListener("loadedmetadata", () => {
            const { duration, videoWidth, videoHeight } = v;
            if (!isFinite(duration) || duration <= 0 || !videoWidth || !videoHeight) {
                reject(new Error(`Invalid video: duration=${duration} w=${videoWidth} h=${videoHeight}`));
                return;
            }
            resolve(v);
        }, { once: true });

        v.addEventListener("error", () => {
            reject(new Error(`Video load failed: ${src} (code=${v.error?.code})`));
        }, { once: true });

        v.src = src;
        v.load();
    });
}

export function loadVideo(url: string): Promise<HTMLVideoElement> {
    const resolved = resolveMediaUrl(url);
    if (isDiscordCdnUrl(resolved)) {
        return getMediaBlobUrl(resolved).then(blobUrl =>
            createVideoElement(blobUrl).then(video => {
                blobUrlMap.set(video, blobUrl);
                return video;
            })
        );
    }
    return createVideoElement(resolved);
}

function waitForSeek(video: HTMLVideoElement): Promise<void> {
    return new Promise(resolve => {
        if (video.seeking) {
            video.addEventListener("seeked", () => resolve(), { once: true });
        } else {
            resolve();
        }
    });
}

export function getCaptionHeight(ctx: CanvasRenderingContext2D, width: number, options: GifMakerOptions): number {
    if (options.captionMode === "caption" && options.captionText) {
        const { lines, lineHeight } = measureTextLines(ctx, options.captionText, options.captionSize, options.fontFamily, width - 20);
        return Math.ceil(lines.length * lineHeight + 20);
    }
    return 0;
}

async function encodeFrames(
    width: number,
    height: number,
    options: GifMakerOptions,
    frameCount: number,
    drawFrame: (ctx: CanvasRenderingContext2D, i: number) => void | Promise<void>,
    delays?: number[],
): Promise<Blob> {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return new Blob();
    const captionHeight = getCaptionHeight(ctx, width, options);
    const gifHeight = height + captionHeight;
    canvas.width = width;
    canvas.height = gifHeight;

    const defaultDelay = Math.round(1000 / INTERNAL_FPS);

    const frameData: Uint8ClampedArray[] = [];
    for (let i = 0; i < frameCount; i++) {
        ctx.clearRect(0, 0, width, gifHeight);

        ctx.save();
        ctx.translate(0, captionHeight);
        await drawFrame(ctx, i);
        ctx.restore();

        const caption = CAPTIONS.find(c => c.type === options.captionMode);
        if (caption) {
            ctx.save();
            caption.render(ctx, width, captionHeight > 0 ? captionHeight : height, options);
            ctx.restore();
        }

        frameData.push(ctx.getImageData(0, 0, width, gifHeight).data);
    }

    const totalLength = frameData.reduce((sum, data) => sum + data.length, 0);
    const combined = new Uint8ClampedArray(totalLength);
    let offset = 0;
    for (const data of frameData) {
        combined.set(data, offset);
        offset += data.length;
    }

    const palette = quantize(combined, PALETTE_COLORS);
    const gif = GIFEncoder();

    for (let i = 0; i < frameCount; i++) {
        const index = applyPalette(frameData[i], palette);
        gif.writeFrame(index, width, gifHeight, {
            delay: delays ? delays[i] : defaultDelay,
            palette: i === 0 ? palette : undefined,
        });
    }

    gif.finish();
    const bytes = gif.bytesView();
    return new Blob([new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength)], { type: "image/gif" });
}

async function createGifFromImage(url: string, options: GifMakerOptions): Promise<Blob> {
    const img = await loadImage(url);
    try {
        return await encodeFrames(options.width, options.height, options, 1, ctx => {
            ctx.drawImage(img, 0, 0, options.width, options.height);
        });
    } finally {
        cleanupBlobUrl(img);
    }
}

async function createGifFromVideo(url: string, options: GifMakerOptions): Promise<Blob> {
    const video = await loadVideo(url);
    try {
        const { duration } = video;
        const frameCount = Math.min(
            Math.floor(duration * INTERNAL_FPS),
            MAX_FRAMES
        );

        const interval = duration / frameCount;
        const delay = Math.round(interval * 1000);
        const delays = new Array(frameCount).fill(delay);

        return await encodeFrames(options.width, options.height, options, frameCount, async (ctx, i) => {
            video.currentTime = i * interval;
            await waitForSeek(video);
            ctx.drawImage(video, 0, 0, options.width, options.height);
        }, delays);
    } finally {
        cleanupBlobUrl(video);
    }
}

function hasExt(url: string, ext: string): boolean {
    try {
        const normalized = url.startsWith("//") ? `https:${url}` : url;
        const match = normalized.match(mediaProxyParser);
        const resolved = match?.groups
            ? `${decodeURIComponent(match.groups.protocol)}://${decodeURIComponent(match.groups.rest)}`
            : normalized;
        return new URL(resolved).pathname.toLowerCase().endsWith(ext);
    } catch {
        return url.toLowerCase().endsWith(ext);
    }
}

export async function createGif(url: string, isVideo: boolean, options: GifMakerOptions): Promise<Blob> {
    if (isVideo) return createGifFromVideo(url, options);
    if (hasExt(url, ".gif")) {
        try {
            return await createGifFromAnimatedImage(url, options);
        } catch (err) {
            if (!(err instanceof Error) || err.message !== "No animated frames found") {
                throw err;
            }
        }
    }
    return createGifFromImage(url, options);
}

async function createGifFromAnimatedImage(url: string, options: GifMakerOptions): Promise<Blob> {
    const bytes = await fetchFullGifBytes(url);
    const parsedGif = parseGIF(bytes.buffer as ArrayBuffer);
    const frames = decompressFrames(parsedGif, true);

    if (frames.length <= 1) throw new Error("No animated frames found");

    const gifW = parsedGif.lsd.width;
    const gifH = parsedGif.lsd.height;

    const composite = document.createElement("canvas");
    composite.width = gifW;
    composite.height = gifH;
    const ctx = composite.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Failed to get canvas context for GIF compositing.");

    const patchCanvas = document.createElement("canvas");

    const totalFrames = frames.length;
    const rendered: HTMLCanvasElement[] = [];
    const delays: number[] = [];

    for (let i = 0; i < totalFrames; i++) {
        const frame = frames[i];
        delays.push(frame.delay);

        if (i > 0) {
            const prev = frames[i - 1];
            if (prev.disposalType === 2) {
                ctx.clearRect(prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height);
            } else if (prev.disposalType === 3 && i > 1) {
                const prevCtx = rendered[i - 2].getContext("2d");
                if (prevCtx) {
                    const prevState = prevCtx.getImageData(0, 0, gifW, gifH);
                    ctx.putImageData(prevState, 0, 0);
                }
            }
        }

        const patchData = new ImageData(
            new Uint8ClampedArray(frame.patch),
            frame.dims.width,
            frame.dims.height
        );
        patchCanvas.width = frame.dims.width;
        patchCanvas.height = frame.dims.height;
        const patchCtx = patchCanvas.getContext("2d");
        if (!patchCtx) throw new Error("Failed to get canvas context for patch rendering.");
        patchCtx.putImageData(patchData, 0, 0);
        ctx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

        const snap = document.createElement("canvas");
        snap.width = gifW;
        snap.height = gifH;
        const snapCtx = snap.getContext("2d");
        if (!snapCtx) throw new Error("Failed to get canvas context for frame snapshot.");
        snapCtx.drawImage(composite, 0, 0);
        rendered.push(snap);

        if (i % 20 === 19) {
            await sleep(0);
        }
    }

    return await encodeFrames(
        options.width, options.height, options, totalFrames,
        (encodeCtx, i) => {
            encodeCtx.drawImage(rendered[i], 0, 0, options.width, options.height);
        },
        delays
    );
}
