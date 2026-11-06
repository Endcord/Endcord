/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Message } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import definePlugin from "@utils/types";

import { checkMessage, Warning } from "./detect";

function describe(w: Warning) {
    switch (w.kind) {
        case "lookalike": return t("{host} looks like {real}, but it's a different site.", { host: w.host, real: w.real });
        case "bait": return t("{host} uses the name of {real}, but it isn't {real}.", { host: w.host, real: w.real });
        case "alphabets": return w.real
            ? t("{host} is spelled with letters from another alphabet to look like {real}.", { host: w.host, real: w.real })
            : t("{host} mixes letters from different alphabets, a common way to fake a site's name.", { host: w.host });
        case "hidden": return t("The link says {shown} but goes to {host}.", { host: w.host, shown: w.shown });
        case "userinfo": return t("The link starts with {shown} but goes to {host}.", { host: w.host, shown: w.shown });
    }
}

const cache = new Map<string, Warning[]>();

function Warnings({ message }: { message: Message; }) {
    const { content } = message;
    if (!content || !content.includes("http")) return null;

    let warnings = cache.get(content);
    if (!warnings) {
        warnings = checkMessage(content);
        if (cache.size > 500) cache.clear();
        cache.set(content, warnings);
    }
    if (!warnings.length) return null;

    return (
        <div className="ec-suslinks" role="note">
            {warnings.map((w, i) => (
                <div key={i} className="ec-suslinks-line">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                        <path d="M10.27 3.5a2 2 0 0 1 3.46 0l8.2 14.2A2 2 0 0 1 20.2 20.7H3.8a2 2 0 0 1-1.73-3l8.2-14.2ZM12 9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0v-4a1 1 0 0 0-1-1Zm0 9a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z" />
                    </svg>
                    <span>{describe(w)}</span>
                </div>
            ))}
        </div>
    );
}

export default definePlugin({
    name: "SuspiciousLinks",
    description: "Warns you under a message when a link in it only pretends to be a site like Discord or Steam: look-alike names, letters from other alphabets and links that hide where they go. Nothing is looked up online.",
    tags: ["Privacy", "Chat"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    renderMessageAccessory: props => <Warnings message={props.message} />,

    stop() {
        cache.clear();
    }
});
