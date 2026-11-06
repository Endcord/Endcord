/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import BadgeAPIPlugin from "@plugins/_api/badges";
import { Devs } from "@utils/constants";
import { openInviteModal } from "@utils/discord";
import { t, useI18n } from "@utils/i18n";
import {
    ModalCloseButton as ModalCloseButton_,
    ModalContent as ModalContent_,
    ModalFooter as ModalFooter_,
    ModalHeader as ModalHeader_,
    ModalRoot as ModalRoot_,
    openModal
} from "@utils/modal";
import { safeRecordMerge } from "@utils/safeRecordMerge";
import definePlugin, { OptionType } from "@utils/types";
import { Alerts, AuthenticationStore, Button, FluxDispatcher, IconUtils, React, Select, showToast, SnowflakeUtils, Toasts, UserProfileStore, UserStore } from "@webpack/common";

import { BADGES, BOOST_ICONS, BOOST_LABELS, BOOST_LABELS_RAW, BOOST_LEVELS, FLAG, GIFT_IDS, GIFT_LEVELS, GIFT_TIER_NAMES, NITRO_LEVEL_MONTHS, NITRO_LEVELS, OLD_NAME_BADGE_ICON, SPECIAL_BADGES, TIERED_BADGES } from "./badgeData";
import { reloadBadgeLayout, setManagedBadges, startBadgeManagement, stopBadgeManagement } from "./badgeManagement";
import {
    AVATAR_DECORATIONS, CloseIcon, CollectibleType, DisplayNameEffects, DisplayNameFonts, DisplayNameStylePicker, enumEntries,
    FramePreview, getDecorationUrl, ShopImage, useShopCollectibles
} from "./collectibles";
import { type CustomProfileData, hasAnyCustomData, hasCustomBadgesConfigured, type SavedPreset } from "./data";
import { boostBadgeRef, flagBadgeRef, makeBadge, nitroBadgeRef, specialBadgeRef, tieredBadgeRef } from "./discordBadgeRefs";
import { getSharedProfile, hasSharedProfiles, PROFILES_GUILD_ID, PROFILES_INVITE, publishProfile, sharingRetryAt, startSharing, stopSharing } from "./sharing";

const settings = definePluginSettings({
    showOthers: {
        type: OptionType.BOOLEAN,
        description: t("Show the profiles other Endcord users made with CustomProfile"),
        default: true,
        onChange: () => {
            // Reading the channel starts or stops with it
            if (_hooksPlugin) {
                stopSharing();
                startSharing(onSharedProfilesChanged, { read: settings.store.showOthers, mine: currentSharable }).catch(() => { });
            }
            bumpDataVersion();
            refreshUsers();
        }
    }
});

/** Shared profiles, when they're wanted; this account's own and its other accounts' always come first */
const getOthersProfile = (userId: string) => settings.store.showOthers ? getSharedProfile(userId) : null;

/** Makes Discord draw users again, after their shared profiles changed */
let _refreshQueued = false;
function refreshUsers() {
    if (_refreshQueued) return;
    _refreshQueued = true;
    requestAnimationFrame(() => {
        _refreshQueued = false;
        try { UserStore.emitChange(); } catch { }
        try { UserProfileStore.emitChange(); } catch { }
    });
}

function onSharedProfilesChanged(userIds: string[]) {
    const myId = AuthenticationStore?.getId?.();
    for (const id of userIds) {
        _fakeUserCache.delete(id);
        // This account's badges, and its other accounts', come from their own data, not from what they shared
        if (id === myId || allAccountsEnabled[id]) continue;
        const shared = getOthersProfile(id);
        if (shared) rememberProfile(id, buildUserBadgesArray(shared, true));
        else forgetProfile(id);
    }
    bumpDataVersion();
    refreshUsers();
}

/** The signed-in account and the profile it has on, for sharing */
function currentSharable() {
    const id = AuthenticationStore?.getId?.();
    if (!id) return null;
    const data = allAccountsEnabled[id] && hasAnyCustomData(allAccountsData[id]) ? allAccountsData[id] : null;
    return { id, data };
}

const NOT_MEMBER_WARNED = "customProfile_notMemberWarned";

/** Shares the saved profile with other Endcord users, and says so when it couldn't be */
async function shareMyProfile(myId: string, data: CustomProfileData | null) {
    const result = await publishProfile(myId, data);
    if (result === "not-member" && data) {
        // Once: someone who chose not to join isn't asked again on every save
        if (await DataStore.get(NOT_MEMBER_WARNED)) return;
        DataStore.set(NOT_MEMBER_WARNED, true).catch(() => { });
        Alerts.show({
            title: t("Only you can see this profile for now"),
            body: t("Endcord users see each other's profiles through the Endcord Discord server. Join it and save your profile again, and everyone using Endcord sees it too."),
            confirmText: t("Join the server"),
            cancelText: t("Not now"),
            onConfirm: () => openInviteModal(PROFILES_INVITE, PROFILES_GUILD_ID).catch(() => { })
        });
    } else if (result === "too-long") {
        showToast(t("Your profile is too long to share. Shorten it a little and save again."), Toasts.Type.FAILURE);
    } else if (result === "later") {
        // The profiles channel takes one message per person every few minutes; this save goes out when it may
        const minutes = Math.max(1, Math.ceil((sharingRetryAt() - Date.now()) / 60_000));
        showToast(t("Saved. Other Endcord users see this change in {minutes} min.", { minutes }), Toasts.Type.MESSAGE);
    } else if (result === "failed") {
        showToast(t("Couldn't share your profile with other Endcord users. It's saved, and it's shared the next time you save."), Toasts.Type.FAILURE);
    }
}

const ModalRoot = ModalRoot_;
const ModalHeader = ModalHeader_;
const ModalContent = ModalContent_;
const ModalFooter = ModalFooter_;
const ModalCloseButton = ModalCloseButton_;

const DS_KEY = "customProfile_data";
const DS_ENABLED = "customProfile_enabled";

const DS_PRESETS = "customProfile_presets";

const LS_KEY_DATA = "EndcordCP_data";
const LS_KEY_ENABLED = "EndcordCP_enabled";
const DS_ALL_DATA = "customProfile_allData";
const DS_ALL_ENABLED = "customProfile_allEnabled";
const LS_ALL_DATA = "EndcordCP_allData";
const LS_ALL_ENABLED = "EndcordCP_allEnabled";

let storedData: CustomProfileData = {};
let isEnabled = false;
let domObserver: MutationObserver | null = null, _textRewritten = false; // only walk the page to restore text when some was rewritten
let _origGetCurrentUser: (() => any) | null = null;
const _fakeUserCache = new Map<string, { v: number; src: any; fake: any }>();
const _fakeUserBuilding = new WeakSet<object>();

function wantsNitroLook(pd: CustomProfileData | null | undefined): boolean {
    if (!pd || pd.nitro === false) return false;
    if (pd.nitro) return true;
    if (pd.banner) return true;
    if (pd.profileEffectId) return true;
    if (pd.profileFrameId) return true;
    if (pd.accentColor != null) return true;
    if (pd.nitroLevel != null && pd.nitroLevel >= 0) return true;
    if (pd.boostMonths != null && pd.boostMonths >= 0) return true;
    return false;
}
let _trueOriginalUser: any = null;
let _dataVersion: number = 0;
/** The plugin while it's running, which installs the hooks once there's a custom profile to show */
let _hooksPlugin: { installHooks(): void; } | null = null;
let _hooksInstalled = false;

/** Whether any account has a custom profile turned on, which is what the hooks would show */
function needsHooks() {
    if (isEnabled && hasAnyCustomData(storedData)) return true;
    for (const id in allAccountsData) if (allAccountsEnabled[id] && hasAnyCustomData(allAccountsData[id])) return true;
    return settings.store.showOthers && hasSharedProfiles();
}

function ensureHooks() {
    if (_hooksInstalled || !_hooksPlugin || !needsHooks()) return;
    _hooksInstalled = true;
    _hooksPlugin.installHooks();
}

/** Every change to a profile goes through here, so the first one puts the hooks in */
function bumpDataVersion() {
    _dataVersion++;
    ensureHooks();
}
let allAccountsData: Record<string, CustomProfileData> = {};
let allAccountsEnabled: Record<string, boolean> = {};
// presets: keyed by accountId → array of saved presets
let allPresetsData: Record<string, SavedPreset[]> = {};

const LS_PRESETS = "EndcordCP_presets";

function rememberProfile(userId: string, badges?: any[]) {
    if (!userId) return;
    if (BadgeAPIPlugin?.DonorBadges) {
        if (Array.isArray(badges) && badges.length > 0) {
            BadgeAPIPlugin.DonorBadges[userId] = badges;
        } else {
            delete BadgeAPIPlugin.DonorBadges[userId];
        }
    }
}

function forgetProfile(userId: string) {
    if (!userId) return;
    if (BadgeAPIPlugin?.DonorBadges) {
        delete BadgeAPIPlugin.DonorBadges[userId];
    }
}

function getProfileDataFor(userId: string | null | undefined): CustomProfileData | null {
    if (!userId) return null;
    let myId = _cachedMyId;
    if (!myId) {
        try { myId = AuthenticationStore?.getId?.() || null; if (myId) _cachedMyId = myId; } catch { }
    }
    if (myId && userId === myId) {
        return isEnabled && hasAnyCustomData(storedData) ? storedData : null;
    }
    if (allAccountsEnabled[userId] && allAccountsData[userId]) {
        const d = allAccountsData[userId];
        return hasAnyCustomData(d) ? d : null;
    }
    if (myId && userId === myId) return null;
    return getOthersProfile(userId);
}

function pushBadge(arr: any[], flag: number, badgeFlag: number): void {
    const b = BADGES.find(x => x.flag === flag);
    if (b && (badgeFlag & flag)) {
        arr.push(makeBadge(`flag_${flag}`, b.icon, b.label, flagBadgeRef(flag)));
    }
}

/** When the Nitro badge says they subscribed: the date they picked, or as long ago as their level takes */
function nitroSinceDate(pd: CustomProfileData | null | undefined) {
    if (pd?.nitroSince && /^\d{4}-\d{2}-\d{2}$/.test(pd.nitroSince)) {
        // Noon, so the day stays the same in every time zone
        const picked = new Date(`${pd.nitroSince}T12:00:00`);
        if (!Number.isNaN(picked.getTime())) return picked;
    }
    const since = new Date();
    since.setMonth(since.getMonth() - (NITRO_LEVEL_MONTHS[pd?.nitroLevel ?? 0] ?? 0));
    return since;
}

