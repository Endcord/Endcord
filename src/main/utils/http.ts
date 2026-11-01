/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ENDCORD_USER_AGENT } from "@shared/endcordUserAgent";
import { lookup } from "dns";
import { IncomingMessage, request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { BlockList, isIP, LookupFunction } from "net";
import { Readable } from "stream";

type Url = string | URL;

const MAX_REDIRECTS = 5;
const IDLE_TIMEOUT_MS = 30_000;

// Native fetches run outside the renderer's CSP, so they must not become a way into this PC or the local network
const PRIVATE_ADDRESSES = new BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]] as const) {
    PRIVATE_ADDRESSES.addSubnet(network, prefix, "ipv4");
}
// 64:ff9b:: (NAT64), 2002:: (6to4) and 2001:: (Teredo) carry an IPv4 address inside, which is how 127.0.0.1 gets past an IPv4 list
for (const [network, prefix] of [["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8]] as const) {
    PRIVATE_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

export const DISCORD_CDN_HOSTS = ["cdn.discordapp.com", "media.discordapp.net"];

/** For natives that only ever read a few known hosts */
export function parseAllowedUrl(url: string, hosts: readonly string[]) {
    const parsed = URL.parse(url);
    if (parsed?.protocol !== "https:" || !hosts.includes(parsed.hostname)) throw new Error("Disallowed URL");

    return parsed;
}

const isPrivateAddress = (address: string) => PRIVATE_ADDRESSES.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");

// Runs as the connection is made, so the address that gets checked is the one that gets used.
// Resolving ahead of time would let a DNS server give a different answer to the connection itself
const publicLookup: LookupFunction = (hostname, options, callback) => {
    lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, "");
        if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) return callback(new Error("Disallowed URL"), "");

        if (options.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
    });
};

function requestPublicUrl(url: URL, method: string, signal?: AbortSignal) {
    return new Promise<IncomingMessage>((resolve, reject) => {
        const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
            method,
            lookup: publicLookup,
            signal,
            timeout: IDLE_TIMEOUT_MS,
            // Nothing here unpacks a compressed response
            headers: { "User-Agent": ENDCORD_USER_AGENT, "Accept-Encoding": "identity" }
        }, resolve);

        request.on("timeout", () => request.destroy(new Error(`${url.hostname} timed out`)));
        request.on("error", reject);
        request.end();
    });
}

/** For URLs that came from the renderer. Redirects are followed by hand so each hop gets the same check */
export async function fetchPublicUrl(url: string, { signal, method = "GET" }: { signal?: AbortSignal; method?: string; } = {}) {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Disallowed URL");

        // Addresses written out in the URL never reach the lookup
        const host = parsed.hostname.replace(/^\[|\]$/g, "");
        if (isIP(host) && isPrivateAddress(host)) throw new Error("Disallowed URL");

        const response = await requestPublicUrl(parsed, method, signal);
        const status = response.statusCode!;
        const { location } = response.headers;

        if (status < 300 || status >= 400 || !location) {
            const headers = new Headers();
            for (let i = 0; i < response.rawHeaders.length; i += 2) headers.append(response.rawHeaders[i], response.rawHeaders[i + 1]);

            const hasBody = ![204, 205, 304].includes(status);
            const result = new Response(hasBody ? Readable.toWeb(response) as unknown as BodyInit : null, { status, headers });
            // A Response built by hand has no url of its own, and resolving a short link needs the last hop
            return Object.defineProperty(result, "url", { value: url });
        }

        response.resume();

        const next = new URL(location, url);
        if (parsed.protocol === "https:" && next.protocol !== "https:") throw new Error("Disallowed URL");
        url = next.href;
    }

    throw new Error("Too many redirects");
}

/** Reads a response without trusting Content-Length, which a server can leave out or lie about. Null when it's over the limit */
export async function readBody(response: Response, maxBytes: number) {
    if (!response.body) return new Uint8Array(0);

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return body;
}

export async function checkedFetch(url: Url, options?: RequestInit) {
    try {
        var res = await fetch(url, options);
    } catch (err) {
        const cause = err instanceof Error && err.cause ? err.cause : err;

        throw new Error(`${options?.method ?? "GET"} ${url} failed: ${cause}`);
    }

    if (res.ok) {
        return res;
    }

    let message = `${options?.method ?? "GET"} ${url}: ${res.status} ${res.statusText}`;
    try {
        const reason = await res.text();
        message += `\n${reason}`;
    } catch { }

    throw new Error(message);
}

export async function fetchJson<T = any>(url: Url, options?: RequestInit) {
    const res = await checkedFetch(url, options);
    return res.json() as Promise<T>;
}

export async function fetchBuffer(url: Url, options?: RequestInit) {
    const res = await checkedFetch(url, options);
    const buf = await res.arrayBuffer();

    return Buffer.from(buf);
}
