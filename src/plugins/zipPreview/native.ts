/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readBody } from "@main/utils/http";
import { dialog, IpcMainInvokeEvent } from "electron";

const DISCORD_ATTACHMENT_BASE_URL = "https://cdn.discordapp.com/attachments/";
const MAX_ZIP_BYTES = 50 * 1024 * 1024;

export async function fetchDiscordAttachment(
    _: IpcMainInvokeEvent,
    pathAndQuery: string
): Promise<{ success: boolean; data?: ArrayBuffer; error?: string; }> {
    try {
        const attachmentUrl = getDiscordAttachmentUrl(pathAndQuery);
        if (!attachmentUrl) return { success: false, error: "Invalid Discord attachment path" };

        const previewDialog = await dialog.showMessageBox({
            title: "Preview ZIP attachment",
            message: "Discord is about to fetch this ZIP attachment for preview.",
            type: "question",
            detail: `Attachment: ${getAttachmentFileName(pathAndQuery)}\n\nIf you did not request this intentionally, choose Cancel.`,
            buttons: ["Cancel", "Preview ZIP"]
        });
        if (previewDialog.response !== 1) return { success: false, error: "ZIP preview was cancelled." };

        const response = await fetch(attachmentUrl);
        if (!response.ok) return { success: false, error: `Fetch failed: ${response.status} ${response.statusText}` };

        const data = await readBody(response, MAX_ZIP_BYTES);
        if (!data) return { success: false, error: "ZIP is too large to preview." };

        return { success: true, data: data.buffer };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}

function getAttachmentFileName(pathAndQuery: string): string {
    const path = pathAndQuery.split("?", 1)[0];
    const fileName = path.split("/").at(-1);
    return fileName ? decodeURIComponent(fileName) : "Unknown attachment";
}

function getDiscordAttachmentUrl(pathAndQuery: string): URL | null {
    if (!isValidDiscordAttachmentPathAndQuery(pathAndQuery)) return null;

    const url = new URL(pathAndQuery, DISCORD_ATTACHMENT_BASE_URL);
    return url.origin === "https://cdn.discordapp.com" && url.pathname.startsWith("/attachments/")
        ? url
        : null;
}

function isValidDiscordAttachmentPathAndQuery(pathAndQuery: string): boolean {
    if (
        pathAndQuery.includes("\\")
        || pathAndQuery.includes("..")
        || pathAndQuery.includes("://")
        || pathAndQuery.startsWith("/")
        || pathAndQuery.startsWith("//")
    ) {
        return false;
    }

    const path = pathAndQuery.split("?", 1)[0];
    const parts = path.split("/");

    return parts.length >= 3
        && /^\d+$/.test(parts[0])
        && /^\d+$/.test(parts[1])
        && parts.slice(2).every(part => part.length > 0);
}
