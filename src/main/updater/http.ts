/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RendererSettings } from "@main/settings";
import { openExternally } from "@main/utils/externalLinks";
import { fetchBuffer, fetchJson } from "@main/utils/http";
import { handleIpc } from "@main/utils/ipc";
import { ENDCORD_USER_AGENT } from "@shared/endcordUserAgent";
import { IpcEvents } from "@shared/IpcEvents";
import { isDiscordOrigin } from "@shared/trustedOrigins";
import { createHash, verify } from "crypto";
import { app, BrowserWindow, Notification } from "electron";
import updateKey from "file://updateKey.pem";
import { readFile, rename, writeFile } from "fs/promises";
import { join } from "path";

import gitHash from "~git-hash";

import { ENDCORD_FILES, MANIFEST_URL, serializeErrors, UpdateTrust } from "./common";
import { confirmUpdate, finishSwap, getRollbackStatus, initUpdateRollback, isRejectedUpdate, keepPreviousVersion, takeRollbackNotice } from "./rollback";

const API_BASE = "https://api.github.com/repos/Endcord/Endcord";
const ASSET_HOSTS = ["raw.githubusercontent.com", "endcord.com"];

interface PendingAsset {
    name: string;
    url: string;
    sha256: string;
}
let PendingUpdates = [] as PendingAsset[];
let pendingHash = "";
const trust: Pick<UpdateTrust, "checkedAt" | "signed" | "installedFiles"> = { checkedAt: 0, signed: false, installedFiles: "unknown" };

async function githubGet<T = any>(endpoint: string) {
    return fetchJson<T>(API_BASE + endpoint, {
        headers: {
            Accept: "application/vnd.github+json",
            // "All API requests MUST include a valid User-Agent header.
            // Requests with no User-Agent header will be rejected."
            "User-Agent": ENDCORD_USER_AGENT
        }
    });
}

async function calculateGitChanges() {
    const isOutdated = await fetchUpdates();
    if (!isOutdated) return [];

    try {
        const data = await githubGet(`/compare/${gitHash}...HEAD`);

        return data.commits.map((c: any) => ({
            // github api only sends the long sha
            hash: c.sha.slice(0, 7),
            author: c.author?.login ?? c.commit?.author?.name ?? "Unknown Author",
            message: c.commit.message.split("\n")[0]
        }));
    } catch {
        return [{
            hash: "new",
            author: "GitHub",
            message: "New update available on GitHub"
        }];
    }
}

function isAllowedAssetUrl(url: string) {
    try {
        const { protocol, hostname } = new URL(url);
        return protocol === "https:" && ASSET_HOSTS.includes(hostname);
    } catch {
        return false;
    }
}

// The checksums only prove a download is intact, this proves the release is ours.
// Keep the payload in sync with signManifest in scripts/uploadRelease.mjs
function isSignedManifest({ version, hash, updatedAt, installerSha256, assets, signature }: any) {
    if (![version, hash, installerSha256, signature].every(field => typeof field === "string") || typeof updatedAt !== "number") return false;

    const payload = [version, hash, updatedAt, installerSha256, ...assets.map(a => `${a.name} ${a.sha256.toLowerCase()}`).sort()].join("\n");
    try {
        return verify("sha256", Buffer.from(payload), updateKey, Buffer.from(signature, "base64"));
    } catch {
        return false;
    }
}

const NEW_APP_WORDS: Record<string, [title: string, body: string]> = {
    en: ["A new Endcord Desktop is out", "This one needs a fresh download. Click to get it."],
    tr: ["Yeni bir Endcord Desktop çıktı", "Bu sürüm yeniden indirilmeli. Almak için tıkla."],
    es: ["Hay un nuevo Endcord Desktop", "Esta versión hay que descargarla de nuevo. Haz clic para obtenerla."],
    fr: ["Un nouvel Endcord Desktop est sorti", "Cette version doit être téléchargée à nouveau. Cliquez pour l'obtenir."],
    ru: ["Вышел новый Endcord Desktop", "Эту версию нужно скачать заново. Нажмите, чтобы получить её."],
};
let announcedApp = "";

/**
 * Endcord Desktop's releases name the Electron they were built on in their signed version ("1.2.0+electron45.1.0").
 * Files built on another Electron may not run on this one, so such a release is a new download, announced once
 */
