/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const REDACTED = "[redacted]";
const MAX_SCANNED_LENGTH = 200_000;

// People paste their console into support channels, so a secret that reaches a log has already half leaked
const SECRETS: [RegExp, string][] = [
    // Discord user and bot tokens. The first part is the account's id in base64, so its length follows the id's
    [/\b[\w-]{20,}\.[\w-]{6}\.[\w-]{27,}\b/g, REDACTED],
    [/\bmfa\.[\w-]{80,}\b/g, REDACTED],
    // Keys with a recognisable prefix
    [/\b(?:sk|pk|rk)-[\w-]{20,}\b/g, REDACTED],
    [/\b(?:ghp|gho|ghu|ghs|ghr)_\w{20,}\b|\bgithub_pat_\w{20,}\b/g, REDACTED],
    [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
    // Whatever follows a header or field that holds one, keeping the name so the log stays readable
    [/\bBearer\s+[\w.~+/-]{8,}=*/gi, `Bearer ${REDACTED}`],
    [/\b(authorization|x-auth-token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)(["']?\s*[:=]\s*["']?)[^\s"',;}&]{6,}/gi, `$1$2${REDACTED}`]
];

export function redactSecrets(text: string) {
    if (text.length > MAX_SCANNED_LENGTH) return text;

    return SECRETS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}
