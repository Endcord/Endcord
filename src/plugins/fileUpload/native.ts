/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchPublicUrl, readBody } from "@main/utils/http";
import { isUrlOn } from "@shared/hosts";
import { IpcMainInvokeEvent } from "electron";

import { NativeUploadResult, NestUploadResponse } from "./types";

const MAX_REUPLOAD_BYTES = 512 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

/**
 * An upload to a service the page can't talk to itself, such as a ShareX or Zipline server without CORS headers.
 * The address comes from the settings, so it gets the same address checks as every other native fetch
 */
export async function sendRequest(_: IpcMainInvokeEvent, url: string, method: string, headers: Record<string, string>, body: Uint8Array | null) {
    const response = await fetchPublicUrl(url, { method, headers: { ...headers }, body: body ?? undefined });
    const data = await readBody(response, MAX_RESPONSE_BYTES);
    if (!data) throw new Error("Response is too large");

    return { status: response.status, statusText: response.statusText, headers: [...response.headers], body: data };
}

export async function uploadToNest(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string,
    authToken: string
): Promise<NativeUploadResult> {
    try {
        const formData = new FormData();
        formData.append("file", new Blob([fileBuffer]), filename);

        const response = await fetch("https://nest.rip/api/files/upload", {
            method: "POST",
            headers: {
                "Authorization": authToken
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
        }

        const data = await response.json() as NestUploadResponse;

        if (data.fileURL) {
            return { success: true, url: data.fileURL };
        }

        return { success: false, error: "No URL returned from upload" };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export async function uploadToEzHost(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string,
    key: string
): Promise<NativeUploadResult> {
    try {
        const formData = new FormData();
        formData.append("file", new Blob([fileBuffer]), filename);

        const response = await fetch("https://api.e-z.host/files", {
            method: "POST",
            headers: {
                key
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
        }

        const data = await response.json() as { success: boolean; error?: string; imageUrl?: string; rawUrl?: string; };

        if (!data || !data.success) {
            return { success: false, error: data?.error || "Upload failed" };
        }

        if (data.imageUrl || data.rawUrl) {
            return { success: true, url: data.imageUrl || data.rawUrl };
        }

        return { success: false, error: "No URL returned from upload" };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export async function uploadTo0x0(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string
): Promise<NativeUploadResult> {
    try {
        const formData = new FormData();
        formData.append("file", new Blob([fileBuffer]), filename);

        const response = await fetch("https://0x0.st", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
        }

        const text = (await response.text()).trim();
        if (!text) {
            return { success: false, error: "No URL returned from upload" };
        }

        return { success: true, url: text };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

// The address and headers come from the renderer, so the upload gets the same address checks as every other native
// fetch: a PUT into this PC or the local network must fail like a GET does
async function putPublic(fileBuffer: ArrayBuffer, uploadUrl: string, headers: Record<string, string>): Promise<NativeUploadResult> {
    if (!isValidHttpsUrl(uploadUrl)) {
        return { success: false, error: "Invalid or non-HTTPS upload URL" };
    }

    try {
        const response = await fetchPublicUrl(uploadUrl, { method: "PUT", headers: { ...headers }, body: new Uint8Array(fileBuffer) });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
        }

        return { success: true, url: uploadUrl };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export function uploadToS3(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    uploadUrl: string,
    headers: Record<string, string>
): Promise<NativeUploadResult> {
    return putPublic(fileBuffer, uploadUrl, headers);
}

export async function uploadToCatbox(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string,
    userhash?: string
): Promise<NativeUploadResult> {
    try {
        const formData = new FormData();
        formData.append("reqtype", "fileupload");
        if (userhash) {
            formData.append("userhash", userhash);
        }
        formData.append("fileToUpload", new Blob([fileBuffer]), filename);

        const response = await fetch("https://catbox.moe/user/api.php", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
        }

        const text = (await response.text()).trim();
        if (!text) {
            return { success: false, error: "No URL returned from upload" };
        }

        return { success: true, url: text };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export async function uploadToLitterbox(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string,
    expiry: string
): Promise<NativeUploadResult> {
    try {
        const formData = new FormData();
        formData.append("reqtype", "fileupload");
        formData.append("time", expiry);
        formData.append("fileToUpload", new Blob([fileBuffer]), filename);

        const response = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
        }

        const text = (await response.text()).trim();
        if (!text) {
            return { success: false, error: "No URL returned from upload" };
        }

        return { success: true, url: text };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export async function uploadToGofile(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string,
    token?: string
): Promise<NativeUploadResult> {
    try {
        const formData = new FormData();
        if (token?.trim()) {
            formData.append("token", token.trim());
        }
        formData.append("file", new Blob([fileBuffer]), filename);

        const response = await fetch("https://upload.gofile.io/uploadfile", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
        }

        const data = await response.json() as {
            status?: string;
            error?: string;
            data?: { downloadPage?: string; code?: string; };
        };

        if (data.status !== "ok") {
            return { success: false, error: data.error || "Upload failed" };
        }

        const url = data.data?.downloadPage || (data.data?.code ? `https://gofile.io/d/${data.data.code}` : "");
        if (!url) {
            return { success: false, error: "No URL returned from upload" };
        }

        return { success: true, url };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export async function uploadToTmpfiles(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string
): Promise<NativeUploadResult> {
    try {
        const formData = new FormData();
        formData.append("file", new Blob([fileBuffer]), filename);

        const response = await fetch("https://tmpfiles.org/api/v1/upload", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
        }

        const data = await response.json() as { status?: string; data?: { url?: string; }; };
        const rawUrl = data.data?.url || "";
        if (!rawUrl || data.status !== "success") {
            return { success: false, error: "No URL returned from upload" };
        }

        const url = isUrlOn(rawUrl, "tmpfiles.org") && !new URL(rawUrl).pathname.startsWith("/dl/")
            ? rawUrl.replace(/tmpfiles\.org\/(\d+)/, "tmpfiles.org/dl/$1")
            : rawUrl;

        return { success: true, url };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export async function uploadToBuzzheavier(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string
): Promise<NativeUploadResult> {
    try {
        const response = await fetch(`https://w.buzzheavier.com/${encodeURIComponent(filename)}`, {
            method: "PUT",
            body: new Blob([fileBuffer])
        });

        const text = await response.text();
        if (!response.ok) {
            return { success: false, error: `Upload failed: ${response.status} ${text}` };
        }

        try {
            const data = JSON.parse(text) as { code?: number; data?: { id?: string; }; };
            if (data.code === 201 && data.data?.id) {
                return { success: true, url: `https://buzzheavier.com/${data.data.id}` };
            }
        } catch {
        }

        const url = text.trim();
        if (!url) {
            return { success: false, error: "No URL returned from upload" };
        }

        return { success: true, url };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export async function uploadToTempSh(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string
): Promise<NativeUploadResult> {
    try {
        const formData = new FormData();
        formData.append("file", new Blob([fileBuffer]), filename);

        const response = await fetch("https://temp.sh/upload", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
        }

        const url = (await response.text()).trim();
        if (!url) {
            return { success: false, error: "No URL returned from upload" };
        }

        return { success: true, url };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export async function uploadToFilebin(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string
): Promise<NativeUploadResult> {
    try {
        const binId = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
        const uploadUrl = `https://filebin.net/${binId}/${encodeURIComponent(filename)}`;

        const formData = new FormData();
        formData.append("file", new Blob([fileBuffer]), filename);

        const response = await fetch(uploadUrl, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
        }

        return { success: true, url: `https://filebin.net/${binId}/${encodeURIComponent(filename)}` };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export async function uploadToPixelVault(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string,
    uploadKey: string
): Promise<NativeUploadResult> {
    try {
        const formData = new FormData();
        formData.append("file", new Blob([fileBuffer]), filename);

        const response = await fetch("https://pixelvault.co/", {
            method: "POST",
            headers: {
                Authorization: uploadKey
            },
            body: formData
        });

        const text = await response.text();
        let data: { resource?: string; url?: string; } | null = null;

        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = null;
        }

        if (!response.ok) {
            return { success: false, error: `Upload failed: ${response.status} ${text}` };
        }

        const url = data?.resource || data?.url || text.trim();
        if (!url) {
            return { success: false, error: "No URL returned from upload" };
        }

        return { success: true, url };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export async function uploadToPixelDrain(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    filename: string,
    apiKey?: string
): Promise<NativeUploadResult> {
    try {
        const headers: Record<string, string> = {};
        if (apiKey?.trim()) {
            headers.Authorization = `Basic ${Buffer.from(`:${apiKey.trim()}`).toString("base64")}`;
        }

        const response = await fetch(`https://pixeldrain.com/api/file/${encodeURIComponent(filename)}`, {
            method: "PUT",
            headers,
            body: new Blob([fileBuffer])
        });

        const text = await response.text();
        let data: { id?: string; message?: string; } | null = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = null;
        }

        if (!response.ok) {
            return { success: false, error: data?.message || `Upload failed: ${response.status} ${text}` };
        }

        if (!data?.id) {
            return { success: false, error: data?.message || "No URL returned from upload" };
        }

        return { success: true, url: `https://pixeldrain.com/u/${data.id}` };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

function isValidHttpsUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:";
    } catch {
        return false;
    }
}

export function uploadToWebdav(
    _: IpcMainInvokeEvent,
    fileBuffer: ArrayBuffer,
    uploadUrl: string,
    headers: Record<string, string>
): Promise<NativeUploadResult> {
    return putPublic(fileBuffer, uploadUrl, headers);
}

export async function fetchFile(

    _: IpcMainInvokeEvent,

    url: string

): Promise<{ success: boolean; data?: ArrayBuffer; contentType?: string; error?: string; }> {

    try {

        const response = await fetchPublicUrl(url);

        if (!response.ok) {

            return { success: false, error: `Fetch failed: ${response.status} ${response.statusText}` };

        }

        const data = await readBody(response, MAX_REUPLOAD_BYTES);
        if (!data) return { success: false, error: "File is too large" };

        const contentType = response.headers.get("content-type") || "";

        return { success: true, data: data.buffer, contentType };

    } catch (e) {

        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };

    }

}