function buildUserBadgesArray(data: CustomProfileData, enabled: boolean): any[] {
    if (!enabled) return [];
    const userBadges: any[] = [];
    const f = data.badgeFlags ?? 0;

    // === Badge Order ===
    // 1. Staff
    pushBadge(userBadges, FLAG.STAFF, f);

    // 2. Nitro Subscriber
    if (data.nitroLevel !== undefined && data.nitroLevel >= 0 && NITRO_LEVELS[data.nitroLevel]) {
        const nl = NITRO_LEVELS[data.nitroLevel];
        userBadges.push(makeBadge("nitro", nl.icon, nl.label, nitroBadgeRef(NITRO_LEVEL_MONTHS[data.nitroLevel])));
    }

    // 3. Partner
    pushBadge(userBadges, FLAG.PARTNER, f);

    // 4. Moderator Programs Alumni
    pushBadge(userBadges, FLAG.MOD_ALUMNI, f);

    // 5. HypeSquad Events
    pushBadge(userBadges, FLAG.HYPESQUAD, f);

    // 6. HypeSquad Houses (Bravery, Brilliance, Balance)
    pushBadge(userBadges, FLAG.BRAVERY, f);
    pushBadge(userBadges, FLAG.BRILLIANCE, f);
    pushBadge(userBadges, FLAG.BALANCE, f);

    // 7. Early Supporter
    pushBadge(userBadges, FLAG.EARLY_SUPPORTER, f);

    // 8. Server Booster
    if (data.boostMonths !== undefined && data.boostMonths >= 0 && BOOST_ICONS[data.boostMonths]) {
        userBadges.push(makeBadge("boost", BOOST_ICONS[data.boostMonths], `Server Boost - ${BOOST_LABELS[data.boostMonths]}`, boostBadgeRef(data.boostMonths, BOOST_LABELS[data.boostMonths], BOOST_LEVELS)));
    }

    // 9. Bug Hunter Gold (Level 2)
    pushBadge(userBadges, FLAG.BUG_HUNTER_2, f);

    // 10. Bug Hunter Normal (Level 1)
    pushBadge(userBadges, FLAG.BUG_HUNTER_1, f);

    // 11. Early Verified Bot Developer
    pushBadge(userBadges, FLAG.DEV_VERIFIED, f);

    // 12. Active Developer
    pushBadge(userBadges, FLAG.ACTIVE_DEVELOPER, f);

    // === Special / Custom Badges ===
    const specialOrder = [
        "oldname", "quest", "meadow", "orbs",
        "gift_patron", "gift_champion", "gift_luminary", "gift_icon", "gift_hero", "gift_legendary"
    ];
    if (data.customBadgeIds && data.customBadgeIds.length > 0) {
        const sortedIds = [...data.customBadgeIds].sort((a, b) => {
            const idxA = specialOrder.indexOf(a);
            const idxB = specialOrder.indexOf(b);
            return (idxA !== -1 ? idxA : 999) - (idxB !== -1 ? idxB : 999);
        });
        let giftShown = false;
        for (const cbId of sortedIds) {
            if (GIFT_IDS.includes(cbId)) {
                if (giftShown) continue;
                giftShown = true;
            }
            const sb = SPECIAL_BADGES[cbId];
            if (sb) {
                const tooltip = (cbId === "oldname" && data.oldName)
                    ? t("Originally known as {name}", { name: data.oldName })
                    : sb.label;
                userBadges.push(makeBadge(`sp_${cbId}`, sb.icon, tooltip, specialBadgeRef(cbId, GIFT_IDS, GIFT_LEVELS)));
            } else {
                const found = BADGES.find(b => String(b.flag) === cbId);
                if (found) {
                    userBadges.push(makeBadge(`flag_${found.flag}`, found.icon, found.label, flagBadgeRef(found.flag)));
                }
            }
        }
    }

    // === Tiered badges (account age, streaming, game time, game variety, gifting) ===
    for (const type of TIERED_BADGES) {
        const tier = data.tieredBadges?.[type.key];
        if (tier != null && type.tiers[tier]) {
            const tr = type.tiers[tier];
            userBadges.push(makeBadge(`tier_${type.key}`, tr.icon, `${type.label} - ${tr.label}`, tieredBadgeRef(type.key, tier, tr.label, type.tiers)));
        }
    }
    return userBadges;
}

function applyLocalProfileCache(userId: string, data: CustomProfileData, enabled: boolean) {
    if (!userId) return [];
    const userBadges = buildUserBadgesArray(data, enabled);
    if (userId === AuthenticationStore?.getId?.()) {
        setManagedBadges(userBadges.map(b => ({ key: b.key, label: b.description, icon: b.icon })));
    }
    if (!enabled || (userBadges.length === 0 && !hasAnyCustomData(data))) {
        forgetProfile(userId);
    } else {
        rememberProfile(userId, userBadges);
    }
    return userBadges;
}

function saveDataSync(userId: string, data: CustomProfileData, enabled: boolean) {
    try {
        localStorage.setItem(LS_KEY_DATA, JSON.stringify(data));
        localStorage.setItem(LS_KEY_ENABLED, enabled ? "1" : "0");
    } catch { } // the desktop app has no localStorage; DataStore holds the real copy
}

function saveAllDataSync() {
    try {
        localStorage.setItem(LS_ALL_DATA, JSON.stringify(allAccountsData));
        localStorage.setItem(LS_ALL_ENABLED, JSON.stringify(allAccountsEnabled));
    } catch { }
}

function savePresetsSync() {
    try {
        localStorage.setItem(LS_PRESETS, JSON.stringify(allPresetsData));
    } catch { }
}

function loadPresetsSync() {
    try {
        const raw = localStorage.getItem(LS_PRESETS);
        if (raw) {
            try { allPresetsData = JSON.parse(raw); } catch { allPresetsData = {}; }
        }
    } catch { allPresetsData = {}; }
}

function syncCurrentUserData() {
    const myId = _cachedMyId || AuthenticationStore?.getId?.();
    if (myId) {
        _cachedMyId = myId;
        storedData = allAccountsData[myId] || {};
        isEnabled = allAccountsEnabled[myId] || false;
    }
}

function loadDataSync() {
    try {
        const rawAll = localStorage.getItem(LS_ALL_DATA);
        if (rawAll) {
            try { allAccountsData = JSON.parse(rawAll); } catch { allAccountsData = {}; }
            const rawEnabled = localStorage.getItem(LS_ALL_ENABLED);
            try { allAccountsEnabled = rawEnabled ? JSON.parse(rawEnabled) : {}; } catch { allAccountsEnabled = {}; }
            syncCurrentUserData();
            if (!storedData || Object.keys(storedData).length === 0) {
                const rawOld = localStorage.getItem(LS_KEY_DATA);
                const enOld = localStorage.getItem(LS_KEY_ENABLED);
                if (rawOld) {
                    try { storedData = JSON.parse(rawOld); } catch { storedData = {}; }
                    isEnabled = enOld === "1";
                }
            }
            purgeCopiedProfiles();
            return;
        }
        const raw = localStorage.getItem(LS_KEY_DATA);
        const en = localStorage.getItem(LS_KEY_ENABLED);
        if (raw) {
            try { storedData = JSON.parse(raw); } catch { storedData = {}; }
        } else { storedData = {}; }
        isEnabled = en === "1";
    } catch {
        storedData = {};
        isEnabled = false;
    }
    purgeCopiedProfiles();
}

function purgeCopiedProfiles() {
    let changed = false;
    if (storedData?.copiedUserId) {
        storedData = {};
        isEnabled = false;
        changed = true;
    }
    for (const id of Object.keys(allAccountsData)) {
        if (allAccountsData[id]?.copiedUserId) {
            delete allAccountsData[id];
            delete allAccountsEnabled[id];
            changed = true;
        }
    }
    if (!changed) return;
    try {
        const myId = AuthenticationStore?.getId?.();
        saveDataSync(myId, storedData, isEnabled);
        saveAllDataSync();
        DataStore.set(DS_ALL_DATA, allAccountsData).catch(() => { });
        DataStore.set(DS_ALL_ENABLED, allAccountsEnabled).catch(() => { });
    } catch { }
}

function userIfStaffWorks(fake: any, raw: any) {
    try {
        if (!fake || fake === raw) return fake || raw;
        if (typeof raw?.isStaff === "function" && typeof fake.isStaff !== "function") return raw;
        return fake;
    } catch {
        return raw;
    }
}

function onAccountSwitch() {
    updateCachedRealData();
    syncCurrentUserData();
    _trueOriginalUser = null;
    bumpDataVersion();
    _realUsername = "";
    _realGlobalName = "";
    if (isEnabled) startDomObserver();
    else stopDomObserver();
    reloadBadgeLayout();
    forceAccountPanelRerender();
}

loadDataSync();
loadPresetsSync();

const HIDE_STYLE_ID = "cp-hide-during-load";
function removeHideStyle() {
    document.getElementById(HIDE_STYLE_ID)?.remove();
}

let _avatarPatchApplied = false;
function applyAvatarPatchEarly() {
    if (_avatarPatchApplied) return;
    try {
        const IU = (window as any).Endcord?.Webpack?.findByProps?.("getUserAvatarURL");
        if (!IU?.getUserAvatarURL) return;
        const orig = IU.getUserAvatarURL;
        IU.getUserAvatarURL = function (user: any, ...args: any[]) {
            const uid = user?.id ?? user?.userId;
            if (uid) {
                const pd = getProfileDataFor(uid);
                if (pd && pd.avatar) return pd.avatar;
            }
            return orig(user, ...args);
        };
        _avatarPatchApplied = true;
    } catch { }
}

async function loadData() {
    try {
        const allData = await DataStore.get(DS_ALL_DATA) as Record<string, CustomProfileData> | null;
        const allEnabled = await DataStore.get(DS_ALL_ENABLED) as Record<string, boolean> | null;
        if (allData && typeof allData === "object" && Object.keys(allData).length > 0) {
            allAccountsData = allData;
            allAccountsEnabled = allEnabled || {};
            syncCurrentUserData();
            saveAllDataSync();
            const myId = AuthenticationStore?.getId?.();
            saveDataSync(myId, storedData, isEnabled);
        } else {
            const d = await DataStore.get(DS_KEY) as CustomProfileData | null;
            const e = await DataStore.get(DS_ENABLED) as boolean | null;
            if (d !== null) storedData = d;
            if (e !== null) isEnabled = e === true;
            const myId = AuthenticationStore?.getId?.();
            if (myId && storedData && Object.keys(storedData).length > 0) {
                allAccountsData[myId] = storedData;
                allAccountsEnabled[myId] = isEnabled;
                DataStore.set(DS_ALL_DATA, allAccountsData).catch(() => { });
                DataStore.set(DS_ALL_ENABLED, allAccountsEnabled).catch(() => { });
                saveAllDataSync();
            }
            saveDataSync(myId, storedData, isEnabled);
        }
        // load presets from DataStore
        const presetsData = await DataStore.get(DS_PRESETS) as Record<string, SavedPreset[]> | null;
        if (presetsData && typeof presetsData === "object") {
            allPresetsData = presetsData;
            savePresetsSync();
        }
        purgeCopiedProfiles();
        for (const [uid, data] of Object.entries(allAccountsData)) {
            applyLocalProfileCache(uid, data, !!allAccountsEnabled[uid]);
        }
    } catch (err) { }
}

