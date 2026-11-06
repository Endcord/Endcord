/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./BadgeDetails.css?screen";

import { AddedBadge, BadgeDetails, BadgeRarity } from "@api/Badges";
import { enableScreenStyles } from "@api/Styles";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { InfoIcon } from "@components/Icons";
import { classNameFactory } from "@utils/css";
import { t } from "@utils/i18n";
import { ModalCloseButton, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { IconUtils, Tooltip, useMemo, UserStore, useState } from "@webpack/common";
import type { ReactNode } from "react";

import {
    BadgeAction, badgeAction, BadgeLevel, describeDiscordBadge, DiscordBadgeView, discordPlainString, discordString,
    getProfileBadges, legacyFlavor, requestCatalog, viewerOwnsBadge
} from "./discordBadges";

// Laid out like Discord's badge directory: the profile's badges on the left, the chosen one on the right, with
// Discord's colours, type and measurements, so a badge Endcord adds reads the same as one Discord gives out
const cl = classNameFactory("ec-badge-details-");

// Discord's own words for each rarity, so they match its badges in every language. Ours stand in if it renamed them.
// The icons are Discord's shapes. They are functions because React isn't there yet when this file loads.
// Celestial is Endcord's own, so it has no word of Discord's and its two stars are ours
const RARITY: Record<BadgeRarity, { hash?: string; fallback: () => string; name: string; icon: () => ReactNode; }> = {
    [BadgeRarity.COMMON]: { hash: "L0K5ci", fallback: () => t("Common"), name: "common", icon: () => <circle cx="12" cy="12" r="10" /> },
    [BadgeRarity.RARE]: { hash: "sTx/5z", fallback: () => t("Rare"), name: "rare", icon: () => <path d="M10.16 4.06a2.13 2.13 0 0 1 3.68 0l8 13.77c.81 1.41-.2 3.17-1.84 3.17H4a2.11 2.11 0 0 1-1.84-3.17l8-13.77Z" /> },
    [BadgeRarity.EPIC]: { hash: "RD8RiN", fallback: () => t("Epic"), name: "epic", icon: () => <rect width="16" height="16" x="12" y="1" rx="2" transform="rotate(45 12 1)" /> },
    [BadgeRarity.MYTHIC]: { hash: "vqc1ol", fallback: () => t("Mythic"), name: "mythic", icon: () => <path d="M11.26 2.86c.38-1.15 2-1.15 2.38 0l1.89 5.83h6.12c1.2 0 1.71 1.54.73 2.25l-4.95 3.6 1.9 5.82a1.25 1.25 0 0 1-1.93 1.4l-4.95-3.6-4.95 3.6c-.98.7-2.3-.25-1.92-1.4l1.89-5.82-4.95-3.6a1.25 1.25 0 0 1 .73-2.25h6.12l1.9-5.83Z" /> },
    [BadgeRarity.CELESTIAL]: { fallback: () => t("Celestial"), name: "celestial", icon: () => <path d="M10 1.5c.55 5.1 2.9 7.45 8 8-5.1.55-7.45 2.9-8 8-.55-5.1-2.9-7.45-8-8 5.1-.55 7.45-2.9 8-8ZM19 15.5c.25 2 1.25 3 3.5 3.5-2.25.5-3.25 1.5-3.5 3.5-.25-2-1.25-3-3.5-3.5 2.25-.5 3.25-1.5 3.5-3.5Z" /> }
};

export function rarityName(rarity: BadgeRarity) {
    const { hash, fallback } = RARITY[rarity];
    return hash ? discordString(hash, fallback()) : fallback();
}

export function RarityPill({ rarity }: { rarity: BadgeRarity; }) {
    const entry = RARITY[rarity];
    if (!entry) return null;

    return (
        <span className={`ec-badge-rarity ec-badge-rarity-${entry.name}`}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{entry.icon()}</svg>
            <span className="ec-badge-rarity-label">{rarityName(rarity)}</span>
        </span>
    );
}

export function getBadgeDetails(badge: AddedBadge): BadgeDetails {
    const details = typeof badge.details === "function" ? badge.details(badge) : badge.details;

    return details ?? {
        era: "Endcord",
        label: t("Endcord Badge"),
        text: t("Endcord adds this badge to the profile."),
        notice: t("Only people who use Endcord can see this badge.")
    };
}

// ---- The profile's badges --------------------------------------------------------------------------------------

interface Entry {
    badge: AddedBadge;
    view?: DiscordBadgeView;
    icon: string;
}

const isSameBadge = (a: any, b: any) => a.id === b.id && (a.iconSrc ?? a.icon) === (b.iconSrc ?? b.icon);

function listBadges(userId: string, opened: AddedBadge | undefined): Entry[] {
    const shown = getProfileBadges(userId) ?? [];
    const badges = !opened || shown.some(badge => isSameBadge(badge, opened)) ? shown : [opened, ...shown];

    return badges.flatMap(badge => {
        if (!badge || badge.component) return [];
        const view = describeDiscordBadge(badge, userId);
        const icon = view?.icon ?? badge.iconSrc ?? (badge.icon ? `https://cdn.discordapp.com/badge-icons/${badge.icon}.png` : undefined);
        return icon ? [{ badge: { ...badge, userId }, view, icon }] : [];
    });
}

/** The look a badge's own art asks for, such as crisp pixels, without its size tweaks */
function artStyle(badge: AddedBadge): React.CSSProperties | undefined {
    const rendering = badge.props?.style?.imageRendering;
    return rendering ? { imageRendering: rendering } : undefined;
}

// Discord shortens long names in the title
function shortName(name: string) {
    const characters = Array.from(name);
    return characters.length > 19 ? `${characters.slice(0, 19).join("")}...` : name;
}

function DirectoryPanel({ userId, isViewingOther, entries, selected, onSelect, onViewOwn }: {
    userId: string;
    isViewingOther: boolean;
    entries: Entry[];
    selected: number;
    onSelect(index: number): void;
    onViewOwn?(): void;
}) {
    const user = UserStore.getUser(userId);
    const name = user ? shortName(user.globalName ?? user.username) : undefined;
    const avatar = user ? IconUtils.getUserAvatarURL(user, false, 48) : undefined;

    const title = isViewingOther && name
        ? discordPlainString("EIcwoe", t("{username}'s badges", { username: name }), { username: name })
        : discordString("UqnlQF", t("Your badges"));
    const subtitle = isViewingOther
        ? discordString("75s2Rq", t("Explore their badges, or view your badges to find out what you can unlock next."))
        : discordString("62xU4E", t("Browse your badges and discover new ones you can unlock."));

    return (
        <div className={cl("directory")}>
            <div className={cl("directory-header")}>
                <div className={cl("directory-title-row")}>
                    {avatar && <img className={cl("avatar")} src={avatar} alt="" aria-hidden="true" />}
                    <h2 className={cl("directory-title")}>{title}</h2>
                </div>
                <span className={cl("directory-subtitle")}>{subtitle}</span>
            </div>

            <div className={cl("directory-content")}>
                <div className={cl("section")}>
                    <div role="tablist" aria-label={isViewingOther && name ? discordPlainString("BCjSZy", title, { username: name }) : title} className={cl("grid")}>
                        {entries.map((entry, index) => (
                            <button
                                key={index}
                                type="button"
                                role="tab"
                                aria-selected={index === selected}
                                aria-label={entry.view?.eyebrow ? `${entry.view.eyebrow}, ${entry.view.title}` : entry.view?.title ?? entry.badge.title ?? entry.badge.description}
                                className={cl("slot", { "slot-selected": index === selected })}
                                onClick={() => onSelect(index)}
                            >
                                <img className={cl("slot-icon")} style={entry.view ? undefined : artStyle(entry.badge)} src={entry.icon} alt="" aria-hidden="true" draggable={false} />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {isViewingOther && onViewOwn && (
                <div className={cl("directory-footer")}>
                    <Button variant="secondary" size="small" className={cl("full-width")} onClick={onViewOwn}>
                        {discordString("msyp90", t("View Your Badges"))}
                    </Button>
                </div>
            )}
        </div>
    );
}

// ---- The chosen badge ------------------------------------------------------------------------------------------

function Segments({ segments }: { segments: ReactNode[]; }) {
    if (!segments.length) return null;

    return (
        <div className={cl("line")}>
            {segments.map((segment, index) => (
                <span key={index} className={cl("segment-group")}>
                    {index > 0 && <span className={cl("dot")} aria-hidden="true" />}
                    {segment}
                </span>
            ))}
        </div>
    );
}

function BetaTag() {
    return (
        <Tooltip text={discordString("goKu4e", "Still a work in progress. Features and appearance may change.")}>
            {props => (
                <span {...props} className={cl("beta")}>
                    <InfoIcon width={12} height={12} />
                    {discordString("oW0eUd", "Beta")}
                </span>
            )}
        </Tooltip>
    );
}

function LockIcon() {
    return (
        <svg className={cl("lock")} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M6 9h1V6a5 5 0 0 1 10 0v3h1a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3Zm9-3v3H9V6a3 3 0 1 1 6 0Z" />
        </svg>
    );
}

function Levels({ levels, label, progressOf }: { levels: BadgeLevel[]; label: string; progressOf?: string; }) {
    return (
        <>
            {progressOf && (
                <>
                    <div className={cl("divider")} role="separator" />
                    <span className={cl("levels-heading")}>{discordPlainString("KyTwIh", t("{username}'s Progress", { username: progressOf }), { username: progressOf })}</span>
                </>
            )}
            <div className={cl("levels")} role="list" aria-label={progressOf ? undefined : label}>
                {levels.map((level, index) => (
                    <div key={index} role="listitem" className={cl("level", { "level-locked": !level.owned })}>
                        {level.icon && <img className={cl("level-icon")} src={level.icon} alt="" aria-hidden="true" draggable={false} />}
                        <div className={cl("level-text")}>
                            {level.name && <span className={cl("level-name", { "level-muted": !level.owned })}>{level.name}</span>}
                            {level.milestone && (
                                <span className={cl("level-milestone", { "level-muted": !level.owned })}>
                                    {!level.owned && <LockIcon />}
                                    {level.milestone}
                                </span>
                            )}
                        </div>
                        <span className={cl("hidden")}>{level.owned ? discordString("sTFApF", t("Unlocked")) : discordString("uHtDcT", t("Not unlocked yet"))}</span>
                    </div>
                ))}
            </div>
        </>
    );
}

interface Detail {
    image?: string;
    imageStyle?: React.CSSProperties;
    animatedNitro?: boolean;
    beta?: boolean;
    eyebrow?: string;
    title: string;
    nitro?: boolean;
    segments: ReactNode[];
    label?: string;
    text?: ReactNode;
    action?: BadgeAction;
    levels?: BadgeLevel[];
    notice?: ReactNode;
}

function discordDetail(view: DiscordBadgeView, flavor: string, isViewingOther: boolean, viewerOwns: boolean, onViewOwn?: () => void): Detail {
    const segments: ReactNode[] = [];
    if (view.infoLabel) segments.push(<span className={cl("segment")}>{view.infoLabel}</span>);
    segments.push(<span className={cl("segment")}>{view.status ?? flavor}</span>);
    if (view.rarity && view.rarity !== BadgeRarity.COMMON) segments.push(<RarityPill rarity={view.rarity} />);

    return {
        image: view.animated ?? view.image,
        animatedNitro: !!view.animated && view.nitro,
        beta: view.beta,
        eyebrow: view.eyebrow,
        title: view.title,
        nitro: view.nitro,
        segments,
        label: view.legacy ? discordString("/Gmn3f", "Legacy Badge") : undefined,
        // Someone at a badge's last level is told so, in Discord's words
        text: !isViewingOther && view.maxed
            ? discordString("jY5xAL", t("You've maxed out this badge. Sit back, relax, and enjoy the view from the top."))
            : view.description,
        action: badgeAction(view.type, viewerOwns),
        levels: view.levels,
        // Discord says this when you look at a legacy badge on someone else's profile that you don't have
        notice: view.legacy && isViewingOther && !viewerOwns
            ? discordString("vFekBs", t("This badge is no longer available, but others are waiting."), { onViewBadges: onViewOwn ?? (() => { }) })
            : undefined
    };
}

function endcordDetail(badge: AddedBadge): Detail {
    const { flavor, era, label, text, notice, action } = getBadgeDetails(badge);
    const segments: ReactNode[] = [];
    if (flavor) segments.push(<span className={cl("segment")}>{flavor}</span>);
    if (era) segments.push(<span className={cl("segment")}>{era}</span>);
    if (badge.rarity && badge.rarity !== BadgeRarity.COMMON) segments.push(<RarityPill rarity={badge.rarity} />);

    return {
        image: badge.iconSrc,
        imageStyle: artStyle(badge),
        eyebrow: badge.eyebrow && badge.eyebrow !== era ? badge.eyebrow : undefined,
        title: badge.title ?? badge.description ?? "",
        segments,
        label,
        text,
        action: action && { text: action.text, variant: "primary", onClick: action.onClick },
        notice
    };
}

function DetailPanel({ detail, progressOf, onClose }: { detail: Detail; progressOf?: string; onClose(): void; }) {
    const { levels, notice } = detail;
    const hasCard = !!detail.text || !!levels?.length;

    return (
        <div className={cl("detail")} role="tabpanel">
            <div className={cl("close")}>
                <ModalCloseButton onClick={onClose} />
            </div>

            <div className={cl("detail-scroller")}>
                <div className={cl("detail-header")}>
                    {detail.beta && <BetaTag />}
                </div>

                {detail.image && (
                    <img
                        className={cl("graphic", { "graphic-animated-nitro": !!detail.animatedNitro })}
                        style={detail.imageStyle}
                        src={detail.image}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                    />
                )}

                <div className={cl("info")}>
                    <div className={cl("identity")}>
                        <h2 className={cl("title", { "title-nitro": !!detail.nitro })}>
                            {detail.eyebrow && <span className={cl("eyebrow")}>{detail.eyebrow}</span>}
                            {detail.title}
                        </h2>
                        <Segments segments={detail.segments} />
                    </div>

                    {hasCard && (
                        <div className={cl("card")}>
                            {detail.text && (
                                <div className={cl("card-header", { "card-header-stacked": !levels?.length })}>
                                    <div className={cl("text-group")}>
                                        {detail.label && <span className={cl("label")}>{detail.label}</span>}
                                        <span className={cl("text")}>{detail.text}</span>
                                    </div>
                                    {detail.action && (
                                        <Button
                                            size="small"
                                            variant={detail.action.variant === "secondary" ? "secondary" : "primary"}
                                            className={cl({ "button-expressive": detail.action.variant === "expressive" })}
                                            onClick={() => {
                                                onClose();
                                                detail.action!.onClick();
                                            }}
                                        >
                                            {detail.action.text}
                                        </Button>
                                    )}
                                </div>
                            )}

                            {!!levels?.length && <Levels levels={levels} label={detail.eyebrow ?? detail.title} progressOf={progressOf} />}

                            {notice && <Notice>{notice}</Notice>}
                        </div>
                    )}

                    {!hasCard && notice && <Notice>{notice}</Notice>}
                </div>
            </div>
        </div>
    );
}

function Notice({ children }: { children: ReactNode; }) {
    return (
        <div className={cl("notice")}>
            <InfoIcon width={16} height={16} />
            <span>{children}</span>
        </div>
    );
}

// ---- The dialog ------------------------------------------------------------------------------------------------

function BadgeDirectoryModal({ badge, modalProps }: { badge: AddedBadge; modalProps: ModalProps; }) {
    const me = UserStore.getCurrentUser()?.id;
    const [userId, setUserId] = useState(badge.userId);
    const [opened, setOpened] = useState<AddedBadge | undefined>(badge);

    const entries = useMemo(() => listBadges(userId, opened), [userId, opened]);
    const [selected, setSelected] = useState(() => Math.max(0, entries.findIndex(entry => isSameBadge(entry.badge, badge))));
    const entry = entries[selected] ?? entries[0];

    // Discord picks the legacy line once for each badge you look at, so it doesn't change while you read
    const flavor = useMemo(legacyFlavor, [selected, userId]);

    const isViewingOther = !!me && userId !== me;
    const ownBadges = me ? getProfileBadges(me) : undefined;
    const viewOwn = isViewingOther && ownBadges?.length
        ? () => {
            // Open on the same kind of badge, as Discord does
            const type = entry?.view?.type;
            const own = listBadges(me!, undefined);
            setOpened(undefined);
            setUserId(me!);
            setSelected(Math.max(0, type == null ? 0 : own.findIndex(each => each.view?.type === type)));
        }
        : undefined;

    if (!entry) return null;

    const user = UserStore.getUser(userId);
    const name = user ? user.globalName ?? user.username : undefined;
    const viewerOwns = !isViewingOther || (entry.view ? viewerOwnsBadge(entry.view.type, ownBadges) : false);
    const detail = entry.view
        ? discordDetail(entry.view, flavor, isViewingOther, viewerOwns, viewOwn)
        : endcordDetail(entry.badge);

    return (
        <ModalRoot {...modalProps} size={ModalSize.DYNAMIC} className={cl("root")} aria-label={detail.title}>
            <div className={cl("content")}>
                <DirectoryPanel
                    userId={userId}
                    isViewingOther={isViewingOther}
                    entries={entries}
                    selected={selected}
                    onSelect={setSelected}
                    onViewOwn={viewOwn}
                />
                <ErrorBoundary key={`${userId}-${selected}`}>
                    <DetailPanel detail={detail} progressOf={isViewingOther ? name : undefined} onClose={modalProps.onClose} />
                </ErrorBoundary>
            </div>
        </ModalRoot>
    );
}

export function openBadgeDetails(badge: AddedBadge) {
    // A real badge of Discord's reads better with the profile's own catalog
    if (!badge.discordBadge && !badge.isEndcordBadge) requestCatalog(badge.userId);

    enableScreenStyles();
    openModal(modalProps => (
        <ErrorBoundary>
            <BadgeDirectoryModal badge={badge} modalProps={modalProps} />
        </ErrorBoundary>
    ));
}
