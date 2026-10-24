/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sleep } from "@utils/misc";
import { RestAPI } from "@webpack/common";

type Method = "get" | "post" | "patch" | "put" | "del";

interface RequestOptions {
    url: string;
    query?: Record<string, any>;
    body?: Record<string, any> | any[];
    /** Number of times to retry on rate limits / server errors. */
    retries?: number;
}

function parseError(error: any): { message: string; retryAfter: number; status?: number; } {
    let message: string | undefined;
    let retryAfter = 1000;

    if (typeof error?.text === "string") {
        try {
            const parsed = JSON.parse(error.text);
            message = parsed.message;
            if (typeof parsed.retry_after === "number") {
                retryAfter = parsed.retry_after * 1000;
            }
        } catch {
            message = error.text;
        }
    }

    if (typeof message !== "string") {
        message = String(error?.message ?? error);
    }

    const status: number | undefined = error?.status ?? error?.statusCode;

    return { message, retryAfter, status };
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return parseError(error).message;
}

/**
 * Thin wrapper around Discord's internal RestAPI which unwraps the response body,
 * retries on transient failures and turns API errors into readable Error objects.
 */
export async function request<T = any>(method: Method, options: RequestOptions): Promise<T> {
    const { retries = 3, ...data } = options;

    for (let attempt = 0; ; attempt++) {
        try {
            const response = await RestAPI[method](data);
            return response?.body as T;
        } catch (error) {
            const { message, retryAfter, status } = parseError(error);
            const retryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

            if (retryable && attempt < retries) {
                await sleep(retryAfter + 250);
                continue;
            }

            throw new Error(message);
        }
    }
}
