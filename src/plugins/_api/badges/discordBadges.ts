/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// What Discord itself knows about each of its badges, so a badge reads the same in Endcord as in Discord's own
// badge pages. Three sources, best first:
//  1. Discord's badge catalog for that profile (GET /users/{id}/badges): the badge's real name, rarity, tier,
//     unlock date and its line such as "A spoonful of knowledge". Rarity changes over time, so nothing beats it.
//  2. What earlier catalogs taught us, kept between restarts, so a badge seen once keeps its real data.
//  3. What ships in Discord's client (Nitro levels and their rarity, its wording) and, last, a short table built
//     from Discord's support articles. That table only gives a rarity where Discord has published or shown one.

import { BadgeRarity } from "@api/Badges";
import * as DataStore from "@api/DataStore";
import { BadgeDateFormat, Settings } from "@api/Settings";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import { filters, findByCodeLazy, findByPropsLazy, findStoreLazy, mapMangledModuleLazy } from "@webpack";
import { AccessibilityStore, FluxDispatcher, i18n, NavigationRouter, RestAPI, SettingsRouter, UserProfileStore, UserStore } from "@webpack/common";

const logger = new Logger("BadgeAPI");

/** Discord's own numbers for its badge types, as its catalog uses them */
export const enum DiscordBadgeType {
    PREMIUM_TENURE = 1,
    PARTNER = 2,
    CERTIFIED_MODERATOR = 3,
    HYPESQUAD = 4,
    HYPESQUAD_HOUSE_1 = 5,
    HYPESQUAD_HOUSE_2 = 6,
    HYPESQUAD_HOUSE_3 = 7,
    BUG_HUNTER_LEVEL_1 = 8,
    BUG_HUNTER_LEVEL_2 = 9,
    VERIFIED_DEVELOPER = 10,
    EARLY_SUPPORTER = 11,
    GUILD_BOOSTER = 12,
    LEGACY_USERNAME = 13,
    QUEST_COMPLETED = 14,
    APRIL_FOOLS_2026 = 15,
    ORB_PROFILE = 16,
    GIFTING = 17,
    ACCOUNT_AGE = 18,
    STREAMING = 19,
    GAME_TIME = 20,
    GAME_VARIETY = 21,
    STAFF = 22
}

/** Says which Discord badge an added badge stands for, so it gets that badge's real data */
export interface DiscordBadgeRef {
    type: DiscordBadgeType;
    /** Months for Nitro, otherwise the level's position, counting from 0 */
    tier?: number;
    /** Shown when Discord's catalog hasn't named the level yet */
    tierName?: string;
    /** Every level of the badge, for its page when Discord's catalog hasn't listed them yet. Nitro's are built in */
    tiers?: { label: string; icon: string; }[];
}

// Discord's profile badge ids, from its own table. Newer ones follow its enum
const PROFILE_IDS: Record<string, DiscordBadgeType> = {
    staff: DiscordBadgeType.STAFF,
    staff_hidden: DiscordBadgeType.STAFF,
    staff_personal: DiscordBadgeType.STAFF,
    premium: DiscordBadgeType.PREMIUM_TENURE,
    partner: DiscordBadgeType.PARTNER,
    certified_moderator: DiscordBadgeType.CERTIFIED_MODERATOR,
    hypesquad: DiscordBadgeType.HYPESQUAD,
    hypesquad_house_1: DiscordBadgeType.HYPESQUAD_HOUSE_1,
    hypesquad_house_2: DiscordBadgeType.HYPESQUAD_HOUSE_2,
    hypesquad_house_3: DiscordBadgeType.HYPESQUAD_HOUSE_3,
    bug_hunter_level_1: DiscordBadgeType.BUG_HUNTER_LEVEL_1,
    bug_hunter_level_2: DiscordBadgeType.BUG_HUNTER_LEVEL_2,
    verified_developer: DiscordBadgeType.VERIFIED_DEVELOPER,
    early_supporter: DiscordBadgeType.EARLY_SUPPORTER,
    legacy_username: DiscordBadgeType.LEGACY_USERNAME,
    quest_completed: DiscordBadgeType.QUEST_COMPLETED,
    april_fools_2026: DiscordBadgeType.APRIL_FOOLS_2026,
    orb_profile_badge: DiscordBadgeType.ORB_PROFILE
};

// Discord treats these as legacy: once given, never again. Staff is the exception it makes in its own page
const LEGACY_TYPES = new Set<number>([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 22]);
// The profile badges whose description is a sentence about the person ("Subscriber since …") rather than the name
const SENTENCE_TYPES = new Set<number>([1, 12, 13, 15]);
// Discord marks these as still in beta
const BETA_TYPES = new Set<number>([18, 19, 20, 21]);

