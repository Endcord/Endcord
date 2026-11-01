/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The cloud secret and every setting travel to this address, so plain http is only fine on this machine
export function isSecureCloudUrl(url: string) {
    try {
        const { protocol, hostname } = new URL(url);
        return protocol === "https:" || (protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname));
    } catch {
        return false;
    }
}
