/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Lets CustomProfile badges take part in Discord's "Customize your badges" panel, so they can be
// reordered and hidden like real ones.
//
// Discord keys every badge by a numeric id from its badge-type enum and maps profile badge ids to it
// with `enum[id.toUpperCase()]`. Registering our badges in that enum, and adding them to the badge
// catalog of the current user, is enough for the panel to list, reorder and hide them. Discord's
// servers know nothing about these ids, so they are stripped from the save request and the layout
// is kept locally instead.

import { BadgeListProcessors } from "@api/Badges";
import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";
import { findByCodeLazy, findByPropsLazy, findStoreLazy } from "@webpack";
import { AuthenticationStore, RestAPI } from "@webpack/common";

const logger = new Logger("CustomProfile");

export interface ManagedBadge {
    /** Stable key, lowercase letters, digits and underscores */
    key: string;
    label: string;
    icon: string;
}

interface BadgeLayout {
    /** Full display order of badge type ids, Discord's and ours, as last saved */
    order?: number[];
    /** Our badges that were hidden */
    hidden?: number[];
}

const DS_LAYOUT = "customProfile_badgeLayout";
const PROFILE_ID_PREFIX = "ec_cp_";

// Discord's badge type ids are small (1..22). Ours start far above and are derived from the key,
// so a saved layout keeps working when badges are added or removed.
const ID_BASE = 90000;
const ID_SPAN = 9000;
const idCache = new Map<string, number>();
export function badgeTypeId(key: string) {
    let id = idCache.get(key);
    if (id == null) {
        let h = 0;
        for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
        id = ID_BASE + h % ID_SPAN;
        idCache.set(key, id);
    }
    return id;
}
const isOurId = (id: unknown): id is number => typeof id === "number" && id >= ID_BASE && id < ID_BASE + ID_SPAN;
export const profileBadgeId = (key: string) => PROFILE_ID_PREFIX + key;

const BadgeTypes = findByPropsLazy("PREMIUM_TENURE", "GAME_VARIETY", "ACCOUNT_AGE") as Record<string | number, string | number>;
const BadgeDirectoryStore = findStoreLazy("BadgeDirectoryStore") as any;
// profile badge id ("premium_tenure_12_month_v2") -> badge type id, Discord's own mapping
const profileIdToTypeId = findByCodeLazy('"number"==typeof', ".toUpperCase()]") as (id: string) => number | undefined;

let active: ManagedBadge[] = [];
let layout: BadgeLayout = {};
let layoutsByUser: Record<string, BadgeLayout> = {};

const entryCache = new Map<string, any>();

function currentUserId() {
    return AuthenticationStore.getId() as string | undefined;
}

function emitCatalogChange() {
    try { BadgeDirectoryStore.emitChange(); } catch { }
}

/** Called by CustomProfile whenever the user's custom badges change */
export function setManagedBadges(badges: ManagedBadge[]) {
    active = badges;
    for (const b of badges) {
        const id = badgeTypeId(b.key);
        const name = (PROFILE_ID_PREFIX + b.key).toUpperCase();
        try {
            BadgeTypes[id] = name;
            BadgeTypes[name] = id;
        } catch { }
    }
    emitCatalogChange();
}

// A catalog entry looks like one of Discord's own: owned, untiered, with a single icon.
// Entries are cached so selectors that compare arrays item by item stay stable.
function catalogEntry(b: ManagedBadge, hidden: boolean) {
    const cacheKey = `${b.key}\0${hidden}\0${b.label}\0${b.icon}`;
    let entry = entryCache.get(cacheKey);
    if (!entry) {
        entry = {
            badge_id: badgeTypeId(b.key),
            owned: true,
            hidden,
            name: b.label,
            description: b.label,
            simple_icon_url: b.icon,
            simple_icon_raster_url: b.icon,
            complex_icon_static_url: b.icon,
            tiers: [],
            current_tier: null,
            next_tier: null,
            requirements: [],
            progress: [],
            tier_obtained_at: {},
            obtained_at: null
        };
        entryCache.set(cacheKey, entry);
    }
    return entry;
}

function sortByLayout<T>(items: T[], typeIdOf: (item: T) => number | undefined) {
    const { order } = layout;
    if (!order?.length) return items;
    const rank = new Map(order.map((id, i) => [id, i]));
    // Keep items that are not in the saved order where they are, ordered ones fill the remaining slots
    const ordered = items.filter(it => rank.has(typeIdOf(it)!)).sort((a, b) => rank.get(typeIdOf(a)!)! - rank.get(typeIdOf(b)!)!);
    let next = 0;
    return items.map(it => rank.has(typeIdOf(it)!) ? ordered[next++] : it);
}

// ---- catalog: what the "Customize your badges" panel lists ----
let origGetBadges: ((userId?: string) => any[]) | undefined;
let origGetBadgeById: ((id: number, userId?: string) => any) | undefined;