let _realDateCache: { id: string; variants: string[] } | null = null;
let _fakeDateCache: { iso: string; variants: string[] } | null = null;

function getRealDateVariants(): string[] {
    try {
        const u = _origGetCurrentUser?.() || UserStore.getCurrentUser();
        const real = (u)?.__cp_origUser || u;
        if (!real?.id) return [];
        if (_realDateCache && _realDateCache.id === real.id) return _realDateCache.variants;
        const ms = Number(BigInt(real.id) >> 22n) + 1420070400000;
        const d = new Date(ms);
        const variants = new Set<string>();
        const locales = ["en-US", "en-GB", "de-DE", "it-IT", navigator.language];
        const fmtSpecs: Intl.DateTimeFormatOptions[] = [
            { day: "numeric", month: "short", year: "numeric" },
            { day: "numeric", month: "long", year: "numeric" },
            { month: "short", day: "numeric", year: "numeric" },
            { month: "long", day: "numeric", year: "numeric" },
            { day: "2-digit", month: "2-digit", year: "numeric" },
        ];
        for (const loc of locales) {
            for (const fmt of fmtSpecs) {
                try {
                    const s = new Intl.DateTimeFormat(loc, fmt).format(d);
                    variants.add(s); variants.add(s.replace(/\s/g, " ")); variants.add(s.replace(/\s/g, "\u00a0"));
                } catch { }
            }
        }
        const day = d.getDate(); const year = d.getFullYear(); const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthsLong = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const mS = monthsShort[d.getMonth()]; const mL = monthsLong[d.getMonth()];
        const patterns = [`${day} ${mS} ${year}`, `${day} ${mL} ${year}`, `${mS} ${day}, ${year}`, `${mL} ${day}, ${year}`, d.toISOString().slice(0, 10)];
        for (const p of patterns) { variants.add(p); variants.add(p.replace(/ /g, "\u00a0")); variants.add(p.replace(/\u00a0/g, " ")); }
        const list = [...variants].filter(v => v.length >= 8);
        _realDateCache = { id: real.id, variants: list };
        return list;
    } catch { return []; }
}

function getFakeDateVariants(isoDate: string): string[] {
    try {
        if (!isoDate) return [];
        if (_fakeDateCache?.iso === isoDate) return _fakeDateCache.variants;
        const d = new Date(`${isoDate}T12:00:00Z`);
        const variants = new Set<string>();
        const fmtSpecs: Intl.DateTimeFormatOptions[] = [
            { day: "numeric", month: "short", year: "numeric" },
            { day: "numeric", month: "long", year: "numeric" },
            { month: "short", day: "numeric", year: "numeric" },
            { month: "long", day: "numeric", year: "numeric" },
        ];
        for (const fmt of fmtSpecs) { try { variants.add(new Intl.DateTimeFormat(navigator.language, fmt).format(d)); } catch { } }
        const list = [...variants];
        _fakeDateCache = { iso: isoDate, variants: list };
        return list;
    } catch { return []; }
}

let _cachedMyId: string | null = null;
let _realUsername = "";
let _realGlobalName = "";

function updateCachedRealData() {
    try { const myId = AuthenticationStore?.getId?.(); if (myId) _cachedMyId = myId; } catch { }
}

let _domQueued = false;
let _domMutations: MutationRecord[] = [];

const EDITABLE_SELECTOR = "[data-slate-editor],[contenteditable='true'],input,textarea,[role='textbox'],[id^='message-content-'],[class*='markup'],[class*='textArea'],[class*='bio']";

function shouldSkipText(node: Text): boolean {
    const el = node.parentElement;
    if (!el) return true;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT") return true;
    return !!el.closest(EDITABLE_SELECTOR);
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let _nameRegex: { from: string; regex: RegExp; } | null = null;

function replaceWholeName(text: string, from: string, to: string): string {
    if (!from || !to || from.length < 3 || from === to) return text;
    if (to.toLowerCase().includes(from.toLowerCase())) return text;
    // Built once per name, not once per text node
    if (_nameRegex?.from !== from) _nameRegex = { from, regex: new RegExp(`(?<![\\w@.-])${escapeRegExp(from)}(?![\\w@.-])`, "g") };
    return text.replace(_nameRegex.regex, to);
}

// What a text node has to contain before it's worth a closer look, lower case
function textNeedles(): string[] {
    const needles: string[] = [];
    if (_realUsername && storedData.username) needles.push(_realUsername.toLowerCase());
    if (storedData.createdAt) for (const date of getRealDateVariants()) needles.push(date.toLowerCase());
    return needles;
}

function scanTextNode(node: Text) {
    if (!isEnabled) return;
    const val: string = (node as any).__cp_orig || node.nodeValue;
    if (!val || val.length < 3) return;
    try { if (_trueOriginalUser) { _realUsername = _trueOriginalUser.username || _realUsername; _realGlobalName = _trueOriginalUser.globalName || _realGlobalName; } } catch { }

    // Nearly every text node on the page holds neither the name nor the date, so that is checked first: the editable
    // area check below walks every ancestor of the node with attribute selectors, on each node Discord adds
    const lower = val.toLowerCase();
    if (!textNeedles().some(needle => lower.includes(needle))) return;
    if (shouldSkipText(node)) return;

    let result = val;
    let replaced = false;
    if (storedData.createdAt) {
        const realDates = getRealDateVariants(); const fakeDates = getFakeDateVariants(storedData.createdAt);
        if (realDates.length > 0 && fakeDates.length > 0) {
            for (const realDate of realDates) {
                if (realDate.length >= 8 && lower.includes(realDate.toLowerCase())) {
                    result = result.split(realDate).join(fakeDates[0]); replaced = true;
                }
            }
        }
    }
    if (_realUsername && storedData.username) {
        const next = replaceWholeName(result, _realUsername, storedData.username);
        if (next !== result) { result = next; replaced = true; }
    }
    if (replaced && result !== node.nodeValue) { if ((node as any).__cp_orig === undefined) (node as any).__cp_orig = val; node.nodeValue = result; _textRewritten = true; }
}

function scanNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) { scanTextNode(node as Text); return; }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) scanTextNode(n as Text);
}

const MAX_DOM_MUTATIONS_PER_BATCH = 80;

function processDomBatch() {
    _domQueued = false;
    if (!isEnabled) { _domMutations = []; return; }
    const batch = _domMutations.slice(0, MAX_DOM_MUTATIONS_PER_BATCH);
    _domMutations = _domMutations.slice(MAX_DOM_MUTATIONS_PER_BATCH);
    for (const m of batch) {
        if (m.type === "characterData") scanTextNode(m.target as Text);
        else for (const n of m.addedNodes) {
            // Skip SVG/Canvas/Script subtrees — they never contain username text
            const el = n as Element;
            const tag = el.tagName;
            if (tag === "SVG" || tag === "CANVAS" || tag === "SCRIPT" || tag === "STYLE" || tag === "IMG" || tag === "VIDEO" || tag === "SOURCE" || tag === "LINK") continue;
            scanNode(n);
        }
    }
    // If there are still queued mutations, process them in the next frame
    if (_domMutations.length > 0 && !_domQueued) {
        _domQueued = true;
        setTimeout(() => requestAnimationFrame(processDomBatch), 80);
    }
}

function startDomObserver() {
    stopDomObserver(); if (!isEnabled) return;
    if (!storedData.username && !storedData.createdAt) return;
    domObserver = new MutationObserver(mutations => {
        if (!isEnabled || !mutations.length) return;
        if (_domMutations.length > 400) return;
        _domMutations.push(...mutations);
        if (!_domQueued) { _domQueued = true; setTimeout(() => requestAnimationFrame(processDomBatch), 80); }
    });
    domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function stopDomObserver() {
    domObserver?.disconnect(); domObserver = null; if (!_textRewritten) return; _textRewritten = false;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) { if ((n as any).__cp_orig !== undefined) { n.nodeValue = (n as any).__cp_orig; delete (n as any).__cp_orig; } }
}

function isMe(userId: string | null | undefined): boolean {
    if (!userId) return false;
    if (_cachedMyId) return _cachedMyId === userId;
    try { const myId = AuthenticationStore?.getId?.(); if (myId) { _cachedMyId = myId; return myId === userId; } } catch { }
    return false;
}

function EditIcon({ size = 18 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>;
}
function FolderIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z" /></svg>;
}
function TrashIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2h4a1 1 0 1 1 0 2h-1.1l-.9 12.1A3 3 0 0 1 17 23H7a3 3 0 0 1-3-2.9L3.1 8H2a1 1 0 0 1 0-2h4V4Zm2 0v2h6V4H9ZM5.1 8l.9 11.9a1 1 0 0 0 1 .1h6a1 1 0 0 0 1-.1L14.9 8H5.1Z" /></svg>;
}
function SaveIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4Zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm3-10H5V5h10v4Z" /></svg>;
}
function BookmarkIcon() {
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17 2H7a2 2 0 0 0-2 2v18l7-3 7 3V4a2 2 0 0 0-2-2Z" /></svg>;
}
function AddPresetIcon() {
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}