function needsNewApp(version: string, hash: string) {
    const electron = /\+electron(\d+\.\d+\.\d+)$/.exec(version)?.[1];
    if (!electron || electron === process.versions.electron) return false;
    if (announcedApp !== hash && Notification.isSupported()) {
        announcedApp = hash;
        const [title, body] = NEW_APP_WORDS[app.getLocale().slice(0, 2)] ?? NEW_APP_WORDS.en;
        const notice = new Notification({ title, body });
        notice.on("click", () => openExternally("https://endcord.com/download"));
        notice.show();
    }
    return true;
}

async function installedFilesMatch(assets: Pick<PendingAsset, "name" | "sha256">[]) {
    const matches = await Promise.all(assets.map(async ({ name, sha256 }) => {
        const contents = await readFile(join(__dirname, name)).catch(() => "");
        return createHash("sha256").update(contents).digest("hex") === sha256.toLowerCase();
    }));

    return matches.every(Boolean);
}

async function recordTrust(manifest: any) {
    try {
        trust.signed = isSignedManifest(manifest);
        trust.installedFiles = !trust.signed || manifest.hash !== gitHash
            ? "unknown"
            : await installedFilesMatch(manifest.assets) ? "match" : "changed";
    } catch {
        trust.signed = false;
        trust.installedFiles = "unknown";
    }

    trust.checkedAt = Date.now();
}

async function fetchUpdates() {
    try {
        const cacheBust = `?t=${Date.now()}`;
        const apiData = await fetchJson<any>(`${MANIFEST_URL}${cacheBust}`);
        if (apiData && apiData.assets && Array.isArray(apiData.assets) && apiData.assets.length > 0) {
            await recordTrust(apiData);

            const remoteTs = Number(apiData.updatedAt || 0);
            const localTs = typeof BUILD_TIMESTAMP === "number" ? BUILD_TIMESTAMP : 0;

            // Only consider it an update if the remote release timestamp is strictly greater than our build timestamp!
            if (remoteTs > localTs && apiData.hash !== gitHash) {
                // Only the four Endcord files, each with a checksum; anything else means the manifest is bad.
                const assets = (apiData.assets as any[]).filter(a =>
                    ENDCORD_FILES.includes(a?.name) && isAllowedAssetUrl(a.url) && /^[a-f0-9]{64}$/i.test(a.sha256 ?? ""));
                if (assets.length !== apiData.assets.length) return false;
                if (!isSignedManifest(apiData)) {
                    console.error("[Endcord] Ignoring update: bad signature");
                    return false;
                }
                // Already tried this release and it never came up on this machine
                if (isRejectedUpdate(apiData.hash)) return false;
                if (!IS_DISCORD_DESKTOP && needsNewApp(apiData.version, apiData.hash)) return false;

                PendingUpdates = assets.map(a => ({ name: a.name, url: a.url, sha256: a.sha256.toLowerCase() }));
                pendingHash = apiData.hash;
                return true;
            }
        }
    } catch { }

    return false;
}

async function applyUpdates() {
    // Stable and Canary share these files, so the other one may have installed this release already.
    // Swapping again would replace the version kept for going back with this one
    if (await installedFilesMatch(PendingUpdates)) {
        PendingUpdates = [];
        return true;
    }

    // Download and verify everything before touching the installed files.
    const files = await Promise.all(PendingUpdates.map(async ({ name, url, sha256 }) => {
        const contents = await fetchBuffer(url);
        const actual = createHash("sha256").update(contents).digest("hex");
        if (actual !== sha256)
            throw new Error(`Update rejected: ${name} does not match its checksum`);
        return { target: join(__dirname, name), contents };
    }));

    // Stage next to the real files, then swap them in, so a failed write never leaves a half-written Endcord.
    await Promise.all(files.map(f => writeFile(`${f.target}.update`, f.contents)));

    keepPreviousVersion(pendingHash);
    for (const f of files)
        await rename(`${f.target}.update`, f.target);
    finishSwap(pendingHash);

    PendingUpdates = [];
    return true;
}