export const TENURE_MONTHS = [1, 3, 6, 12, 24, 36, 60, 72];

// Discord's own table, with each Nitro level's rarity. The copy below stands in if it moves
const TenureBadges = findByPropsLazy("premium_tenure_72_month_v2", "premium_tenure_1_month_v2");
const TENURE_FALLBACK: Record<number, [name: string, nitroName: string, rarity: BadgeRarity]> = {
    1: ["Bronze", "Nitro Bronze", BadgeRarity.COMMON],
    3: ["Silver", "Nitro Silver", BadgeRarity.COMMON],
    6: ["Gold", "Nitro Gold", BadgeRarity.RARE],
    12: ["Platinum", "Nitro Platinum", BadgeRarity.RARE],
    24: ["Diamond", "Nitro Diamond", BadgeRarity.EPIC],
    36: ["Emerald", "Nitro Emerald", BadgeRarity.EPIC],
    60: ["Ruby", "Nitro Ruby", BadgeRarity.MYTHIC],
    72: ["Opal", "Nitro Opal", BadgeRarity.MYTHIC]
};
// The large art Discord puts in a Nitro badge's hover card
const TenureArt = mapMangledModuleLazy('ambientLarge:"https://cdn.discordapp.com/', {
    get: filters.byCode(/^function \i\(\i\)\{return \i\[\i\]\}$/)
});

const BadgeDirectoryStore = findStoreLazy("BadgeDirectoryStore");
// Discord's own mapping from a profile badge id to its type
const typeOfProfileId = findByCodeLazy('"number"==typeof', ".toUpperCase()]") as (id: string) => number | undefined;
const BadgeDirectory = findByPropsLazy("openBadgeDirectoryModal");
// Discord's names for its settings pages, which its Manage Boosts button opens
const SettingsSections = findByPropsLazy("PREMIUM_GUILD_SUBSCRIPTIONS_PANEL");

/** discordString as plain text, for a sentence with a name in it */
export function discordPlainString(hash: string, fallback: string, values: Record<string, unknown>): string {
    try {
        const message = i18n.t[hash];
        if (message) return i18n.intl.formatToPlainString(message, values);
    } catch { }
    return fallback;
}

/** One of Discord's own strings, in the language Discord is set to. Ours stands in if Discord renamed it */
export function discordString(hash: string, fallback: string, values?: Record<string, any>): any {
    try {
        const message = i18n.t[hash];
        if (message) return values ? i18n.intl.format(message, values) : i18n.intl.string(message);
    } catch { }
    return fallback;
}

interface KnownBadge {
    name: string;
    description: string;
    rarity?: BadgeRarity;
    /** Its line in Discord's badge page, where one has been seen */
    infoLabel?: string;
    earnable?: boolean;
    tierNames?: string[];
}