function PresetsBar({ accountId, currentData, onLoad }: {
    accountId: string;
    currentData: CustomProfileData;
    onLoad: (data: CustomProfileData) => void;
}) {
    const [presets, setPresets] = React.useState<SavedPreset[]>(() => allPresetsData[accountId] ?? []);
    const [naming, setNaming] = React.useState(false);
    const [newName, setNewName] = React.useState("");
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        setPresets(allPresetsData[accountId] ?? []);
        setNaming(false);
        setNewName("");
    }, [accountId]);

    function savePreset() {
        const name = newName.trim();
        if (!name) return;
        const updated: SavedPreset[] = [...presets, { name, data: { ...currentData } }];
        allPresetsData[accountId] = updated;
        DataStore.set(DS_PRESETS, allPresetsData).catch(() => { });
        savePresetsSync();
        setPresets(updated);
        setNaming(false);
        setNewName("");
    }

    function deletePreset(idx: number) {
        const updated = presets.filter((_, i) => i !== idx);
        allPresetsData[accountId] = updated;
        DataStore.set(DS_PRESETS, allPresetsData).catch(() => { });
        savePresetsSync();
        setPresets(updated);
    }

    if (presets.length === 0 && !naming) {
        return (
            <div className="cp-presets-bar cp-presets-bar--empty">
                <BookmarkIcon />
                <span className="cp-presets-hint">{t("No saved presets")}</span>
                <button className="cp-preset-add" onClick={() => { setNaming(true); setTimeout(() => inputRef.current?.focus(), 50); }} title={t("Save current as preset")}>
                    <AddPresetIcon /><span>{t("Save preset")}</span>
                </button>
            </div>
        );
    }

    return (
        <div className="cp-presets-bar">
            <div className="cp-presets-scroll">
                {presets.map((p, i) => (
                    <div key={i} className="cp-preset-chip" title={t("Click to load")} onClick={() => onLoad({ ...p.data })}>
                        <BookmarkIcon />
                        <span className="cp-preset-name">{p.name}</span>
                        <button className="cp-preset-del" title={t("Delete preset")} onClick={e => { e.stopPropagation(); deletePreset(i); }}>
                            <CloseIcon />
                        </button>
                    </div>
                ))}
                {naming ? (
                    <div className="cp-preset-naming">
                        <input
                            ref={inputRef}
                            className="cp-input cp-preset-name-input"
                            placeholder={t("Preset name...")}
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") savePreset(); if (e.key === "Escape") { setNaming(false); setNewName(""); } }}
                            maxLength={32}
                        />
                        <button className="cp-btn cp-btn-primary cp-preset-confirm" onClick={savePreset} title={t("Confirm")}><SaveIcon /></button>
                        <button className="cp-clear-btn" onClick={() => { setNaming(false); setNewName(""); }} title={t("Cancel")}><CloseIcon /></button>
                    </div>
                ) : (
                    <button className="cp-preset-add" onClick={() => { setNaming(true); setTimeout(() => inputRef.current?.focus(), 50); }} title={t("Save current as preset")}>
                        <AddPresetIcon /><span>{t("Save preset")}</span>
                    </button>
                )}
            </div>
        </div>
    );
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties; }) {
    return <div className="cp-section-label" style={style}>{children}</div>;
}

function Field({ label, value, placeholder, onChange, type = "text" }: {
    label: string; value: string; placeholder?: string; onChange: (v: string) => void; type?: string;
}) {
    return (
        <div className="cp-field">
            <SectionLabel>{label}</SectionLabel>
            <input className="cp-input" type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        </div>
    );
}

function ImageUpload({ label, value, onChange, isAvatar }: { label: string; value: string; onChange: (v: string) => void; isAvatar?: boolean; }) {
    const fileRef = React.useRef<HTMLInputElement>(null);
    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => { if (ev.target?.result) onChange(ev.target.result as string); };
        reader.readAsDataURL(file);
    }
    return (
        <div className="cp-field">
            <SectionLabel>{label}</SectionLabel>
            {isAvatar && value && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                    <div style={{
                        position: "relative",
                        width: 80, height: 80,
                        borderRadius: "50%",
                        overflow: "hidden",
                        border: "3px solid var(--brand-experiment, #5865f2)",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.5)"
                    }}>
                        <img src={value} alt="avatar preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button
                            onClick={() => onChange("")}
                            title={t("Delete")}
                            style={{
                                position: "absolute", top: 0, right: 0,
                                background: "rgba(0,0,0,0.65)",
                                border: "none", borderRadius: "50%",
                                width: 22, height: 22,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", color: "#fff", padding: 0
                            }}>
                            <CloseIcon />
                        </button>
                    </div>
                </div>
            )}
            <div className="cp-image-row">
                <input className="cp-input cp-url-input" placeholder={t("Image URL...")} value={value.startsWith("data:") ? "" : value} onChange={e => onChange(e.target.value)} />
                <button className="cp-file-btn" onClick={() => fileRef.current?.click()} title={t("Choose a file")}><FolderIcon /></button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
                {value && !isAvatar && <>
                    <img src={value} alt="" className="cp-preview-avatar" />
                    <button className="cp-clear-btn" onClick={() => onChange("")} title={t("Delete")}><CloseIcon /></button>
                </>}
            </div>
        </div>
    );
}

function Toggle({ label, checked, onChange, sublabel }: { label: string; checked: boolean; onChange: (v: boolean) => void; sublabel?: string; }) {
    return (
        <div className="cp-toggle-row" onClick={() => onChange(!checked)}>
            <div className="cp-toggle-text">
                <span className="cp-toggle-label">{label}</span>
                {sublabel && <span className="cp-toggle-sub">{sublabel}</span>}
            </div>
            <div className={`cp-toggle ${checked ? "cp-toggle--on" : ""}`}><div className="cp-toggle-thumb" /></div>
        </div>
    );
}

function BadgeBtn({ label, icon, active, onClick }: { label: string; icon?: string; active: boolean; onClick: () => void; }) {
    return (
        <button onClick={onClick} className={`cp-badge ${active ? "cp-badge--on" : ""}`}
            style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {icon && <img src={icon} alt="" style={{ width: 16, height: 16, objectFit: "contain", flexShrink: 0 }} />}
            <span>{label}</span>
        </button>
    );
}

