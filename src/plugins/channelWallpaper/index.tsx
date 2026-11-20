/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { EndcordModal } from "@components/EndcordModal";
import { RenderModalProps } from "@endcord/discord-types";
import { isSafeMediaUrl, isSnowflake } from "@shared/hosts";
import { Devs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import { t } from "@utils/i18n";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, Menu, openModal, React, RelationshipStore, SelectedChannelStore, showToast, Text, TextInput, Toasts, UserStore, useState } from "@webpack/common";

const MessageActions = findByPropsLazy("deleteMessage");
const SYNC_PREFIX = "\u200b\u200c\u200bNC_WP:";

// ---- Settings ----

const settings = definePluginSettings({
    wallpapers: {
        type: OptionType.STRING,
        description: "Wallpapers JSON — do not modify manually (managed by plugin)",
        default: "{}",
        hidden: true,
        restartNeeded: false,
    },
    opacity: {
        type: OptionType.SLIDER,
        description: "Wallpaper opacity (0 = invisible, 1 = full)",
        markers: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
        default: 0.3,
        stickToMarkers: false,
        restartNeeded: false,
    },
    blur: {
        type: OptionType.SLIDER,
        description: "Wallpaper blur (px)",
        markers: [0, 2, 5, 10, 15, 20],
        default: 0,
        stickToMarkers: false,
        restartNeeded: false,
    },
    defaultWallpaper: {
        type: OptionType.STRING,
        description: "Default wallpaper URL (for channels without a custom one). Empty = none.",
        default: "",
        restartNeeded: false,
    },
    syncWithFriends: {
        type: OptionType.BOOLEAN,
        description: "Sync wallpapers in DMs with friends who also use Endcord.",
        default: true,
        restartNeeded: false,
    },
    vpsUrl: {
        sensitive: true,
        type: OptionType.STRING,
        description: "VPS URL (e.g. wss://your-vps:3000). Empty = use hidden messages.",
        default: "",
        restartNeeded: true,
    },
    vpsPassword: {
        sensitive: true,
        type: OptionType.STRING,
        description: "Password for the sync server.",
        default: "endcord",
        restartNeeded: true,
    },
});

// Whatever a friend or the sync server sends ends up on your screen, so it has to come from where wallpapers get uploaded
const SYNC_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net", "i.imgur.com"]);

function isSyncableUrl(url: string) {
    try {
        const { protocol, hostname } = new URL(url);
        return protocol === "https:" && SYNC_HOSTS.has(hostname);
    } catch {
        return false;
    }
}

// ---- Wallpaper storage ----

// Only channel ids and addresses are kept, so a stored or synced value can't reach the object's prototype
function getWallpapers(): Record<string, string> {
    const wallpapers: Record<string, string> = Object.create(null);
    try {
        for (const [id, url] of Object.entries(JSON.parse(settings.store.wallpapers || "{}"))) {
            if (isSnowflake(id) && typeof url === "string") wallpapers[id] = url;
        }
    } catch { }
    return wallpapers;
}

function saveWallpaper(channelId: string, url: string, skipSync = false) {
    if (!isSnowflake(channelId)) return;
    const wp = getWallpapers();
    if (url) {
        wp[channelId] = url;
    } else {
        delete wp[channelId];
    }
    settings.store.wallpapers = JSON.stringify(wp);
    applyWallpaper(channelId);

    // The other side drops addresses it wouldn't load, so those aren't sent
    if (skipSync || (url && !isSyncableUrl(url))) return;
    const target = syncTarget(channelId);
    if (target === "server") {
        vpsSocket!.send(JSON.stringify({
            type: "SET",
            channelId,
            url,
            password: settings.store.vpsPassword
        }));
    } else if (target === "message") {
        sendMessage(channelId, { content: SYNC_PREFIX + (url || "DELETE") });
    }
}

/**
 * How a change in this channel reaches the other side, or null when it stays on this PC: only DMs sync, only with
 * syncWithFriends on, and a set sync server replaces the ghost messages even while it is disconnected
 */
function syncTarget(channelId: string): "server" | "message" | null {
    if (!settings.store.syncWithFriends) return null;
    const channel = ChannelStore.getChannel(channelId);
    if (channel?.type !== 1) return null;
    if (settings.store.vpsUrl) return vpsSocket?.readyState === WebSocket.OPEN ? "server" : null;
    return RelationshipStore.isFriend(channel.recipients?.[0]) ? "message" : null;
}

function saveLocalWallpaperOnly(channelId: string, url: string) {
    if (!isSnowflake(channelId) || (url && !isSyncableUrl(url))) return;

    const wp = getWallpapers();
    if (url) wp[channelId] = url;
    else delete wp[channelId];
    settings.store.wallpapers = JSON.stringify(wp);
    if (SelectedChannelStore.getChannelId() === channelId) {
        applyWallpaper(channelId);
    }
}