// The fallback, from Discord's support articles (Profile Badges: What Each Badge Means). Rarity only where Discord
// published one (Staff mythic, Bug Hunter rare, the everyday badges common) or showed one (Golden Bug Hunter)
function known(type: number): KnownBadge | undefined {
    switch (type) {
        case DiscordBadgeType.STAFF: return { name: t("Discord Staff"), description: t("Unlocked by working at Discord."), rarity: BadgeRarity.MYTHIC };
        case DiscordBadgeType.PARTNER: return { name: t("Partnered Server Owner"), description: t("Unlocked by owning a server in the Discord Partner Program.") };
        case DiscordBadgeType.CERTIFIED_MODERATOR: return { name: t("Moderator Programs Alumni"), description: t("Unlocked by taking part in Discord's moderator programs before December 2022.") };
        case DiscordBadgeType.HYPESQUAD: return { name: t("HypeSquad Events"), description: t("Unlocked by running events for HypeSquad.") };
        case DiscordBadgeType.HYPESQUAD_HOUSE_1: return { name: t("HypeSquad Bravery"), description: t("Unlocked by joining House Bravery in the HypeSquad quiz.") };
        case DiscordBadgeType.HYPESQUAD_HOUSE_2: return { name: t("HypeSquad Brilliance"), description: t("Unlocked by joining House Brilliance in the HypeSquad quiz.") };
        case DiscordBadgeType.HYPESQUAD_HOUSE_3: return { name: t("HypeSquad Balance"), description: t("Unlocked by joining House Balance in the HypeSquad quiz.") };
        case DiscordBadgeType.BUG_HUNTER_LEVEL_1: return { name: t("Bug Hunter"), description: t("Unlocked by hunting bugs in the Discord Testers community."), rarity: BadgeRarity.RARE };
        case DiscordBadgeType.BUG_HUNTER_LEVEL_2: return { name: t("Golden Bug Hunter"), description: t("Unlocked by being an acclaimed Discord bug hunter."), rarity: BadgeRarity.MYTHIC, infoLabel: t("A spoonful of knowledge") };
        case DiscordBadgeType.VERIFIED_DEVELOPER: return { name: t("Early Verified Bot Developer"), description: t("Unlocked by verifying a bot before August 2020.") };
        case DiscordBadgeType.EARLY_SUPPORTER: return { name: t("Early Supporter"), description: t("Unlocked by subscribing to Nitro before October 10, 2018.") };
        case DiscordBadgeType.GUILD_BOOSTER: return { name: t("Server Booster"), description: t("Keep boosting to level up this badge."), rarity: BadgeRarity.COMMON, earnable: true, tierNames: ["1 Month", "2 Months", "3 Months", "6 Months", "9 Months", "12 Months", "15 Months", "18 Months", "24 Months"].map(n => t(n)) };
        case DiscordBadgeType.LEGACY_USERNAME: return { name: t("Legacy Username"), description: t("Unlocked by keeping your old username and discriminator."), rarity: BadgeRarity.COMMON };
        case DiscordBadgeType.QUEST_COMPLETED: return { name: t("Quests"), description: t("Unlocked by completing a Quest."), rarity: BadgeRarity.COMMON, earnable: true };
        case DiscordBadgeType.APRIL_FOOLS_2026: return { name: "Last Meadow Online", description: t("Unlocked by playing Last Meadow Online from April 1 to April 7, 2026.") };
        case DiscordBadgeType.ORB_PROFILE: return { name: t("Orbs"), description: t("Unlocked by buying it in the Orbs shop."), rarity: BadgeRarity.COMMON, earnable: true };
        case DiscordBadgeType.GIFTING: return { name: t("Gifting"), description: discordString("PECB/R", "Earn this badge by gifting Nitro to friends."), earnable: true, tierNames: ["Patron", "Champion", "Luminary", "Icon", "Hero", "Legend"] };
        case DiscordBadgeType.ACCOUNT_AGE: return { name: t("Account Age"), description: t("Unlocked once your account is a year old. It levels up as your account gets older."), earnable: true };
        case DiscordBadgeType.STREAMING: return { name: t("Streaming"), description: t("Unlocked by sharing your screen with others. It levels up the more you stream."), earnable: true };
        case DiscordBadgeType.GAME_TIME: return { name: t("Game Time"), description: t("Unlocked by playing games Discord can detect. It levels up the more you play."), earnable: true };
        case DiscordBadgeType.GAME_VARIETY: return { name: t("Game Variety"), description: t("Unlocked by playing different games. It levels up with every new game."), earnable: true };
        case DiscordBadgeType.PREMIUM_TENURE: return { name: discordString("Ipxkog", "Nitro"), description: t("Stay subscribed to Nitro to level up this badge."), rarity: BadgeRarity.COMMON, earnable: true };
        default: return undefined;
    }
}

const badgeIcon = (hash: string) => `https://cdn.discordapp.com/badge-icons/${hash}.png`;

/** Nitro's levels in Discord's order, by months subscribed, with each level's badge */
const NITRO_LEVELS: [months: number, icon: string][] = [
    [0, badgeIcon("2ba85e8026a8614b640c2837bcdfe21b")],
    [1, badgeIcon("4f33c4a9c64ce221936bd256c356f91f")],
    [3, badgeIcon("4514fab914bdbfb4ad2fa23df76121a6")],
    [6, badgeIcon("2895086c18d5531d499862e41d1155a6")],
    [12, badgeIcon("0334688279c8359120922938dcb1d6f8")],
    [24, badgeIcon("0d61871f72bb9a33a7ae568c1fb4f20a")],
    [36, badgeIcon("11e2d339068b55d3a506cff34d3780f3")],
    [60, badgeIcon("cd5e2cfd9d7f27a8cdcd3e8a8d5dc9f4")],
    [72, badgeIcon("5b154df19c53dce2af92c9b61e6be5e2")]
];

// How long each Server Booster level takes
const BOOST_MONTHS = [1, 2, 3, 6, 9, 12, 15, 18, 24];