handleIpc(IpcEvents.GET_REPO, serializeErrors(() => "https://github.com/Endcord/Endcord"));
handleIpc(IpcEvents.GET_UPDATES, serializeErrors(calculateGitChanges));
handleIpc(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
handleIpc(IpcEvents.BUILD, serializeErrors(applyUpdates));
handleIpc(IpcEvents.CONFIRM_UPDATE, () => {
    cameUp = true;
    return confirmUpdate();
});
handleIpc(IpcEvents.TAKE_ROLLBACK_NOTICE, takeRollbackNotice);
handleIpc(IpcEvents.GET_UPDATE_TRUST, async (): Promise<UpdateTrust> => {
    if (!trust.checkedAt) await fetchUpdates();

    return { ...trust, ...getRollbackStatus() };
});

initUpdateRollback();

// A release that breaks on a new Discord leaves Discord stuck on its loading screen, and the update check runs in the
// page once Discord is up, so it never comes. The main process keeps running either way: when a Discord page still
// hasn't come up a few minutes after loading, it looks for a newer release itself, installs it and loads the page again
const STUCK_AFTER = 3 * 60_000;
// Signed out, Discord waits on its login page and Endcord never reports in, but nothing is wrong
const SIGNED_OUT_PAGE = /^\/(?:login|register|reset|verify|authorize|oauth2|invite)/;

const HEALED_WORDS: Record<string, [title: string, body: string]> = {
    en: ["Endcord fixed itself", "Discord didn't finish starting, so Endcord installed its newest version and is loading it."],
    tr: ["Endcord kendini onardı", "Discord açılışı tamamlanmadı, bu yüzden Endcord en yeni sürümünü kurdu ve yüklüyor."],
    es: ["Endcord se ha reparado", "Discord no terminó de iniciarse, así que Endcord instaló su versión más reciente y la está cargando."],
    fr: ["Endcord s'est réparé", "Discord n'a pas fini de démarrer, Endcord a donc installé sa dernière version et la charge."],
    ru: ["Endcord исправил себя", "Discord не запустился до конца, поэтому Endcord установил последнюю версию и загружает её."]
};
const UPDATE_OFF_WORDS: Record<string, [title: string, body: string]> = {
    en: ["Discord didn't finish starting", "A newer Endcord is out and may fix it, but automatic updates are off. Click to download it."],
    tr: ["Discord açılışı tamamlanmadı", "Daha yeni bir Endcord var ve bunu düzeltebilir, ama otomatik güncelleme kapalı. İndirmek için tıkla."],
    es: ["Discord no terminó de iniciarse", "Hay un Endcord más reciente que puede arreglarlo, pero las actualizaciones automáticas están desactivadas. Haz clic para descargarlo."],
    fr: ["Discord n'a pas fini de démarrer", "Un Endcord plus récent peut corriger ça, mais les mises à jour automatiques sont désactivées. Cliquez pour le télécharger."],
    ru: ["Discord не запустился до конца", "Вышел новый Endcord, который может это исправить, но автообновление выключено. Нажмите, чтобы скачать."]
};

let cameUp = false;
let healing = false;
// Once per run: if the newest release doesn't come up either, loading it again and again helps no one
let healed = false;

function notify([title, body]: [string, string], onClick?: () => void) {
    if (!Notification.isSupported()) return;
    const notice = new Notification({ title, body });
    if (onClick) notice.on("click", onClick);
    notice.show();
}

async function healStuckStart(win: BrowserWindow) {
    if (cameUp || healing || healed || win.isDestroyed()) return;

    let path = "";
    try {
        path = new URL(win.webContents.getURL()).pathname;
    } catch { }
    if (SIGNED_OUT_PAGE.test(path)) return;

    healing = true;
    try {
        if (!await fetchUpdates()) return;

        const words = (table: typeof HEALED_WORDS) => table[app.getLocale().slice(0, 2)] ?? table.en;
        if (RendererSettings.store.autoUpdate === false) {
            healed = true;
            notify(words(UPDATE_OFF_WORDS), () => openExternally("https://endcord.com/download"));
            return;
        }

        await applyUpdates();
        healed = true;
        notify(words(HEALED_WORDS));
        if (!win.isDestroyed()) win.webContents.reload();
    } catch (err) {
        console.error("[Endcord] Couldn't update a Discord that didn't start", err);
    } finally {
        healing = false;
    }
}

app.on("browser-window-created", (_, win) => {
    win.webContents.on("did-finish-load", () => {
        if (cameUp || healed) return;
        try {
            if (!isDiscordOrigin(new URL(win.webContents.getURL()).origin)) return;
        } catch {
            return;
        }
        setTimeout(() => void healStuckStart(win), STUCK_AFTER);
    });
});