/**
 * Takes a friend's (or your own) sync message, if it is one. Wallpapers are only synced in DMs, so it counts only in
 * the DM between you and its sender: in a server channel any friend could otherwise change what you see there
 */
function takeSyncMessage(channelId: string, message: any) {
    if (!message?.content?.startsWith(SYNC_PREFIX)) return false;
    const authorId = message.author?.id;
    const isFromMe = authorId === UserStore.getCurrentUser()?.id;
    const channel = ChannelStore.getChannel(channelId);
    if (channel?.type !== 1) return false;
    if (!isFromMe && !(channel.recipients?.[0] === authorId && RelationshipStore.isFriend(authorId))) return false;

    // Only the sender can delete it; asking for a friend's message just earns a 403 each time.
    // Own ones go even with sync off, so none stay behind in the DM
    if (isFromMe) MessageActions?.deleteMessage?.(channelId, message.id);
    if (!settings.store.syncWithFriends) return false;
    const payload = message.content.slice(SYNC_PREFIX.length);
    saveLocalWallpaperOnly(channelId, payload === "DELETE" ? "" : payload);
    return true;
}

function getWallpaper(channelId: string): string {
    const wp = getWallpapers();
    return wp[channelId] || settings.store.defaultWallpaper || "";
}

function hasWallpaper(channelId: string): boolean {
    const wp = getWallpapers();
    return !!wp[channelId];
}

// ---- File picker (browser input fallback) ----

async function uploadToImgur(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append("image", file);
    try {
        const res = await fetch("https://api.imgur.com/3/image", {
            method: "POST",
            headers: { Authorization: "Client-ID 546c25a59c58ad7" },
            body: formData,
        });
        const json = await res.json();
        return json?.data?.link ?? null;
    } catch { return null; }
}

function pickFileRaw(): Promise<File | null> {
    return new Promise(resolve => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*,video/mp4,video/webm,.gif";
        input.style.display = "none";
        input.onchange = () => {
            const file = input.files?.[0];
            resolve(file || null);
            input.remove();
        };
        input.oncancel = () => { resolve(null); input.remove(); };
        document.body.appendChild(input);
        input.click();
    });
}

// Discord's desktop app has no prompt(): it returns nothing there, so the address is asked for in a window of our own
function WallpaperUrlModal({ modalProps, onApply }: { modalProps: RenderModalProps; onApply(url: string): void; }) {
    const [url, setUrl] = useState("");
    const [tried, setTried] = useState(false);
    const address = url.trim();
    const valid = /^https?:\/\//i.test(address) && isSafeMediaUrl(address);

    const apply = () => {
        setTried(true);
        if (!valid) return;
        onApply(address);
        modalProps.onClose();
    };

    return (
        <EndcordModal
            {...modalProps}
            size="sm"
            title={t("Wallpaper from a URL")}
            subtitle={t("A link to an image, a GIF or a video. In a DM, links from Discord or Imgur reach your friend too.")}
            actions={[
                { text: t("Cancel"), variant: "secondary", onClick: modalProps.onClose },
                { text: t("Apply"), variant: "primary", onClick: apply }
            ]}
        >
            <TextInput autoFocus value={url} placeholder="https://" onChange={(value: string) => setUrl(value)} onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") apply(); }} />
            {tried && !valid && <Text variant="text-sm/normal" color="text-feedback-critical" style={{ marginTop: 8 }}>{t("That isn't a link to an image or a video.")}</Text>}
        </EndcordModal>
    );
}

function promptUrl(): Promise<string | null> {
    return new Promise(resolve => {
        let answered = false;
        openModal(props => (
            <WallpaperUrlModal
                modalProps={{ ...props, onClose: () => { props.onClose(); if (!answered) resolve(null); } }}
                onApply={url => { answered = true; resolve(url); }}
            />
        ));
    });
}

// ---- CSS ----

const STYLE_ID = "channel-wallpaper-style";
const CONTAINER_ID = "channel-wallpaper-container";

function removeWallpaperElements() {
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CONTAINER_ID)?.remove();
}

