/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MessageSendListener } from "@api/MessageEvents";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import definePlugin, { OptionType } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

const settings = definePluginSettings({
    cards: {
        type: OptionType.BOOLEAN,
        description: "Also stop messages with a card number in them",
        default: true
    },
    passwords: {
        type: OptionType.BOOLEAN,
        description: "Also stop messages that write out a password, like \"password: hunter2\"",
        default: true
    }
});

interface Secret {
    /** What the user is told the message contains */
    name: string;
    test(text: string): boolean;
}

const pattern = (re: RegExp) => (text: string) => re.test(text);

function luhn(digits: string) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        let d = digits.charCodeAt(digits.length - 1 - i) - 48;
        if (i % 2 === 1 && (d *= 2) > 9) d -= 9;
        sum += d;
    }
    return sum % 10 === 0;
}

const SECRETS: Secret[] = [
    // A Discord token is the account's id in base64, a timestamp and a signature, joined by dots
    { name: "a Discord token", test: pattern(/\b[MNO][\w-]{23,27}\.[\w-]{6}\.[\w-]{27,40}\b|\bmfa\.[\w-]{80,}/) },
    { name: "a webhook link", test: pattern(/discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]{50,}/i) },
    { name: "a private key", test: pattern(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/) },
    { name: "a GitHub token", test: pattern(/\b(?:gh[pousr]_[A-Za-z\d]{36,}|github_pat_\w{60,})\b/) },
    { name: "an API key", test: pattern(/\b(?:sk-(?:ant-|proj-)?[\w-]{32,}|sk_live_[A-Za-z\d]{24,}|AKIA[A-Z\d]{16}|AIza[\w-]{35}|xox[abprs]-[A-Za-z\d-]{20,})\b/) },
    { name: "a login token", test: pattern(/\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{20,}/) },
    {
        name: "a card number",
        // Only the lengths and first digits cards have: Discord's ids are 17 to 19 digits, so they never match
        test: text => settings.store.cards && [...text.matchAll(/(?<![\d.,])(?:\d[ -]?){14,15}\d(?![\d.,])/g)].some(m => {
            const digits = m[0].replace(/\D/g, "");
            const looksLikeCard = digits.length === 16 ? /^(?:4|5[1-5]|2[2-7]|6)/.test(digits) : /^3[47]/.test(digits);
            return looksLikeCard && luhn(digits);
        })
    },
    {
        name: "a password",
        // şifre and пароль are written as escapes: Endcord's script has to stay in Latin-1. \b doesn't see letters
        // outside English, so the start of the word is checked by hand
        test: text => settings.store.passwords && /(?<![\w\u00c0-\u024f\u0400-\u04ff])(?:password|passwd|pwd|\u015fifre|parola|contrase\u00f1a|mot de passe|\u043f\u0430\u0440\u043e\u043b\u044c)\s*[:=]\s*\S{4,}/i.test(text)
    }
];

/** The text that was stopped last, so pressing Enter again on it lets it through */
let stopped: { channelId: string; content: string; at: number; } | null = null;
const SECOND_PRESS_MS = 60_000;

const onSend: MessageSendListener = (channelId, message) => {
    const { content } = message;
    if (!content) return;

    const found = SECRETS.find(secret => secret.test(content));
    if (!found) return;

    if (stopped && stopped.channelId === channelId && stopped.content === content && Date.now() - stopped.at < SECOND_PRESS_MS) {
        stopped = null;
        return;
    }

    stopped = { channelId, content, at: Date.now() };
    showToast(t("This message looks like it has {what} in it, so it wasn't sent. Press Enter again to send it anyway.", { what: t(found.name) }), Toasts.Type.FAILURE);
    return { cancel: true };
};

export default definePlugin({
    name: "SecretGuard",
    description: "Stops a message that looks like it has a token, key, password or card number in it. Press Enter again to send it anyway.",
    tags: ["Privacy", "Chat"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,
    onBeforeMessageSend: onSend,

    stop() {
        stopped = null;
    }
});