function nitroMilestone(months: number) {
    if (months === 0) return undefined;
    if (months % 12 === 0) return months === 12 ? t("1 year") : t("{count} years", { count: months / 12 });
    return months === 1 ? t("1 month") : t("{count} months", { count: months });
}

// ---- What earlier catalogs taught us --------------------------------------------------------------------------

interface LearnedTier {
    key: string;
    name?: string;
    rarity?: number;
    /** Large art */
    icon?: string;
    animated?: string;
    /** The small icon for grids */
    simple?: string;
    milestone?: string;
}

interface LearnedBadge {
    name?: string;
    description?: string;
    infoLabel?: string;
    rarity?: number;
    earnable?: boolean;
    icon?: string;
    animated?: string;
    simple?: string;
    tiers?: LearnedTier[];
}

const LEARNED_KEY = "BadgeAPI_discordCatalog";
let learned: Record<number, LearnedBadge> = {};
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export async function loadLearnedBadges() {
    learned = await DataStore.get(LEARNED_KEY) ?? {};
}

const iconOf = (item: any) => item?.complex_icon_static_url ?? item?.simple_icon_url ?? undefined;

/** Keeps what a catalog says about each badge in general. What one person owned, and when, stays out */
export function learnBadges(badges: unknown) {
    if (!Array.isArray(badges)) return;

    for (const badge of badges) {
        const type = badge?.badge_id;
        // Plugins such as CustomProfile put their own entries far above Discord's numbers
        if (typeof type !== "number" || type < 1 || type > 1000) continue;

        const tiers = Array.isArray(badge.tiers) && badge.tiers.length
            ? badge.tiers.map((tier: any) => ({
                key: String(tier.key),
                name: tier.name ?? undefined,
                rarity: tier.rarity ?? undefined,
                icon: iconOf(tier),
                animated: tier.complex_icon_animated_url ?? undefined,
                simple: tier.simple_icon_url ?? undefined,
                milestone: tier.milestone_text || undefined
            }))
            : undefined;

        learned[type] = {
            ...learned[type],
            name: badge.name ?? learned[type]?.name,
            description: badge.description ?? learned[type]?.description,
            // For levelled badges the line is about the person ("8 years, 1 month"), so it isn't kept
            infoLabel: tiers ? undefined : badge.info_label ?? learned[type]?.infoLabel,
            rarity: badge.rarity ?? learned[type]?.rarity,
            earnable: typeof badge.is_earnable === "boolean" ? badge.is_earnable : learned[type]?.earnable,
            icon: tiers ? learned[type]?.icon : iconOf(badge) ?? learned[type]?.icon,
            animated: tiers ? learned[type]?.animated : badge.complex_icon_animated_url ?? learned[type]?.animated,
            simple: tiers ? learned[type]?.simple : badge.simple_icon_url ?? learned[type]?.simple,
            tiers: tiers ?? learned[type]?.tiers
        };
    }

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => DataStore.set(LEARNED_KEY, learned).catch(() => { }), 2000);
}

// ---- Asking Discord for a profile's catalog -------------------------------------------------------------------

const CATALOG_RETRY = 60 * 60_000;
const askedAt = new Map<string, number>();
let catalogUnavailable = false;

function catalogEntry(type: number, userId: string) {
    try {
        return BadgeDirectoryStore.getBadgeById(type, userId);
    } catch {
        return undefined;
    }
}

/** The same request Discord's client makes when it shows a profile's badges, at most once an hour per profile */
export function requestCatalog(userId: string | undefined) {
    if (!userId || catalogUnavailable) return;

    try {
        if (BadgeDirectoryStore.hasCatalogFor(userId) && !BadgeDirectoryStore.isCatalogStaleFor(userId)) return;
    } catch { }

    const last = askedAt.get(userId) ?? 0;
    if (Date.now() - last < CATALOG_RETRY) return;
    askedAt.set(userId, Date.now());

    const isMe = userId === UserStore.getCurrentUser()?.id;
    RestAPI.get({ url: `/users/${isMe ? "@me" : userId}/badges` })
        .then(({ body }: any) => {
            // Handing it to Discord's store fills Discord's own badge pages too, and teaches us through learnBadges
            if (Array.isArray(body?.badges)) FluxDispatcher.dispatch({ type: "BADGE_DIRECTORY_FETCH_SUCCESS", userId, badges: body.badges });
        })
        .catch((e: any) => {
            // Not offered to this account: don't ask again until the next start
            if (e?.status === 403 || e?.status === 404) catalogUnavailable = true;
            else logger.debug("Couldn't read a badge catalog", e?.status);
        });
}