function applyWallpaper(channelId?: string) {
    removeWallpaperElements();

    const cid = channelId || SelectedChannelStore?.getChannelId?.();
    if (!cid) return;

    const url = getWallpaper(cid);
    if (!url || !isSafeMediaUrl(url)) return;

    const opacity = settings.store.opacity ?? 0.3;
    const blur = settings.store.blur ?? 0;
    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.startsWith("data:video/");

    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        // Old and new Discord class names, they change often
        style.textContent = `
/* Messages area: make the background transparent to let the wallpaper show through */
[class*="messagesWrapper"],
[class*="chatContent"],
[class*="chat-messages"],
[class*="scroller"][class*="message"] {
    background: transparent !important;
}

#${CONTAINER_ID} {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
    opacity: ${opacity};
    ${blur > 0 ? `filter: blur(${blur}px);` : ""}
}

#${CONTAINER_ID} img,
#${CONTAINER_ID} video {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* Ensure the parent is relative for background positioning */
[class*="messagesWrapper"],
[class*="chatContent"] {
    position: relative !important;
}
`.trim();
        document.head.appendChild(style);
    }

    const container = document.createElement("div");
    container.id = CONTAINER_ID;

    if (isVideo) {
        const video = document.createElement("video");
        video.src = url;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        container.appendChild(video);
    } else {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.draggable = false;
        container.appendChild(img);
    }

    const tryInject = () => {
        // Old and new Discord class names, they change often
        const target =
            document.querySelector('[class*="messagesWrapper"]') ||
            document.querySelector('[class*="chat-messages"]') ||
            document.querySelector('[class*="chatContent"]') ||
            document.querySelector('[class*="content_"][class*="chat"]');

        if (target && target instanceof HTMLElement) {
            // Only the main chat area, not a popup
            if (!target.closest('[class*="popout"]') && !target.closest('[class*="modal"]')) {
                if (!target.querySelector(`#${CONTAINER_ID}`)) {
                    (target).style.position = "relative";
                    target.prepend(container);
                }
                return true;
            }
        }
        return false;
    };

    if (!tryInject()) {
        let pollCount = 0;
        const pollInterval = setInterval(() => {
            if (tryInject() || ++pollCount > 30) {
                clearInterval(pollInterval);
                activeObservers.delete(pollInterval);
            }
        }, 500);
        activeObservers.add(pollInterval);
        trackedTimeout(() => {
            clearInterval(pollInterval);
            activeObservers.delete(pollInterval);
        }, 15000);
    }
}

// ---- Context menu actions ----

const LOCAL_WALLPAPER_MAX = 2 * 1024 * 1024;

async function setWallpaperFromFile(channelId: string) {
    const file = await pickFileRaw();
    if (!file) return;

    // Imgur only carries the file to the friend; with nothing to sync it stays on this PC
    const syncing = !!syncTarget(channelId);
    if (syncing) {
        showToast(t("Uploading the wallpaper to Imgur…"), Toasts.Type.MESSAGE);
        const imgurUrl = await uploadToImgur(file);
        if (imgurUrl) {
            saveWallpaper(channelId, imgurUrl, false);
            showToast(t("Wallpaper set"), Toasts.Type.SUCCESS);
            return;
        }
    }

    // A local file is kept as a data URL inside the plugin's settings, which are rewritten and synced whole
    if (file.size > LOCAL_WALLPAPER_MAX) {
        showToast(t("This file is too big to keep on this PC (2 MB at most). Set it from a link instead."), Toasts.Type.FAILURE);
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        const dataUrl = reader.result as string;
        saveWallpaper(channelId, dataUrl, true);
        if (syncing) showToast(t("Imgur didn't take the file, so the wallpaper is only on this PC"), Toasts.Type.FAILURE);
        else showToast(t("Wallpaper set"), Toasts.Type.SUCCESS);
    };
    reader.readAsDataURL(file);
}

async function setWallpaperFromUrl(channelId: string) {
    const url = await promptUrl();
    if (url) {
        saveWallpaper(channelId, url, false);
        showToast(t("Wallpaper set"), Toasts.Type.SUCCESS);
    }
}

function removeWallpaper(channelId: string) {
    saveWallpaper(channelId, "");
    showToast(t("Wallpaper removed"), Toasts.Type.SUCCESS);
}

// ---- Context menu patches ----

function WallpaperIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v8.5l4-3 3 2.5 4-4 5 4V6H4zm0 12h16v-1.2l-5-4-3.8 3.8L8 14.5l-4 3V18zm5-8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
        </svg>
    );
}

function buildWallpaperMenu(channelId: string): React.ReactElement {
    const has = hasWallpaper(channelId);
    const syncs = !!syncTarget(channelId);

    return (
        <Menu.MenuItem
            id="channel-wallpaper"
            label={t("Wallpaper")}
            icon={WallpaperIcon}
        >
            <Menu.MenuItem
                id="wallpaper-from-file"
                label={t("From a file…")}
                action={() => setWallpaperFromFile(channelId)}
            />
            <Menu.MenuItem
                id="wallpaper-from-url"
                label={t("From a URL…")}
                action={() => setWallpaperFromUrl(channelId)}
            />
            {has && (
                <>
                    <Menu.MenuSeparator />
                    <Menu.MenuItem
                        id="wallpaper-remove"
                        label={syncs ? t("Remove for both of you") : t("Remove wallpaper")}
                        color="danger"
                        action={() => removeWallpaper(channelId)}
                    />
                </>
            )}
        </Menu.MenuItem>
    );
}

