/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useI18n } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import { useAwaiter } from "@utils/react";
import { useState } from "@webpack/common";

import { cl } from ".";

// Pictures of plugins at work, kept in the repository's previews folder (see previews/README.md). A new one shows up
// as soon as it's pushed, with no Endcord update in between
const PREVIEWS_URL = "https://raw.githubusercontent.com/Endcord/Endcord/main/previews/";
const FILE_NAME = /^[\w.+-]+\.(?:webp|png|gif|webm|mp4)$/;

const logger = new Logger("PluginPreview");

interface Preview {
    file: string;
    alt?: string;
}

let manifest: Promise<Record<string, Preview>> | undefined;

function readManifest(raw: unknown) {
    const previews: Record<string, Preview> = Object.create(null);
    if (raw === null || typeof raw !== "object") return previews;

    for (const [name, entry] of Object.entries(raw)) {
        if (typeof entry?.file === "string" && FILE_NAME.test(entry.file)) {
            previews[name] = { file: entry.file, alt: typeof entry.alt === "string" ? entry.alt : undefined };
        }
    }
    return previews;
}

/** Fetched once a session, the first time someone opens a plugin */
const getManifest = () => manifest ??= fetch(`${PREVIEWS_URL}index.json`)
    .then(res => res.ok ? res.json() : null)
    .then(readManifest)
    .catch(err => {
        logger.debug("No plugin previews this time", err);
        return readManifest(null);
    });

export function PluginPreview({ name }: { name: string; }) {
    const { t } = useI18n();
    const [preview] = useAwaiter(() => getManifest().then(previews => previews[name]));
    const [failed, setFailed] = useState(false);

    if (!preview || failed) return null;

    const src = PREVIEWS_URL + preview.file;
    const alt = preview.alt ?? t("{name} at work", { name });

    return (
        <figure className={cl("preview")}>
            {/\.(?:webm|mp4)$/.test(preview.file)
                ? <video src={src} aria-label={alt} autoPlay muted loop playsInline onError={() => setFailed(true)} />
                : <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />}
        </figure>
    );
}