export function openDiscordBadgeDirectory() {
    try {
        BadgeDirectory.openBadgeDirectoryModal({ viewingCurrentUserBadges: true });
    } catch (e) {
        logger.error("Discord's badge directory isn't available", e);
    }
}

// ---- Putting it together ---------------------------------------------------------------------------------------

export interface BadgeLevel {
    name: string;
    icon?: string;
    milestone?: string;
    owned: boolean;
}

export interface BadgeAction {
    text: string;
    /** Discord's own look for the button: the Nitro gradient, its brand colour or the quiet one */
    variant: "expressive" | "primary" | "secondary";
    onClick(): void;
}

export interface DiscordBadgeView {
    type: DiscordBadgeType;
    /** The badge's own name, without its level */
    name: string;
    title: string;
    /** The badge's name above a level's name, as Discord does */
    eyebrow?: string;
    /** The line under the title on hover */
    body?: string;
    rarity?: BadgeRarity;
    image?: string;
    /** The moving version of the art, unless motion is reduced */
    animated?: string;
    /** The small icon Discord lists badges by */
    icon?: string;
    nitro: boolean;
    description: string;
    infoLabel?: string;
    /** The badge page's "Unlocked 6/28/24". Undefined for a legacy badge with no date, which gets one of Discord's lines */
    status?: string;
    /** Discord's "Legacy Badge" */
    legacy: boolean;
    beta: boolean;
    levels?: BadgeLevel[];
    /** Owned at its last level */
    maxed: boolean;
    obtainedAt?: Date;
}

function profileBadgeType(id: unknown): number | undefined {
    if (typeof id !== "string") return undefined;
    if (id in PROFILE_IDS) return PROFILE_IDS[id];
    if (id.startsWith("premium_tenure_")) return DiscordBadgeType.PREMIUM_TENURE;
    if (id.startsWith("guild_booster_lvl")) return DiscordBadgeType.GUILD_BOOSTER;

    try {
        const type = typeOfProfileId(id);
        return typeof type === "number" && type <= 1000 ? type : undefined;
    } catch {
        return undefined;
    }
}

function tenureMonths(badge: any): number | undefined {
    if (typeof badge.discordBadge?.tier === "number") return badge.discordBadge.tier;
    const months = /^premium_tenure_(\d+)_month/.exec(badge.id)?.[1];
    return months ? Number(months) : undefined;
}

function tenureInfo(months: number) {
    const id = `premium_tenure_${months}_month_v2`;
    const [name, nitroName, rarity] = TENURE_FALLBACK[months] ?? [];

    let own: any;
    try {
        own = TenureBadges[id];
    } catch { }

    let art: string | undefined;
    try {
        art = TenureArt.get(id)?.standard;
    } catch { }

    return {
        name: own ? i18n.intl.string(own.nameUnformatted) : name,
        nitroName: own ? i18n.intl.string(own.nameUnformattedNitro) : nitroName,
        rarity: (own?.rarity ?? rarity) as BadgeRarity | undefined,
        art
    };
}

function since(date: unknown) {
    const value = date instanceof Date ? date : typeof date === "string" || typeof date === "number" ? new Date(date) : undefined;
    return value && !Number.isNaN(value.getTime()) ? value : undefined;
}

function addMonths(date: Date | undefined, months: number) {
    if (!date) return undefined;
    const reached = new Date(date);
    reached.setMonth(reached.getMonth() + months);
    return reached.getTime() <= Date.now() ? reached : undefined;
}