// While custom badges are set they replace the account's own badges, in the panel as on the profile.
// Without custom badges (or after a reset) the account's badges are left exactly as Discord has them.
function wrappedGetBadges(this: any, userId?: string) {
    const real = origGetBadges!.call(this, userId);
    const me = currentUserId();
    if (!active.length || (userId ?? me) !== me || !real.length) return real;
    const hidden = new Set(layout.hidden ?? []);
    return sortByLayout(active.map(b => catalogEntry(b, hidden.has(badgeTypeId(b.key)))), e => e.badge_id);
}

function wrappedGetBadgeById(this: any, id: number, userId?: string) {
    if (isOurId(id) && (userId ?? currentUserId()) === currentUserId()) {
        const b = active.find(x => badgeTypeId(x.key) === id);
        if (b) return catalogEntry(b, layout.hidden?.includes(id) ?? false);
    }
    return origGetBadgeById!.call(this, id, userId);
}

// ---- saving: keep our ids out of the request, remember them locally ----
const origRest: Record<string, (...args: any[]) => any> = {};

function stripOurIds(body: any): boolean {
    if (!body || typeof body !== "object") return false;
    let found = false;
    for (const [field, value] of Object.entries(body)) {
        if (Array.isArray(value) && value.some(isOurId)) {
            found = true;
            if (/hid/i.test(field)) layout.hidden = value.filter(isOurId);
            else layout.order = [...value];
            const rest = value.filter(v => !isOurId(v));
            // A list of only our badges says nothing about the real ones: leave the server's value alone
            if (rest.length) body[field] = rest;
            else delete body[field];
        } else if (value && typeof value === "object" && !Array.isArray(value)) {
            found = stripOurIds(value) || found;
        }
    }
    return found;
}

function wrapRest(method: string) {
    const orig = origRest[method] = RestAPI[method];
    RestAPI[method] = function (this: any, req: any, ...rest: any[]) {
        try {
            const me = currentUserId();
            if (me && req && typeof req === "object" && req.body && stripOurIds(req.body)) {
                layoutsByUser[me] = layout;
                DataStore.set(DS_LAYOUT, layoutsByUser).catch(() => { });
                emitCatalogChange();
                // Nothing left for Discord: answer like a successful save without a request
                if (/badge/i.test(String(req.url)) && !Object.keys(req.body).length)
                    return Promise.resolve({ ok: true, status: 200, body: {}, headers: {} });
            }
        } catch (e) {
            logger.error("Failed to filter badge layout", e);
        }
        return orig.call(this, req, ...rest);
    };
}

// ---- profile: apply the saved layout to the shown badges ----
function profileTypeId(badge: any): number | undefined {
    const id = badge?.id;
    if (typeof id !== "string") return undefined;
    if (id.startsWith(PROFILE_ID_PREFIX)) return badgeTypeId(id.slice(PROFILE_ID_PREFIX.length));
    try { return profileIdToTypeId(id); } catch { return undefined; }
}

function applyLayout(profile: { userId: string; }, badges: any[]) {
    if (!active.length || profile.userId !== currentUserId()) return badges;
    const hidden = new Set(layout.hidden ?? []);
    // Drop the account's own Discord badges and the hidden custom ones; badges added by other plugins stay
    const shown = badges.filter(b => {
        const typeId = profileTypeId(b);
        if (typeId == null) return true;
        return isOurId(typeId) && !hidden.has(typeId);
    });
    return sortByLayout(shown, profileTypeId);
}

/** Call after switching accounts so the right layout is used */
export function reloadBadgeLayout() {
    layout = layoutsByUser[currentUserId() ?? ""] ??= {};
    emitCatalogChange();
}

export async function startBadgeManagement() {
    try {
        layoutsByUser = await DataStore.get(DS_LAYOUT) ?? {};
        layout = layoutsByUser[currentUserId() ?? ""] ??= {};

        origGetBadges = BadgeDirectoryStore.getBadges;
        origGetBadgeById = BadgeDirectoryStore.getBadgeById;
        BadgeDirectoryStore.getBadges = wrappedGetBadges;
        BadgeDirectoryStore.getBadgeById = wrappedGetBadgeById;

        for (const m of ["patch", "put", "post"]) wrapRest(m);
        BadgeListProcessors.add(applyLayout);
        emitCatalogChange();
    } catch (e) {
        logger.error("Badge management unavailable", e);
    }
}

export function stopBadgeManagement() {
    BadgeListProcessors.delete(applyLayout);
    for (const [m, fn] of Object.entries(origRest)) RestAPI[m] = fn;
    if (origGetBadges) BadgeDirectoryStore.getBadges = origGetBadges;
    if (origGetBadgeById) BadgeDirectoryStore.getBadgeById = origGetBadgeById;
    origGetBadges = origGetBadgeById = undefined;
    active = [];
    emitCatalogChange();
}