// ---- Sync server ----

let vpsSocket: WebSocket | null = null;
let vpsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopping = false;
const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
const activeObservers = new Set<ReturnType<typeof setInterval>>();

function trackedTimeout(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
        pendingTimers.delete(timer);
        fn();
    }, ms);
    pendingTimers.add(timer);
    return timer;
}

function initVPSSync() {
    if (!settings.store.vpsUrl || stopping) return;
    try {
        // The sync password travels over this connection
        const { protocol, hostname } = new URL(settings.store.vpsUrl);
        if (protocol !== "wss:" && !(protocol === "ws:" && ["localhost", "127.0.0.1"].includes(hostname))) {
            console.error("[ChannelWallpaper] The VPS URL has to use wss://");
            return;
        }

        vpsSocket = new WebSocket(settings.store.vpsUrl);
        vpsSocket.onmessage = e => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === "UPDATE" && data.channelId) {
                    saveLocalWallpaperOnly(data.channelId, data.url);
                }
            } catch { }
        };
        vpsSocket.onopen = () => {
            const channelId = SelectedChannelStore.getChannelId();
            if (channelId) vpsSocket?.send(JSON.stringify({ type: "JOIN", channelId, password: settings.store.vpsPassword }));
        };
        vpsSocket.onclose = () => {
            // Don't reconnect if the plugin is stopping/stopped
            if (stopping) return;
            vpsReconnectTimer = setTimeout(initVPSSync, 5000);
        };
    } catch (err) {
        console.error("[ChannelWallpaper] VPS Connection failed:", err);
    }
}

// User context menu: use the DM with that user
const userContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: any) => {
    if (!user?.id) return;
    // The DM with this user, not the channel that's open
    const channelId = (ChannelStore as any).getDMFromUserId?.(user.id);
    if (!channelId) return;

    children.push(
        buildWallpaperMenu(channelId)
    );
};

// Channel context menu
const channelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }: any) => {
    if (!channel?.id) return;
    children.push(
        buildWallpaperMenu(channel.id)
    );
};

// ---- Plugin ----

export default definePlugin({
    name: "ChannelWallpaper",
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    tags: ["Appearance", "Utility"],
    description: "Allows for custom backgrounds for every individual channel. In a DM with sync on, a wallpaper picked from a file is uploaded to Imgur so your friend can see it; anyone with that link can open it.",
    settings,

    contextMenus: {
        "user-context": userContextMenuPatch,
        "channel-context": channelContextMenuPatch,
        "gdm-context": channelContextMenuPatch,
    },

    flux: {
        CHANNEL_SELECT({ channelId }: { channelId: string; }) {
            if (channelId) {
                trackedTimeout(() => applyWallpaper(channelId), 100);
                if (vpsSocket?.readyState === WebSocket.OPEN) {
                    vpsSocket.send(JSON.stringify({ type: "JOIN", channelId, password: settings.store.vpsPassword }));
                }
            } else {
                removeWallpaperElements();
            }
        },
        MESSAGE_CREATE(data: { channelId: string, message: any; }) {
            takeSyncMessage(data.channelId, data.message);
        },
        LOAD_MESSAGES_SUCCESS(d: any) {
            let changed = false;
            for (const msg of d.messages || []) {
                if (takeSyncMessage(d.channelId, msg)) changed = true;
            }
            if (changed) {
                trackedTimeout(() => applyWallpaper(d.channelId), 100);
            }
        }
    },

    start() {
        stopping = false;
        if (settings.store.vpsUrl) initVPSSync();
        const cid = SelectedChannelStore.getChannelId();
        if (cid) {
            trackedTimeout(() => applyWallpaper(cid), 500);
        }
    },

    stop() {
        stopping = true;
        if (vpsReconnectTimer) {
            clearTimeout(vpsReconnectTimer);
            vpsReconnectTimer = null;
        }
        for (const timer of pendingTimers) clearTimeout(timer);
        pendingTimers.clear();
        for (const observer of activeObservers) clearInterval(observer);
        activeObservers.clear();
        removeWallpaperElements();
        if (vpsSocket) {
            vpsSocket.onclose = null;
            vpsSocket.close();
            vpsSocket = null;
        }
    }
});