// ICU's short and medium dates, which Discord's sentences use
const DATE_STYLES = {
    short: { month: "numeric", day: "numeric", year: "2-digit" },
    medium: { month: "short", day: "numeric", year: "numeric" }
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/** A date as Discord's badge cards write it in English, 6/28/24: the numbers in the language's order, with slashes */
export function formatShortDate(date: Date, format: BadgeDateFormat = Settings.badgeDateFormat) {
    const pad = (value: number) => String(value).padStart(2, "0");
    const [day, month, year] = [pad(date.getDate()), pad(date.getMonth() + 1), date.getFullYear()];

    try {
        switch (format) {
            case "dmy": return `${day}/${month}/${year}`;
            case "mdy": return `${month}/${day}/${year}`;
            case "ymd": return `${year}-${month}-${day}`;
            case "long": return new Intl.DateTimeFormat(i18n.intl?.currentLocale, { day: "numeric", month: "long", year: "numeric" }).format(date);
        }
        return new Intl.DateTimeFormat(i18n.intl?.currentLocale, DATE_STYLES.short).formatToParts(date)
            .filter(part => part.type === "day" || part.type === "month" || part.type === "year")
            .map(part => part.value)
            .join("/");
    } catch {
        return date.toLocaleDateString();
    }
}

/** One of Discord's sentences about a date, with the date written by formatShortDate. Ours stands in if it's gone */
function discordDateString(hash: string, style: keyof typeof DATE_STYLES, date: Date, fallback: (date: string) => string) {
    // Discord's own way leaves its sentence exactly as it is
    const keepDiscords = Settings.badgeDateFormat === "discord";
    let ours = formatShortDate(date);
    try {
        const message = i18n.t[hash];
        const theirs = new Intl.DateTimeFormat(i18n.intl.currentLocale, DATE_STYLES[style]).format(date);
        if (keepDiscords) ours = theirs;
        if (message) {
            const text: string = i18n.intl.formatToPlainString(message, { date });
            if (keepDiscords) return text;
            if (text.includes(theirs)) return text.replace(theirs, ours);
        }
    } catch { }
    return fallback(ours);
}

/** One of the lines Discord picks at random for a legacy badge it has no date for */
export function legacyFlavor() {
    const lines: [string, string][] = [["6zFA/T", "Very, very early"], ["wzZHKl", "iykyk"], ["+ED/nf", "Lost to time"]];
    const [hash, fallback] = lines[Math.floor(Math.random() * lines.length)];
    return discordString(hash, fallback) as string;
}

function reducedMotion() {
    try {
        return AccessibilityStore.useReducedMotion;
    } catch {
        return false;
    }
}

// ---- Levels ----------------------------------------------------------------------------------------------------

interface Level {
    key?: string;
    name?: string;
    rarity?: number;
    /** Small icon */
    icon?: string;
    /** Large art, and its moving version */
    art?: string;
    animated?: string;
    milestone?: string;
    owned?: boolean;
}

const fromCatalog = (tier: any): Level => ({
    key: String(tier.key),
    name: tier.name ?? undefined,
    rarity: tier.rarity ?? undefined,
    icon: tier.simple_icon_url ?? tier.complex_icon_static_url ?? undefined,
    art: tier.complex_icon_static_url ?? tier.simple_icon_url ?? undefined,
    animated: tier.complex_icon_animated_url ?? undefined,
    milestone: tier.milestone_text || undefined,
    owned: tier.owned === true
});

const fromLearned = (tier: LearnedTier): Level => ({
    key: tier.key,
    name: tier.name,
    rarity: tier.rarity,
    icon: tier.simple ?? tier.icon,
    art: tier.icon ?? tier.simple,
    animated: tier.animated,
    milestone: tier.milestone
});

function nitroLevels(): Level[] {
    return NITRO_LEVELS.map(([months, icon]) => {
        const info = months ? tenureInfo(months) : undefined;
        return { name: info?.name ?? t("Starter"), rarity: info?.rarity ?? BadgeRarity.COMMON, icon, art: info?.art ?? icon, milestone: nitroMilestone(months) };
    });
}

/** Nitro's level for a number of months: the last one reached */
function nitroPosition(months: number | undefined) {
    if (months == null) return -1;
    let position = -1;
    NITRO_LEVELS.forEach(([needed], index) => {
        if (months >= needed) position = index;
    });
    return position;
}

const withoutEmpty = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v != null)) as Partial<T>;

/**
 * What a catalog taught us lies over the built-in levels. Both run from lowest to highest, so if the catalog leaves
 * out a first level (such as Nitro's starter one) they still line up at the top
 */
function lineUp(base: Level[] | undefined, taught: Level[] | undefined) {
    if (!taught?.length) return base;
    if (!base) return taught;
    if (taught.length > base.length) return base;

    const offset = base.length - taught.length;
    return base.map((level, index) => index < offset ? level : { ...level, ...withoutEmpty(taught[index - offset]) });
}

// ---- The page's button -----------------------------------------------------------------------------------------

function openBoostSettings() {
    SettingsRouter.openUserSettings(SettingsSections.PREMIUM_GUILD_SUBSCRIPTIONS_PANEL);
}