function BadgePicker({ selected, onChange, nitroType, onNitroType, boostLevel, onBoostLevel, customIds, onCustomIds, oldName, onOldName, tiered, onTiered }: {
    selected: number; onChange: (v: number) => void;
    nitroType: number; onNitroType: (v: number) => void;
    boostLevel: number; onBoostLevel: (v: number) => void;
    customIds: string[]; onCustomIds: (v: string[]) => void;
    oldName: string; onOldName: (v: string) => void;
    tiered: Record<string, number>; onTiered: (v: Record<string, number>) => void;
}) {
    const { t } = useI18n();
    const hasOldName = customIds.includes("oldname");
    // Discord shows one Gifting tier at a time, so the tiers are a single choice
    const giftId = customIds.find(x => GIFT_IDS.includes(x));
    return (
        <div className="cp-field">
            <SectionLabel>{t("Badges")}</SectionLabel>
            <div className="cp-badges">
                {BADGES.map(b => (
                    <BadgeBtn key={b.flag} label={t(b.label)} icon={b.icon}
                        active={!!(selected & b.flag)} onClick={() => onChange(selected ^ b.flag)} />
                ))}
            </div>
            <SectionLabel style={{ marginTop: 8 }}>{t("Evolving Nitro Badge")}</SectionLabel>
            <div className="cp-badges">
                <BadgeBtn label={t("None")} active={nitroType === -1} onClick={() => onNitroType(-1)} />
                {NITRO_LEVELS.map((n, i) => (
                    <BadgeBtn key={i} label={t(n.label)} icon={n.icon} active={nitroType === i} onClick={() => {
                        onNitroType(i);
                    }} />
                ))}
            </div>
            <SectionLabel style={{ marginTop: 8 }}>{t("Special Badges")}</SectionLabel>
            <div className="cp-badges">
                <BadgeBtn label={t("Old username")} icon={OLD_NAME_BADGE_ICON} active={hasOldName}
                    onClick={() => onCustomIds(hasOldName ? customIds.filter(x => x !== "oldname") : [...customIds, "oldname"])} />
                <BadgeBtn label={t(SPECIAL_BADGES.quest.label)}
                    icon={SPECIAL_BADGES.quest.icon}
                    active={customIds.includes("quest")}
                    onClick={() => onCustomIds(customIds.includes("quest") ? customIds.filter(x => x !== "quest") : [...customIds, "quest"])} />
                <BadgeBtn label={t(SPECIAL_BADGES.meadow.label)}
                    icon={SPECIAL_BADGES.meadow.icon}
                    active={customIds.includes("meadow")}
                    onClick={() => onCustomIds(customIds.includes("meadow") ? customIds.filter(x => x !== "meadow") : [...customIds, "meadow"])} />
                <BadgeBtn label={t(SPECIAL_BADGES.orbs.label)}
                    icon={SPECIAL_BADGES.orbs.icon}
                    active={customIds.includes("orbs")}
                    onClick={() => onCustomIds(customIds.includes("orbs") ? customIds.filter(x => x !== "orbs") : [...customIds, "orbs"])} />
            </div>
            {hasOldName && (
                <div className="cp-field" style={{ marginTop: 6 }}>
                    <SectionLabel style={{ marginTop: 0 }}>{t("Old username displayed in tooltip")}</SectionLabel>
                    <input className="cp-input" value={oldName} placeholder={t("OldUser#0000")}
                        onChange={e => onOldName(e.target.value)} />
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                        {t('Ex : Triggerr#5954 — will appear as "Old username: Triggerr#5954" when hovering the badge.')}
                    </div>
                </div>
            )}
            <SectionLabel style={{ marginTop: 8 }}>{t("Gifting")}</SectionLabel>
            <div className="cp-badges">
                <BadgeBtn label={t("None")} active={!giftId} onClick={() => onCustomIds(customIds.filter(x => !GIFT_IDS.includes(x)))} />
                {GIFT_IDS.map((id, i) => (
                    <BadgeBtn key={id} label={t(GIFT_TIER_NAMES[i])} icon={SPECIAL_BADGES[id].icon}
                        active={giftId === id} onClick={() => onCustomIds([...customIds.filter(x => !GIFT_IDS.includes(x)), id])} />
                ))}
            </div>
            <SectionLabel style={{ marginTop: 8 }}>{t("Boost Badge (Server Booster)")}</SectionLabel>
            <div className="cp-badges">
                <BadgeBtn label={t("None")} active={boostLevel === -1} onClick={() => onBoostLevel(-1)} />
                {BOOST_LABELS_RAW.map((lbl, i) => (
                    <BadgeBtn key={i} label={t(lbl)} icon={BOOST_ICONS[i]} active={boostLevel === i} onClick={() => onBoostLevel(i)} />
                ))}
            </div>
            {TIERED_BADGES.map(type => {
                const current = tiered[type.key] ?? -1;
                const pick = (tier: number) => {
                    const next = { ...tiered };
                    if (tier < 0) delete next[type.key];
                    else next[type.key] = tier;
                    onTiered(next);
                };
                return (
                    <React.Fragment key={type.key}>
                        <SectionLabel style={{ marginTop: 8 }}>{t(type.label)}</SectionLabel>
                        <div className="cp-badges">
                            <BadgeBtn label={t("None")} active={current === -1} onClick={() => pick(-1)} />
                            {type.tiers.map((tier, i) => (
                                <BadgeBtn key={i} label={t(tier.label)} icon={tier.icon} active={current === i} onClick={() => pick(i)} />
                            ))}
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

function forceAccountPanelRerender() {
    try {
        bumpDataVersion();
        _fakeUserCache.clear();
        try { (UserStore as any)?.emitChange?.(); } catch { }
        try { (UserProfileStore as any)?.emitChange?.(); } catch { }
        try {
            const MAS = (window as any).Endcord?.Webpack?.findByProps?.("getUsers", "getValidUsers");
            MAS?.emitChange?.();
        } catch { }
        if (isEnabled) startDomObserver();
        else stopDomObserver();
    } catch { }
}

function CustomProfileModal({ rootProps }: { rootProps: any; }) {
    const { t } = useI18n();
    const shop = useShopCollectibles();
    const nameFonts = React.useMemo(() => enumEntries(() => DisplayNameFonts), []);
    const nameEffects = React.useMemo(() => enumEntries(() => DisplayNameEffects), []);
    // The shop's decorations, then the ones it no longer sells that Endcord still knows
    const decorations = React.useMemo(() => {
        const seen = new Set<string>();
        return [...shop.byType[CollectibleType.AVATAR_DECORATION].map(dec => ({ id: dec.skuId, label: dec.name })), ...AVATAR_DECORATIONS]
            .filter(dec => !seen.has(dec.id) && !!seen.add(dec.id));
    }, [shop.byType]);
    const myId = AuthenticationStore?.getId?.() || "";
    const [selectedAccountId, setSelectedAccountId] = React.useState(myId);
    const [data, setData] = React.useState<CustomProfileData>(() => ({ ...(allAccountsData[myId] || storedData || {}) }));
    const [saving, setSaving] = React.useState(false);
    const nitroLevel = data.nitroLevel ?? -1;
    const boostLevel = data.boostMonths ?? -1;
    const customIds = data.customBadgeIds ?? [];
    const oldName = data.oldName ?? "";
    const accounts = React.useMemo(() => {
        try {
            const MAS = (window as any).Endcord?.Webpack?.findByProps?.("getUsers", "getValidUsers");
            if (MAS?.getUsers) {
                const users = MAS.getUsers();
                if (Array.isArray(users) && users.length > 0) return users;
            }

            const internalStore = (window as any).Endcord?.Webpack?.findStore?.("MultiAccountStore");
            if (internalStore?.getUsers) {
                const users = internalStore.getUsers();
                if (Array.isArray(users) && users.length > 0) return users;
            }
        } catch (e) { console.error("[CustomProfile] Failed to fetch accounts:", e); }

        const me = UserStore.getCurrentUser();
        return me ? [me] : [];
    }, []);

    React.useEffect(() => {
        const newData = allAccountsData[selectedAccountId] || {};
        setData({ ...newData });
    }, [selectedAccountId]);

    function set<K extends keyof CustomProfileData>(key: K, val: CustomProfileData[K]) {
        setData(d => ({ ...d, [key]: val }));
    }

    function loadPreset(presetData: CustomProfileData) {
        setData({ ...presetData });
    }

    async function save() {
        try {
            setSaving(true);
            const savedData = { ...data };
            const effectiveId = selectedAccountId || myId;

            if (effectiveId) {
                allAccountsData[effectiveId] = savedData;
                allAccountsEnabled[effectiveId] = true;
            }

            storedData = savedData;
            isEnabled = true;
            bumpDataVersion();

            if (effectiveId) applyLocalProfileCache(effectiveId, savedData, true);

            saveDataSync(effectiveId, savedData, true);
            saveAllDataSync();
            DataStore.set(DS_ALL_DATA, allAccountsData).catch(() => { });
            DataStore.set(DS_ALL_ENABLED, allAccountsEnabled).catch(() => { });

            updateCachedRealData();
            forceAccountPanelRerender();
            // Only the signed-in account can post its own profile; the others share theirs when they're signed in
            if (effectiveId && effectiveId === AuthenticationStore?.getId?.()) shareMyProfile(effectiveId, savedData);

            showToast(t("Profile Saved"), Toasts.Type.SUCCESS, {
                component: React.createElement("span", { style: { color: "var(--text-normal, #ffffff)", fontWeight: "600", fontSize: "14px" } }, t("Profile Saved"))
            });
        } catch (err: any) {
            console.error("[CustomProfile] save error:", err);
            showToast(`Save error: ${err?.message || err}`, Toasts.Type.FAILURE);
        } finally {
            setSaving(false);
            rootProps.onClose();
        }
    }

    async function reset() {
        try {
            setSaving(true);
            delete allAccountsData[selectedAccountId];
            delete allAccountsEnabled[selectedAccountId];

            if (selectedAccountId === myId || !selectedAccountId) {
                storedData = {};
                isEnabled = false;
                _trueOriginalUser = null;
                bumpDataVersion();
            }

            // Immediately revert all modified text nodes in DOM and stop observer
            stopDomObserver();

            // Immediately clear custom badges from memory so native Discord badges show instantly
            try {
                if (BadgeAPIPlugin && BadgeAPIPlugin.DonorBadges) {
                    delete BadgeAPIPlugin.DonorBadges[selectedAccountId];
                }
                if (selectedAccountId === myId) setManagedBadges([]);
            } catch {}

            saveDataSync(selectedAccountId, {}, false);
            if (selectedAccountId && selectedAccountId === AuthenticationStore?.getId?.()) shareMyProfile(selectedAccountId, null);

            saveAllDataSync();
            DataStore.set(DS_ALL_DATA, allAccountsData).catch(() => { });
            DataStore.set(DS_ALL_ENABLED, allAccountsEnabled).catch(() => { });
            DataStore.set(DS_KEY, {}).catch(() => { });
            DataStore.set(DS_ENABLED, false).catch(() => { });

            updateCachedRealData();
            forceAccountPanelRerender();

            showToast(t("Profile Reset"), Toasts.Type.SUCCESS, {
                component: React.createElement("span", { style: { color: "var(--text-normal, #ffffff)", fontWeight: "600", fontSize: "14px" } }, t("Profile Reset"))
            });
        } catch (err: any) {
            console.error("[CustomProfile] reset error:", err);
            showToast(`Reset error: ${err?.message || err}`, Toasts.Type.FAILURE);
        } finally {
            setSaving(false);
            rootProps.onClose();
        }
    }

    // Repair: re-apply current stored data without deleting anything
    function repair() {
        try {
            _trueOriginalUser = null;
            bumpDataVersion();
            // Reload from localStorage to ensure consistency
            loadDataSync();
            forceAccountPanelRerender();
        } catch (err) {
            console.error("[CustomProfile] repair error:", err);
        }
        rootProps.onClose();
    }

    const accentHex = data.accentColor != null ? `#${data.accentColor.toString(16).padStart(6, "0")}` : "";

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <div className="cp-header">
                    <EditIcon size={16} />
                    <span className="cp-header-title">{t("Custom Profile")}</span>
                </div>
                <div style={{ marginLeft: "auto", marginRight: 8, minWidth: 200 }}>
                    <Select
                        options={accounts.map((acc: any) => ({
                            value: acc.id,
                            label: acc.globalName || acc.username,
                        }))}
                        isSelected={(v: string) => v === selectedAccountId}
                        select={(v: string) => setSelectedAccountId(v)}
                        serialize={(v: string) => v}
                        renderOptionLabel={(o: any) => {
                            const acc = accounts.find((a: any) => a.id === o.value);
                            let avatarUrl = "";
                            try { if (acc && IconUtils?.getUserAvatarURL) avatarUrl = IconUtils.getUserAvatarURL(acc, false, 20); } catch {}
                            return (
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {avatarUrl ? <img src={avatarUrl} style={{ borderRadius: "50%", width: 20, height: 20 }} /> : null}
                                    {o.label}
                                </div>
                            );
                        }}
                        renderOptionValue={(selected: any[]) => {
                            const option = selected[0];
                            if (!option) return t("Select Account");
                            const acc = accounts.find((a: any) => a.id === option.value);
                            let avatarUrl = "";
                            try { if (acc && IconUtils?.getUserAvatarURL) avatarUrl = IconUtils.getUserAvatarURL(acc, false, 20); } catch {}
                            return (
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {avatarUrl ? <img src={avatarUrl} style={{ borderRadius: "50%", width: 20, height: 20 }} /> : null}
                                    {option.label}
                                </div>
                            );
                        }}
                    />
                </div>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <div className="cp-presets-wrapper">
                <PresetsBar accountId={selectedAccountId} currentData={data} onLoad={loadPreset} />
            </div>
            <ModalContent className="cp-content">
                <Field label={t("Username")} value={data.username ?? ""} placeholder="my_username_00" onChange={v => set("username", v)} />
                <Field label={t("Display name")} value={data.globalName ?? ""} placeholder={t("My Name")} onChange={v => set("globalName", v)} />
                <ImageUpload label={t("Profile picture")} value={data.avatar ?? ""} onChange={v => set("avatar", v)} isAvatar={true} />
                <Toggle label={t("Simulate Nitro")} sublabel={t("Enables gradient profile color")} checked={data.nitro ?? false} onChange={v => set("nitro", v)} />
                <ImageUpload label={t("Banner")} value={data.banner ?? ""} onChange={v => set("banner", v)} />
                <div className="cp-divider" />
                <Field label={t("Bio")} value={data.bio ?? ""} placeholder={t("My description...")} onChange={v => set("bio", v)} />
                <Field label={t("Pronouns")} value={data.pronouns ?? ""} placeholder={t("he/him")} onChange={v => set("pronouns", v)} />
                <div className="cp-field">
                    <SectionLabel>{t("Profile color (Nitro — gradient possible)")}</SectionLabel>
                    <div className="cp-color-row" style={{ marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 6 }}>{t("Color 1")}</span>
                        <input type="color" value={accentHex || "#5865f2"} onChange={e => { const n = parseInt(e.target.value.replace("#", ""), 16); if (!isNaN(n)) set("accentColor", n); }} className="cp-color-swatch" />
                        <input value={accentHex} placeholder="#5865f2" onChange={e => { const h = e.target.value.replace("#", ""); const n = parseInt(h, 16); if (!isNaN(n) && h.length === 6) set("accentColor", n); else if (!e.target.value || e.target.value === "#") set("accentColor", undefined); }} className="cp-input cp-color-input" />
                        {data.accentColor != null && <button className="cp-clear-btn" onClick={() => set("accentColor", undefined)}><CloseIcon /></button>}
                    </div>
                    <div className="cp-color-row">
                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 6 }}>{t("Color 2")}</span>
                        {(() => {
                            const hex2 = data.accentColor2 != null ? `#${data.accentColor2.toString(16).padStart(6, "0")}` : ""; return (<>
                                <input type="color" value={hex2 || "#eb459e"} onChange={e => { const n = parseInt(e.target.value.replace("#", ""), 16); if (!isNaN(n)) set("accentColor2", n); }} className="cp-color-swatch" />
                                <input value={hex2} placeholder={`#eb459e (${t("optional")})`} onChange={e => { const h = e.target.value.replace("#", ""); const n = parseInt(h, 16); if (!isNaN(n) && h.length === 6) set("accentColor2", n); else if (!e.target.value || e.target.value === "#") set("accentColor2", undefined); }} className="cp-input cp-color-input" />
                                {data.accentColor2 != null && <button className="cp-clear-btn" onClick={() => set("accentColor2", undefined)}><CloseIcon /></button>}
                            </>);
                        })()}
                    </div>
                </div>
                <Field label={t("Account creation date")} value={data.createdAt ?? ""} placeholder="2010-06-29" type="date" onChange={v => set("createdAt", v)} />
                <Field label={t("Email address (local display)")} value={data.email ?? ""} placeholder={t("exemple@mail.com")} onChange={v => set("email", v)} />
                <Field label={t("Phone (local display)")} value={data.phone ?? ""} placeholder="+33 6 00 00 00 00" onChange={v => set("phone", v)} />
                <div className="cp-divider" />
                <BadgePicker
                    selected={data.badgeFlags ?? 0} onChange={v => set("badgeFlags", v)}
                    nitroType={nitroLevel} onNitroType={v => {
                        set("nitroLevel", v as any);
                        if (v >= 1) set("nitro", true);
                    }}
                    boostLevel={boostLevel} onBoostLevel={v => set("boostMonths", v)}
                    customIds={customIds} onCustomIds={v => set("customBadgeIds", v)}
                    tiered={data.tieredBadges ?? {}} onTiered={v => set("tieredBadges", v)}
                    oldName={oldName} onOldName={v => set("oldName", v)}
                />
                {nitroLevel >= 0 && (
                    <Field label={t("Nitro date")} value={data.nitroSince ?? ""} type="date" onChange={v => set("nitroSince", v || undefined)} />
                )}
                <div className="cp-divider" />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <SectionLabel>{t("Avatar decoration")}</SectionLabel>
                </div>

                <div className="cp-badges cp-effects" style={{ flexWrap: "wrap", gap: 6 }}>
                    <button onClick={() => set("decorationAsset", undefined)}
                        className={`cp-badge ${!data.decorationAsset ? "cp-badge--on" : ""}`} style={{ minWidth: 60 }}>
                        {t("None")}
                    </button>
                    {decorations.map(dec => (
                        <button key={dec.id}
                            onClick={() => set("decorationAsset", data.decorationAsset === dec.id ? undefined : dec.id)}
                            className={`cp-badge ${data.decorationAsset === dec.id ? "cp-badge--on" : ""}`}
                            title={dec.label} style={{ padding: 3, lineHeight: 0, width: 52, height: 52, borderRadius: 6 }}>
                            <img src={getDecorationUrl(dec.id)} alt={dec.label}
                                style={{ width: 46, height: 46, objectFit: "contain", display: "block" }} />
                        </button>
                    ))}
                </div>
                <div className="cp-divider" />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <SectionLabel>{t("Profile Effect")}</SectionLabel>
                </div>

                <div className="cp-badges cp-effects">
                    <button onClick={() => set("profileEffectId", undefined)}
                        className={`cp-badge ${!data.profileEffectId ? "cp-badge--on" : ""}`} style={{ minWidth: 60 }}>
                        {t("None")}
                    </button>
                    {shop.byType[CollectibleType.PROFILE_EFFECT].map(eff => (
                        <button key={eff.skuId}
                            onClick={() => set("profileEffectId", data.profileEffectId === eff.skuId ? undefined : eff.skuId)}
                            className={`cp-badge cp-effect ${data.profileEffectId === eff.skuId ? "cp-badge--on" : ""}`}
                            title={eff.name}>
                            {eff.item.thumbnailPreviewSrc
                                ? <img src={eff.item.thumbnailPreviewSrc} alt={eff.name} loading="lazy" />
                                : <span>{eff.name}</span>}
                        </button>
                    ))}
                </div>
                <div className="cp-divider" />
                <SectionLabel>{t("Profile frame")}</SectionLabel>
                <div className="cp-badges cp-effects">
                    <button onClick={() => set("profileFrameId", undefined)}
                        className={`cp-badge ${!data.profileFrameId ? "cp-badge--on" : ""}`} style={{ minWidth: 60 }}>
                        {t("None")}
                    </button>
                    {shop.byType[CollectibleType.PROFILE_FRAME].map(frame => (
                        <button key={frame.skuId}
                            onClick={() => set("profileFrameId", data.profileFrameId === frame.skuId ? undefined : frame.skuId)}
                            className={`cp-badge cp-effect ${data.profileFrameId === frame.skuId ? "cp-badge--on" : ""}`}
                            title={frame.name}>
                            <FramePreview frame={frame} />
                        </button>
                    ))}
                </div>
                <div className="cp-divider" />
                <SectionLabel>{t("Nameplate")}</SectionLabel>
                <div className="cp-badges cp-effects">
                    <button onClick={() => set("nameplate", undefined)}
                        className={`cp-badge ${!data.nameplate ? "cp-badge--on" : ""}`} style={{ minWidth: 60 }}>
                        {t("None")}
                    </button>
                    {shop.byType[CollectibleType.NAMEPLATE].map(plate => (
                        <button key={plate.skuId}
                            onClick={() => set("nameplate", data.nameplate?.skuId === plate.skuId ? undefined : {
                                skuId: plate.skuId,
                                asset: plate.item.asset,
                                label: plate.item.label,
                                palette: plate.item.palette
                            })}
                            className={`cp-badge cp-nameplate ${data.nameplate?.skuId === plate.skuId ? "cp-badge--on" : ""}`}
                            title={plate.name}>
                            <ShopImage skuId={plate.skuId} name={plate.name} />
                        </button>
                    ))}
                </div>
                {shop.loading && <div className="cp-hint">{t("Loading the Discord shop…")}</div>}
                {shop.failed && <div className="cp-hint">{t("Couldn't load the Discord shop. Close this window and try again.")}</div>}
                <div className="cp-divider" />
                <SectionLabel>{t("Display name style")}</SectionLabel>
                <DisplayNameStylePicker
                    value={data.displayNameStyles}
                    previewName={data.globalName || UserStore.getCurrentUser()?.globalName || UserStore.getCurrentUser()?.username || "Endcord"}
                    fonts={nameFonts}
                    effects={nameEffects}
                    onChange={v => set("displayNameStyles", v)}
                />
                <div className="cp-hint">{t("Visual and local modifications only — persistent between restarts.")}</div>
            </ModalContent>
            <ModalFooter className="cp-footer">
                <button className="cp-btn cp-btn-ghost" onClick={rootProps.onClose}>{t("Cancel")}</button>
                <button className="cp-btn cp-btn-danger" onClick={reset}><TrashIcon /><span>{t("Reset")}</span></button>
                <button
                    className="cp-btn"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-normal)" }}
                    onClick={repair}
                    title={t("Re-applies your profile without deleting settings")}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 14.93V15a1 1 0 0 0-2 0v1.93A8.001 8.001 0 0 1 4.07 13H6a1 1 0 0 0 0-2H4.07A8.001 8.001 0 0 1 11 4.07V6a1 1 0 0 0 2 0V4.07A8.001 8.001 0 0 1 19.93 11H18a1 1 0 0 0 0 2h1.93A8.001 8.001 0 0 1 13 16.93z"/>
                    </svg>
                    <span>{t("Repair")}</span>
                </button>
                <button className="cp-btn cp-btn-primary" onClick={save} disabled={saving}><SaveIcon /><span>{saving ? t("Saving...") : t("Save")}</span></button>
            </ModalFooter>
        </ModalRoot>
    );
}

function CustomProfileButton() {
    return <HeaderBarButton icon={() => <EditIcon size={18} />} tooltip={t("Custom Profile")} onClick={() => openModal(props => <CustomProfileModal rootProps={props} />)} />;
}

export default definePlugin({
    name: "CustomProfile",
    enabledByDefault: true,
    description: t("Visually customize your Discord profile (username, PFP, banner, badges, bio...). Other Endcord users see it too."),
    authors: [Devs.ewlle],
    dependencies: ["HeaderBarAPI", "ContextMenuAPI"],
    settings,

    patches: [
        {
            find: ':"SHOULD_LOAD");',
            replacement: {
                match: /\i(?:\?)?.getPreviewBanner\(\i,\i,\i\)(?=.{0,100}"COMPLETE")/,
                replace: "$self.patchBannerUrl(arguments[0])||$&"
            }
        }
    ],

    fakeCurrentUser(user: any, forceMe?: boolean) {
        if (!user) return user;
        if (user.__cp_isClone) return user;
        if (_fakeUserBuilding.has(user)) return user;
        try {
            const myId = AuthenticationStore?.getId?.();
            const isMe = forceMe ?? (myId && user.id === myId);
            const pd = getProfileDataFor(user.id);
            if (!pd) return user;
            const cached = user.id ? _fakeUserCache.get(user.id) : undefined;
            if (cached && cached.v === _dataVersion && cached.src === user) return cached.fake;

            _fakeUserBuilding.add(user);
            const realUser = (user).__cp_origUser || user;
            if (isMe && !realUser.__cp_isClone) _trueOriginalUser = realUser;

            const realUsername = realUser.__cp_isClone ? (realUser._realUsername || realUser.username) : realUser.username;
            const realGlobalName = realUser.__cp_isClone ? (realUser._realGlobalName ?? realUser.globalName) : realUser.globalName;
            const realDisplayName = realGlobalName || realUsername;

            const clone = Object.create(Object.getPrototypeOf(realUser));
            const setProp = (k: string, v: any, enumerable = true) => {
                Object.defineProperty(clone, k, {
                    value: v,
                    writable: true,
                    configurable: true,
                    enumerable
                });
            };

            for (const key of Reflect.ownKeys(realUser)) {
                if (key === "username" || key === "globalName" || key === "displayName" || key === "discriminator" || key === "__cp_isClone" || key === "__cp_origUser") continue;
                const desc = Object.getOwnPropertyDescriptor(realUser, key);
                if (!desc) continue;
                if ("value" in desc) {
                    Object.defineProperty(clone, key, {
                        value: desc.value,
                        writable: true,
                        configurable: true,
                        enumerable: !!desc.enumerable
                    });
                } else {
                    Object.defineProperty(clone, key, {
                        get: desc.get,
                        set: desc.set ?? (() => { }),
                        configurable: true,
                        enumerable: !!desc.enumerable
                    });
                }
            }
            setProp("__cp_isClone", true, false);
            setProp("__cp_origUser", realUser, false);
            setProp("_realUsername", realUsername, false);
            setProp("_realGlobalName", realGlobalName, false);
            setProp("_realDisplayName", realDisplayName, false);

            const fakeUser = pd?.username || realUsername;
            const hasCustomGlobalName = isMe && !!pd?.globalName;
            const fakeGlobal = hasCustomGlobalName ? pd.globalName : realGlobalName;
            const origDisplay = realGlobalName || realDisplayName || realUsername;
            const fakeDisplay = hasCustomGlobalName ? (pd.globalName || origDisplay) : origDisplay;

            setProp("username", fakeUser);
            setProp("globalName", fakeGlobal);
            setProp("displayName", fakeDisplay);
            setProp("discriminator", "0");

            if (pd?.email && isMe) setProp("email", pd.email);
            if (pd?.phone && isMe) setProp("phone", pd.phone);

            setProp("getTag", () => fakeUser, false);
            setProp("getGlobalName", () => fakeGlobal, false);
            setProp("hasUniqueUsername", () => true, false);
            setProp("isPomelo", () => true, false);
            setProp("hasHadPomelo", () => true, false);
            setProp("toString", () => fakeDisplay, false);

            if (pd?.createdAt) {
                const fakeCreatedAt = new Date(`${pd.createdAt}T12:00:00Z`);
                setProp("createdAt", fakeCreatedAt);
            }

            if (pd?.decorationAsset) {
                const decoData = {
                    asset: pd.decorationAsset,
                    skuId: pd.decorationAsset
                };
                // Discord reads user.avatarDecoration (a getter for avatarDecorationData on the record),
                // so the clone needs the data under both names
                setProp("avatarDecoration", decoData);
                setProp("avatarDecorationData", decoData);
            }

            // Discord draws these straight from the user: the nameplate in the member and DM lists, the name style
            // wherever the display name shows
            if (pd?.nameplate) setProp("collectibles", { ...realUser.collectibles, nameplate: { ...pd.nameplate, expiresAt: null } });
            if (pd?.displayNameStyles) setProp("displayNameStyles", pd.displayNameStyles);

            setProp("publicFlags", (pd?.badgeFlags != null && pd.badgeFlags > 0) ? pd.badgeFlags : realUser.publicFlags);
            setProp("flags", (pd?.badgeFlags != null && pd.badgeFlags > 0) ? pd.badgeFlags : realUser.flags);

            const spoofNitro = wantsNitroLook(pd);
            if (spoofNitro) {
                setProp("premiumSince", nitroSinceDate(pd));

                const bm = pd?.boostMonths ?? -1;
                if (bm >= 0) {
                    const BOOST_M = [1, 2, 3, 6, 9, 12, 15, 18, 24];
                    const boostSince = new Date();
                    boostSince.setMonth(boostSince.getMonth() - (BOOST_M[bm] ?? 1));
                    setProp("premiumGuildSince", boostSince);
                } else {
                    setProp("premiumGuildSince", null);
                }
            } else if (pd && pd.nitro === false) {
                // "No Nitro" is null to Discord. 0 isn't a premium type, and its file size limit lookup
                // (limits[premiumType].fileSize) throws on it, which leaves every upload stuck
                setProp("premiumType", null);
                setProp("premiumSince", null);
                setProp("premiumGuildSince", null);
            }

            if (!realUser.__cp_isClone) {
                setProp("_realPremiumType", realUser.premiumType, false);
                setProp("_realPremiumSince", realUser.premiumSince, false);
                setProp("_realPremiumGuildSince", realUser.premiumGuildSince, false);
            }

            if (user.id) {
                if (_fakeUserCache.size > 250) _fakeUserCache.clear();
                _fakeUserCache.set(user.id, { v: _dataVersion, src: user, fake: clone });
            }
            return clone;
        } catch {
            return user;
        } finally {
            _fakeUserBuilding.delete(user);
        }
    },

    hookUserProfile(profile: any, userId: string) {
        if (!profile || !userId) return profile;
        const pd = getProfileDataFor(userId);
        if (!pd) return profile;

        try {
            const merged: any = {};

            if (pd?.bio) merged.bio = pd.bio;
            if (pd?.pronouns) merged.pronouns = pd.pronouns;
            if (pd?.accentColor != null) merged.accentColor = pd.accentColor;
            if (pd?.banner) {
                if (typeof pd.banner === "string" && !pd.banner.startsWith("http"))
                    merged.banner = pd.banner;
                merged.premiumType = 2;
            }

            if (pd?.decorationAsset) {
                const decoData = {
                    asset: pd.decorationAsset,
                    skuId: pd.decorationAsset
                };
                merged.avatarDecoration = decoData;
                merged.avatarDecorationData = decoData;
            }

            if (pd?.profileEffectId) {
                merged.profileEffectId = pd.profileEffectId;
                merged.profileEffect = { expireAt: null, skuId: pd.profileEffectId };
                if (!merged.premiumType) merged.premiumType = 2;
            }

            // Discord looks the frame up in its shop by this skuId
            if (pd?.profileFrameId) {
                merged.profileFrame = { expiresAt: null, skuId: pd.profileFrameId };
                if (!merged.premiumType) merged.premiumType = 2;
            }

            const spoofNitro = wantsNitroLook(pd);
            if (spoofNitro) {
                merged.premiumType = 2;

                if (pd.accentColor != null) {
                    const c2 = pd.accentColor2 ?? pd.accentColor;
                    merged.themeColors = [pd.accentColor, c2];
                }
                merged.premiumSince = nitroSinceDate(pd);

                const bm = pd.boostMonths ?? -1;
                if (bm >= 0) {
                    const BOOST_M = [1, 2, 3, 6, 9, 12, 15, 18, 24];
                    const boostSince = new Date();
                    boostSince.setMonth(boostSince.getMonth() - (BOOST_M[bm] ?? 1));
                    merged.premiumGuildSince = boostSince;
                } else {
                    merged.premiumGuildSince = null;
                }

                merged.publicFlags = profile.publicFlags;
                if (hasCustomBadgesConfigured(pd)) {
                    merged.badges = [];
                }
            } else if (pd.nitro === false) {
                merged.premiumType = profile.premiumType ?? null;
                merged.premiumSince = profile.premiumSince ?? null;
                merged.premiumGuildSince = profile.premiumGuildSince ?? null;
                if (hasCustomBadgesConfigured(pd)) {
                    merged.badges = [];
                }
            } else {
                if (profile.premiumType) merged.premiumType = profile.premiumType;
                if (profile.premiumSince) merged.premiumSince = profile.premiumSince;
                if (profile.premiumGuildSince) merged.premiumGuildSince = profile.premiumGuildSince;
            }

            const hasCustomBadges = hasCustomBadgesConfigured(pd) ||
                (BadgeAPIPlugin?.DonorBadges?.[userId] && BadgeAPIPlugin.DonorBadges[userId].length > 0);

            if (hasCustomBadges) {
                merged.badges = [];
                if (pd?.badgeFlags != null && pd.badgeFlags > 0) {
                    merged.publicFlags = pd.badgeFlags;
                }
            }

            return safeRecordMerge(profile, merged, `cp:${userId}:${_dataVersion}`);
        } catch {
            return profile;
        }
    },

    fakeObfuscatedEmail(real: string | null) {
        if (!isEnabled || !storedData.email || !real) return real;
        const fake = storedData.email;
        const atIdx = fake.indexOf("@");
        if (atIdx <= 1) return fake;
        return `${fake[0]}***${fake.slice(atIdx - 1)}`;
    },

    fakeObfuscatedPhone(real: string | null) {
        if (!isEnabled || !storedData.phone || !real) return real;
        const fake = storedData.phone;
        if (fake.length < 4) return fake;
        return `***-***-${fake.slice(-4)}`;
    },

    patchBannerUrl({ displayProfile }: any) {
        try {
            const uid = displayProfile?.userId;
            if (uid) {
                const pd = getProfileDataFor(uid);
                if (pd && pd.banner) return pd.banner;
            }
        } catch { }
        return null;
    },

    profileEffectHook(userId: string, original: any) {
        try {
            if (!original || !userId) return original;
            const pd = getProfileDataFor(userId);
            if (!pd || !pd.profileEffectId) return original;
            return safeRecordMerge(original, {
                profileEffectId: pd.profileEffectId,
                profileEffect: {
                    expireAt: null,
                    skuId: pd.profileEffectId,
                },
                premiumType: original.premiumType ?? 2
            }, `cpe:${userId}:${_dataVersion}`);
        } catch {
            return original;
        }
    },

    premiumTypeHook({ userId }: any) {
        try {
            const pd = getProfileDataFor(userId);
            if (pd && (pd.profileEffectId || pd.nitro)) return 2;
        } catch {}
        return undefined;
    },

    toolboxActions: {
        [t("Open Custom Profile")]() { openModal(props => <CustomProfileModal rootProps={props} />); },
    },

    _origGetUserAvatarURL: null as any,
    _origExtractTimestamp: null as any,
    _forceNative: false,

    async start() {
        for (const [uid, data] of Object.entries(allAccountsData)) {
            applyLocalProfileCache(uid, data, !!allAccountsEnabled[uid]);
        }

        startBadgeManagement();
        addHeaderBarButton("custom-profile-btn", () => <CustomProfileButton />, 10);

        FluxDispatcher.subscribe("CONNECTION_OPEN", onAccountSwitch);
        startSharing(onSharedProfilesChanged, { read: settings.store.showOthers, mine: currentSharable }).catch(() => { });

        // What follows runs on every user, name and avatar Discord draws. Without a custom profile it would only
        // pass them through, so it's put in once there is one (see ensureHooks)
        _hooksPlugin = this;
        ensureHooks();

        loadData().then(() => {
            updateCachedRealData();
            ensureHooks();
            if (isEnabled) {
                forceAccountPanelRerender();
            }
            removeHideStyle();
        });
    },

    /** Called once, by ensureHooks, when there's a custom profile to show */
    installHooks() {
        applyAvatarPatchEarly();

        try {
            // Same object as findByProps("getCurrentUser", "getUser"), without scanning every module at startup
            const US = UserStore as any;
            if (US && !US._cp_perfect_hook) {
                const origCurrent = US.getCurrentUser.bind(US);
                _origGetCurrentUser = origCurrent;

                let _lastRealUser: any = null;
                let _lastFakeResult: any = null;
                let _lastCacheVersion = -1;
                let _buildingCurrent = false;

                US.getCurrentUser = () => {
                    const raw = origCurrent();
                    if (!raw) return raw;
                    const realUser = raw.__cp_isClone ? (raw.__cp_origUser || raw) : raw;
                    if (_buildingCurrent) return _lastFakeResult || realUser;
                    if (realUser === _lastRealUser && _lastCacheVersion === _dataVersion && _lastFakeResult) {
                        return _lastFakeResult;
                    }
                    _buildingCurrent = true;
                    try {
                        if (realUser.username) _realUsername = realUser.username;
                        if (realUser.globalName) _realGlobalName = realUser.globalName;
                        _lastRealUser = realUser;
                        _lastCacheVersion = _dataVersion;
                        _lastFakeResult = this.fakeCurrentUser(realUser, true);
                        return userIfStaffWorks(_lastFakeResult, realUser);
                    } finally {
                        _buildingCurrent = false;
                    }
                };

                const origGet = US.getUser.bind(US);
                US.getUser = (id: string) => {
                    const orig = origGet(id);
                    if (!orig) return orig;
                    const myId = AuthenticationStore?.getId?.();
                    const isMe = !!(myId && id === myId);
                    const pd = getProfileDataFor(id);
                    if (!pd) return orig;
                    const hit = _fakeUserCache.get(id);
                    if (hit && hit.v === _dataVersion && hit.src === orig) return userIfStaffWorks(hit.fake, orig);
                    if (_fakeUserCache.size > 250) _fakeUserCache.clear();
                    const fake = this.fakeCurrentUser(orig, isMe);
                    _fakeUserCache.set(id, { v: _dataVersion, src: orig, fake });
                    return userIfStaffWorks(fake, orig);
                };

                US._cp_perfect_hook = true;
            }
        } catch { }

        try {
            const UU = (Endcord as any).Webpack?.findByProps?.("useName", "getGlobalName");
            if (UU && !UU._cp_name_hook) {
                if (UU.getName) {
                    const orig = UU.getName.bind(UU);
                    UU.getName = (user: any) => {
                        if (user?.id) {
                            const myId = AuthenticationStore?.getId?.();
                            const isMe = !!(myId && user.id === myId);
                            const pd = getProfileDataFor(user.id);
                            if (isMe && pd?.globalName) return pd.globalName;
                            if (pd?.username && !user.globalName) return pd.username;
                        }
                        return orig(user);
                    };
                }
                if (UU.getGlobalName) {
                    const orig = UU.getGlobalName.bind(UU);
                    UU.getGlobalName = (user: any) => {
                        if (user?.id) {
                            const myId = AuthenticationStore?.getId?.();
                            const isMe = !!(myId && user.id === myId);
                            const pd = getProfileDataFor(user.id);
                            if (isMe && pd?.globalName) return pd.globalName;
                        }
                        return orig(user);
                    };
                }
                if (UU.getUserTag) {
                    const orig = UU.getUserTag.bind(UU);
                    UU.getUserTag = (user: any, ...rest: any[]) => {
                        if (user?.id) {
                            const pd = getProfileDataFor(user.id);
                            if (pd && pd.username) {
                                return pd.username;
                            }
                        }
                        return orig(user, ...rest);
                    };
                }
                if (UU.useName) {
                    const orig = UU.useName.bind(UU);
                    UU.useName = (user: any) => {
                        if (user?.id) {
                            const myId = AuthenticationStore?.getId?.();
                            const isMe = !!(myId && user.id === myId);
                            const pd = getProfileDataFor(user.id);
                            if (isMe && pd?.globalName) return pd.globalName;
                            if (pd?.username && !user.globalName) return pd.username;
                        }
                        return orig(user);
                    };
                }
                UU._cp_name_hook = true;
            }
        } catch { }

        try {
            // Same object as findByProps("getUserProfile", "getGuildMemberProfile")
            const UPS = UserProfileStore as any;
            if (UPS && !UPS._cp_profile_hook) {
                const origGetProfile = UPS.getUserProfile.bind(UPS);
                UPS.getUserProfile = (userId: string) => {
                    try {
                        const profile = origGetProfile(userId);
                        if (!userId || !profile) return profile;
                        const pd = getProfileDataFor(userId);
                        if (!pd) return profile;
                        return this.hookUserProfile(profile, userId);
                    } catch (e) {
                        console.error("[CustomProfile] Error in getUserProfile hook:", e);
                        return origGetProfile(userId);
                    }
                };
                const origGetGuild = UPS.getGuildMemberProfile.bind(UPS);
                UPS.getGuildMemberProfile = (userId: string, guildId: string) => {
                    try {
                        const profile = origGetGuild(userId, guildId);
                        if (!userId || !profile) return profile;
                        const pd = getProfileDataFor(userId);
                        if (!pd) return profile;
                        return this.hookUserProfile(profile, userId);
                    } catch (e) {
                        console.error("[CustomProfile] Error in getGuildMemberProfile hook:", e);
                        return origGetGuild(userId, guildId);
                    }
                };
                UPS._cp_profile_hook = true;
            }
        } catch { }

        try {
            const WP = (Endcord as any).Webpack;
            const MAS = WP?.findByProps?.("getUsers", "getValidUsers", "getHasLoggedInAccounts");
            if (MAS && !MAS._cp_perfect_hook) {
                const plugin = this;
                function patchAccountUser(u: any) {
                    if (!u?.id || u.__cp_isClone) return u;
                    const acctData = allAccountsData[u.id];
                    const acctEnabled = allAccountsEnabled[u.id];
                    if (!acctData || !acctEnabled) return u;
                    return plugin.fakeCurrentUser(u, true);
                }

                if (MAS.getUsers) {
                    const origGetUsers = MAS.getUsers.bind(MAS);
                    let lastRawUsers: any = null;
                    let lastPatchedUsers: any = null;
                    let lastUsersVer = -1;
                    MAS.getUsers = () => {
                        const users = origGetUsers();
                        if (!users || !Array.isArray(users)) return users;
                        if (users === lastRawUsers && lastUsersVer === _dataVersion && lastPatchedUsers) {
                            return lastPatchedUsers;
                        }
                        lastRawUsers = users;
                        lastUsersVer = _dataVersion;
                        lastPatchedUsers = users.map(patchAccountUser);
                        return lastPatchedUsers;
                    };
                }

                if (MAS.getValidUsers) {
                    const origGetValid = MAS.getValidUsers.bind(MAS);
                    let lastRawValid: any = null;
                    let lastPatchedValid: any = null;
                    let lastValidVer = -1;
                    MAS.getValidUsers = () => {
                        const users = origGetValid();
                        if (!users || !Array.isArray(users)) return users;
                        if (users === lastRawValid && lastValidVer === _dataVersion && lastPatchedValid) {
                            return lastPatchedValid;
                        }
                        lastRawValid = users;
                        lastValidVer = _dataVersion;
                        lastPatchedValid = users.map(patchAccountUser);
                        return lastPatchedValid;
                    };
                }

                MAS._cp_perfect_hook = true;
                try { MAS.emitChange?.(); } catch { }
            }
        } catch { }

        try {
            if (SnowflakeUtils?.extractTimestamp && !this._origExtractTimestamp) {
                this._origExtractTimestamp = SnowflakeUtils.extractTimestamp;
                const origExtract = this._origExtractTimestamp;
                (SnowflakeUtils as any).extractTimestamp = (snowflake: string) => {
                    if (isEnabled && storedData.createdAt && isMe(snowflake)) {
                        return new Date(`${storedData.createdAt}T12:00:00Z`).getTime();
                    }
                    return origExtract(snowflake);
                };
            }
        } catch { }

        try {
            const decoMod = (Endcord as any).Webpack?.findByProps?.("getAvatarDecorationURL");
            if (decoMod?.getAvatarDecorationURL && !decoMod._cp_deco_hook) {
                const origDeco = decoMod.getAvatarDecorationURL.bind(decoMod);
                decoMod.getAvatarDecorationURL = (opts: any) => {
                    try {
                        const { userId } = opts ?? {};
                        if (userId) {
                            const pd = getProfileDataFor(userId);
                            if (pd && pd.decorationAsset) {
                                return getDecorationUrl(pd.decorationAsset, typeof pd.decorationAsset === "string" && pd.decorationAsset.startsWith("a_"));
                            }
                        }
                    } catch { }
                    return origDeco(opts);
                };
                decoMod._cp_deco_hook = true;
            }
        } catch { }

        if (IconUtils?.getUserAvatarURL && !_avatarPatchApplied) {
            this._origGetUserAvatarURL = IconUtils.getUserAvatarURL;
            const orig = this._origGetUserAvatarURL;
            (IconUtils as any).getUserAvatarURL = (user: any, ...args: any[]) => {
                const uid = user?.id ?? user?.userId;
                if (uid) {
                    const pd = getProfileDataFor(uid);
                    if (pd && pd.avatar) return pd.avatar;
                }
                return orig(user, ...args);
            };
            _avatarPatchApplied = true;
        }
    },

    stop() {
        _hooksPlugin = null;
        stopBadgeManagement();
        removeHeaderBarButton("custom-profile-btn");
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", onAccountSwitch);
        stopSharing();
        stopDomObserver();
        removeHideStyle();
        if (this._origExtractTimestamp && SnowflakeUtils) {
            (SnowflakeUtils as any).extractTimestamp = this._origExtractTimestamp;
            this._origExtractTimestamp = null;
        }
        if (this._origGetUserAvatarURL && IconUtils) {
            (IconUtils as any).getUserAvatarURL = this._origGetUserAvatarURL;
            this._origGetUserAvatarURL = null;
        }
    },

    settingsAboutComponent() {
        const { t } = useI18n();
        return <Button onClick={() => openModal(props => <CustomProfileModal rootProps={props} />)}>{t("Open Custom Profile")}</Button>;
    },
});
