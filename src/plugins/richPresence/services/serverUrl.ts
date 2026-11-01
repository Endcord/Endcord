/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const LOCAL_HOST = /^(localhost|\[::1\]|(127|10)(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])(\.\d{1,3}){2}|[^.]+|.+\.(local|lan|home|internal|localdomain))$/i;

// Home servers usually speak plain http on the LAN. Anywhere else the login would cross the internet unencrypted
export function canSendCredentials(url: string) {
    try {
        const { protocol, hostname } = new URL(url);
        return protocol === "https:" || (protocol === "http:" && LOCAL_HOST.test(hostname));
    } catch {
        return false;
    }
}