/** Discord's button on a badge's page, for whoever is looking: "Nitro Home" if they have Nitro, "Get Nitro" if not */
export function badgeAction(type: DiscordBadgeType, viewerOwns: boolean): BadgeAction | undefined {
    const go = (path: string) => () => NavigationRouter.transitionTo(path);
    const variant = viewerOwns ? "secondary" : type === DiscordBadgeType.PREMIUM_TENURE ? "expressive" : "primary";

    switch (type) {
        case DiscordBadgeType.PREMIUM_TENURE:
            return { text: viewerOwns ? discordString("xGjjkd", "Nitro Home") : discordString("BTxm69", "Get Nitro"), variant, onClick: go("/store") };
        case DiscordBadgeType.GUILD_BOOSTER: {
            let panel: unknown;
            try {
                panel = SettingsSections.PREMIUM_GUILD_SUBSCRIPTIONS_PANEL;
            } catch { }
            if (typeof panel !== "string") return undefined;
            return { text: viewerOwns ? discordString("VMvz3m", "Manage Boosts") : discordString("xFVZeU", "Boost a server"), variant, onClick: openBoostSettings };
        }
        case DiscordBadgeType.ORB_PROFILE:
            return { text: discordString("fG3RIg", "Orbs Shop"), variant, onClick: go("/shop?tab=orbs") };
        case DiscordBadgeType.QUEST_COMPLETED:
            return { text: discordString("swICIT", "Quests Home"), variant, onClick: go("/quest-home") };
        case DiscordBadgeType.STAFF:
            return { text: discordString("q7A8hP", "Work With Us"), variant, onClick: () => window.open("https://discord.com/careers", "_blank", "noopener") };
        default:
            return undefined;
    }
}

/** Whether the signed in account has this badge, from its catalog or its own profile */
export function viewerOwnsBadge(type: DiscordBadgeType, profileBadges: any[] | undefined) {
    const me = UserStore.getCurrentUser()?.id;
    if (!me) return false;
    if (catalogEntry(type, me)?.owned) return true;
    return profileBadges?.some(badge => (badge.discordBadge?.type ?? (badge.isEndcordBadge ? undefined : profileBadgeType(badge.id))) === type) ?? false;
}

/**
 * Everything Discord would show for one of its badges on this profile, or undefined when the badge isn't one of
 * Discord's. A badge a plugin added says which one it stands for with `discordBadge`
 */
export function describeDiscordBadge(badge: any, userId: string): DiscordBadgeView | undefined {
    const ref: DiscordBadgeRef | undefined = badge.discordBadge;
    const type = ref?.type ?? (badge.isEndcordBadge ? undefined : profileBadgeType(badge.id));
    if (type == null) return undefined;

    // A stand-in from a plugin shows Discord's badge, but not what this account really owns
    const entry = ref ? undefined : catalogEntry(type, userId);
    const remembered = learned[type];
    const fallback = known(type);
    // CustomProfile gives its stand-ins these dates on the user
    const user = UserStore.getUser(userId) as { premiumSince?: unknown; premiumGuildSince?: unknown; } | undefined;

    const nitro = type === DiscordBadgeType.PREMIUM_TENURE;
    const booster = type === DiscordBadgeType.GUILD_BOOSTER;
    const months = nitro ? tenureMonths(badge) : undefined;

    // Its levels and where this profile stands: the catalog's own, or the built-in ones with what catalogs taught us
    let levels: Level[] | undefined;
    let current = -1;
    if (entry?.tiers?.length) {
        const catalogLevels: Level[] = entry.tiers.map(fromCatalog);
        levels = catalogLevels;
        current = catalogLevels.findIndex(level => level.key === String(entry.current_tier));
    } else {
        const builtIn = nitro
            ? nitroLevels()
            : ref?.tiers?.map(tier => ({ name: tier.label, icon: tier.icon, art: tier.icon })) ?? fallback?.tierNames?.map(name => ({ name }));
        levels = lineUp(builtIn, remembered?.tiers?.map(fromLearned));
        current = nitro ? nitroPosition(months) : ref?.tier ?? -1;
        // Without knowing where this profile stands, the levels would say nothing true
        if (current < 0 || !levels || current >= levels.length) levels = undefined;
    }
    const level = levels?.[current];

    const nitroWord: string = discordString("Ipxkog", "Nitro");
    const name: string = nitro ? nitroWord : entry?.name ?? remembered?.name ?? fallback?.name ?? badge.description;
    const levelName = level?.name ?? (nitro && months ? tenureInfo(months).name : ref?.tierName);

    let title = name;
    let eyebrow: string | undefined;
    if (nitro) title = levelName ? `${nitroWord} ${levelName}` : nitroWord;
    else if (levelName) {
        eyebrow = name;
        title = levelName;
    }

    const rarity: BadgeRarity | undefined = level?.rarity
        ?? (nitro && months ? tenureInfo(months).rarity : undefined)
        ?? entry?.rarity ?? remembered?.rarity ?? fallback?.rarity;

    const profileIcon: string | undefined = badge.iconSrc ?? (badge.icon ? badgeIcon(badge.icon) : undefined);
    const image: string | undefined = level?.art
        ?? entry?.complex_icon_static_url
        ?? (nitro && months ? tenureInfo(months).art : undefined)
        ?? (levels ? undefined : remembered?.icon)
        ?? profileIcon;
    const animated: string | undefined = reducedMotion()
        ? undefined
        : level?.animated ?? entry?.complex_icon_animated_url ?? (levels ? undefined : remembered?.animated);

    // When this profile subscribed and started boosting: what its plugin gave a stand-in, Discord's profile otherwise
    const profile = ref ? undefined : UserProfileStore.getUserProfile(userId);
    const subscribedSince = nitro ? since(ref ? user?.premiumSince : profile?.premiumSince) : undefined;
    const boostingSince = booster ? since(ref ? user?.premiumGuildSince : profile?.premiumGuildSince) : undefined;

    const levelReached = nitro && months != null
        ? addMonths(subscribedSince, NITRO_LEVELS[nitroPosition(months)]?.[0] ?? 0)
        : booster && typeof ref?.tier === "number" ? addMonths(boostingSince, BOOST_MONTHS[ref.tier] ?? 0) : undefined;
    const obtainedAt = since(entry?.current_tier != null ? entry?.tier_obtained_at?.[entry.current_tier] : entry?.obtained_at) ?? levelReached;

    const infoLabel: string | undefined = entry?.info_label || (levels ? undefined : remembered?.infoLabel ?? fallback?.infoLabel);

    // Under the title Discord puts the badge's line, or when it was unlocked. A few of its badges say it in a
    // sentence instead, such as when someone subscribed
    let body: string | undefined = infoLabel;
    if (!body && subscribedSince) body = discordDateString("Hu4jfi", "short", subscribedSince, date => t("Subscriber since {date}", { date }));
    if (!body && boostingSince) body = discordDateString("IWkAq7", "medium", boostingSince, date => t("Server boosting since {date}", { date }));
    if (!body && SENTENCE_TYPES.has(type) && badge.description && badge.description !== title && (!ref || type === DiscordBadgeType.LEGACY_USERNAME)) body = badge.description;
    if (!body && obtainedAt) body = discordDateString("0aEh2a", "short", obtainedAt, date => t("Unlocked on {date}", { date }));

    const earnable = entry?.is_earnable ?? remembered?.earnable ?? fallback?.earnable ?? false;
    const legacy = LEGACY_TYPES.has(type) && !earnable && type !== DiscordBadgeType.STAFF;

    let status: string | undefined;
    if (type === DiscordBadgeType.APRIL_FOOLS_2026) status = discordString("5LcHT0", t("Unlocked"));
    else if (obtainedAt && type !== DiscordBadgeType.STAFF) status = discordDateString("XmaiRQ", "short", obtainedAt, date => t("Unlocked {date}", { date }));
    else if (!legacy) status = discordString("sTFApF", t("Unlocked"));

    return {
        type,
        name,
        title,
        eyebrow,
        body,
        rarity,
        image: image ?? animated,
        animated,
        icon: profileIcon ?? level?.icon ?? entry?.simple_icon_url ?? remembered?.simple,
        nitro,
        description: entry?.description ?? remembered?.description ?? fallback?.description ?? badge.description ?? "",
        infoLabel,
        status,
        legacy,
        beta: BETA_TYPES.has(type),
        levels: levels?.map((each, index) => ({
            name: each.name ?? "",
            icon: each.icon ?? each.art,
            milestone: each.milestone,
            owned: entry?.tiers?.length ? each.owned === true : index <= current
        })),
        maxed: !!levels && current === levels.length - 1,
        obtainedAt
    };
}

// ---- A profile's badges, for the page's list -------------------------------------------------------------------

const profileBadges = new Map<string, any[]>();

/** Kept as each profile's badge row is drawn, so a badge's page can list the rest */
export function rememberProfileBadges(userId: string, badges: any[]) {
    profileBadges.set(userId, badges);
    // Profiles come and go; a few hundred is plenty
    if (profileBadges.size > 300) profileBadges.delete(profileBadges.keys().next().value!);
}

export const getProfileBadges = (userId: string | undefined) => userId ? profileBadges.get(userId) : undefined;
