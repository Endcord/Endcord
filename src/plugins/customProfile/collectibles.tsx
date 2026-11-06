/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// What CustomProfile can put on a profile from Discord's shop, and Discord's display name styles

import ErrorBoundary from "@components/ErrorBoundary";
import { useI18n } from "@utils/i18n";
import { findByCodeLazy, findByPropsLazy, findComponentByCodeLazy, findStoreLazy } from "@webpack";
import { React, useStateFromStores } from "@webpack/common";

export const AVATAR_DECORATIONS = [
    { id: "1144307957425778779", label: "Hearts" },
    { id: "1144308196723408958", label: "Hearts Animated" },
    { id: "1212569433839636530", label: "Lofi Cafe" },
    { id: "1481387347642810480", label: "Winter" },
    { id: "1343751617362661526", label: "Magic Orb" },
    { id: "1373015260465987705", label: "Dragon" },
    { id: "1333866045303423026", label: "Ghost" },
    { id: "1144308439720394944", label: "Sakura Drift" },
    { id: "1432550258126229565", label: "Neon" },
    { id: "1462116613632426014", label: "Cyber City" },
    { id: "1462116613682757888", label: "Retro" },
    { id: "1144307629225672846", label: "Fire" },
    { id: "1341506443718688768", label: "Void" },
    { id: "1447654090640330763", label: "Celestial" },
    { id: "1483857762890022923", label: "Snowy" },
    { id: "1479561706672885811", label: "Ice" },
    { id: "1212569856189407352", label: "Cozy" },
    { id: "1485784028710830242", label: "New Year" },
    { id: "1341506444150702080", label: "Abyss" },
    { id: "1232071712695386162", label: "Spring" },
    { id: "1220514048068812901", label: "Summer" },
    { id: "1427463138634109026", label: "Autumn" },
    { id: "1341506443865489408", label: "Darkness" },
    { id: "1144003752978829455", label: "Flaming Sword" },
    { id: "1144006094134456352", label: "Magical Potion" },
    { id: "1144046002110738634", label: "Fairy Sprites" },
    { id: "1144048390594908212", label: "Wizard's Staff" },
    { id: "1144048977138946230", label: "Glowing Runes" },
    { id: "1144049316009353338", label: "Defensive Shield" },
    { id: "1144049603109470370", label: "Skull Medallion" },
    { id: "1144049924397334651", label: "Treasure and Key" },
    { id: "1207047014769234001", label: "Fire Element" },
    { id: "1207047597294886923", label: "Water" },
    { id: "1207047808838799410", label: "Air" },
    { id: "1207048049571139584", label: "Earth" },
    { id: "1207048289610899526", label: "Lightning" },
    { id: "1207048656289534022", label: "Balance" },
    { id: "1232070870093008937", label: "Stardust" },
    { id: "1232071157746765906", label: "Black Hole" },
    { id: "1232071712695386162", label: "Constellations" },
    { id: "1232072121950146560", label: "Solar Orbit" },
    { id: "1232072520249643028", label: "UFO" },
    { id: "1232072859485208687", label: "Astronaut Helmet" },
    { id: "1197344326133502032", label: "Glitch" },
    { id: "1197344396983664670", label: "Cybernetic" },
    { id: "1197344575832981605", label: "Digital Sunrise" },
    { id: "1197344636558114986", label: "Implant" },
];

export function getDecorationUrl(assetId: string, animated = false): string {
    return `https://cdn.discordapp.com/media/v1/collectibles-shop/${assetId}/${animated ? "animated" : "static"}`;
}

// Discord draws a profile effect, frame or nameplate only when its skuId is a shop product it can look up, so the
// choices come from its own shop catalog: every one it sells, always current, in the user's language, with previews
export const CollectiblesCategoryStore = findStoreLazy("CollectiblesCategoryStore");
export const fetchCollectiblesCategories = findByCodeLazy('type:"COLLECTIBLES_CATEGORIES_FETCH"');

// The item types of Discord's shop
export const enum CollectibleType {
    AVATAR_DECORATION = 0,
    PROFILE_EFFECT = 1,
    NAMEPLATE = 2,
    PROFILE_FRAME = 3
}

export interface ShopCollectible {
    skuId: string;
    name: string;
    item: any;
}

export function useShopCollectibles() {
    const fetchedAt = useStateFromStores([CollectiblesCategoryStore], () => CollectiblesCategoryStore.lastSuccessfulFetch);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        if (CollectiblesCategoryStore.products?.size) return;
        Promise.resolve()
            .then(() => fetchCollectiblesCategories({}))
            .catch(() => setFailed(true));
    }, []);

    const byType = React.useMemo(() => {
        const lists: Record<CollectibleType, ShopCollectible[]> = { 0: [], 1: [], 2: [], 3: [] };
        const seen = new Set<string>();
        for (const product of CollectiblesCategoryStore.products?.values() ?? []) {
            // Bundles hold several items; each of those is also sold on its own
            const item = product.items?.length === 1 ? product.items[0] : null;
            if (!item || !(item.type in lists) || seen.has(product.skuId)) continue;
            seen.add(product.skuId);
            lists[item.type as CollectibleType].push({ skuId: product.skuId, name: product.name, item });
        }
        return lists;
    }, [fetchedAt]);

    const empty = !Object.values(byType).some(list => list.length);
    return { byType, loading: !failed && empty, failed: failed && empty };
}

// Discord's own fonts and effects for display names, read from its enums so new ones show up by themselves
export const DisplayNameEffects = findByPropsLazy("SOLID", "GRADIENT", "NEON", "GUMMY");
export const DisplayNameFonts = findByPropsLazy("CHICLE", "DEFAULT");

export function enumEntries(getEnum: () => Record<string, unknown>) {
    try {
        return Object.entries(getEnum())
            // Discord's enum also holds TEST_ entries of its own
            .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isNaN(Number(entry[0])) && !entry[0].startsWith("TEST"))
            .map(([key, id]) => ({ id, name: key.toLowerCase().split("_").map(word => word[0].toUpperCase() + word.slice(1)).join(" ") }));
    } catch {
        // Not found in this Discord build: the section says so instead
        return [];
    }
}

export interface DisplayNameStyles {
    fontId: number;
    effectId: number;
    colors: number[];
}

/** What Discord keeps on a user for their nameplate */
export interface NameplateData {
    skuId: string;
    asset: string;
    label?: string;
    palette?: unknown;
}

export function CloseIcon() {
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
}

// The shop's own picture of a product, or its name where there is none
export function ShopImage({ skuId, name }: { skuId: string; name: string; }) {
    const [failed, setFailed] = React.useState(false);

    return failed
        ? <span>{name}</span>
        : <img src={getDecorationUrl(skuId)} alt={name} loading="lazy" onError={() => setFailed(true)} />;
}

// A profile frame has no single picture in the shop: Discord draws it from layers around the profile card, each its
// own image. Stacking them all in a small tile came out misplaced and made the list stutter, so the tile shows the one
// layer that says the most about the frame: the ornament on top, else whatever comes first
function frameThumbnailLayer(layers: any[]) {
    const placed = (anchor: string) => layers.find(layer => layer.type === "staple" && layer.anchor === anchor);
    return placed("top") ?? placed("bottom") ?? layers.find(layer => layer.type === "staple") ?? layers[0];
}

export function FramePreview({ frame }: { frame: ShopCollectible; }) {
    const layers: any[] = Array.isArray(frame.item?.layers) ? frame.item.layers.filter((layer: any) => layer?.id) : [];
    const layer = layers.length ? frameThumbnailLayer(layers) : null;
    const [failed, setFailed] = React.useState(false);
    if (!layer || failed) return <ShopImage skuId={frame.skuId} name={frame.name} />;

    return (
        <img className="cp-frame-thumb" alt={frame.name} loading="lazy" decoding="async" draggable={false}
            src={`https://cdn.discordapp.com/media/v1/collectibles-shop/${frame.skuId}/${layer.id}/static`}
            onError={() => setFailed(true)} />
    );
}

// Discord's own display name, drawn with a font, effect and colors exactly as it shows them
const NameWithEffects = findComponentByCodeLazy('"data-username-with-effects"');

// Only the big preview animates: two dozen buttons all playing their effect at once made the dialog stutter
function StyledName({ name, styles, animate = false }: { name: string; styles: DisplayNameStyles; animate?: boolean; }) {
    return (
        <ErrorBoundary fallback={() => <span>{name}</span>}>
            <NameWithEffects userName={name} displayNameStyles={styles} loop={animate} />
        </ErrorBoundary>
    );
}

export interface NameStyleOption {
    id: number;
    name: string;
}

export const toHex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
export const fromHex = (hex: string) => parseInt(hex.slice(1), 16);

export function DisplayNameStylePicker({ value, fonts, effects, previewName, onChange }: {
    value: DisplayNameStyles | undefined;
    previewName: string;
    fonts: NameStyleOption[];
    effects: NameStyleOption[];
    onChange(value: DisplayNameStyles | undefined): void;
}) {
    const { t } = useI18n();
    if (!fonts.length || !effects.length) return <div className="cp-hint">{t("This version of Discord has no display name styles.")}</div>;

    const current: DisplayNameStyles = value ?? {
        fontId: fonts.find(font => font.name === "Default")?.id ?? fonts[0].id,
        effectId: effects.find(effect => effect.name === "Solid")?.id ?? effects[0].id,
        colors: [0x9ccbff]
    };
    const update = (patch: Partial<DisplayNameStyles>) => onChange({ ...current, ...patch });
    const [first, second] = current.colors;

    return (
        <>
            <div className="cp-name-preview">
                <StyledName name={previewName} styles={current} animate />
            </div>
            <div className="cp-badges" style={{ flexWrap: "wrap", gap: 6 }}>
                <button onClick={() => onChange(undefined)} className={`cp-badge ${!value ? "cp-badge--on" : ""}`}>{t("None")}</button>
                {fonts.map(font => (
                    <button key={font.id} onClick={() => update({ fontId: font.id })} title={font.name}
                        className={`cp-badge cp-name-option ${value?.fontId === font.id ? "cp-badge--on" : ""}`}>
                        <StyledName name={font.name} styles={{ ...current, fontId: font.id }} />
                    </button>
                ))}
            </div>
            <div className="cp-badges" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {effects.map(effect => (
                    <button key={effect.id} onClick={() => update({ effectId: effect.id })} title={effect.name}
                        className={`cp-badge cp-name-option ${value?.effectId === effect.id ? "cp-badge--on" : ""}`}>
                        <StyledName name={effect.name} styles={{ ...current, effectId: effect.id }} />
                    </button>
                ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <input type="color" className="cp-color-swatch" value={toHex(first)}
                    onChange={e => update({ colors: [fromHex(e.target.value), ...current.colors.slice(1)] })} />
                <input type="color" className="cp-color-swatch" value={toHex(second ?? first)}
                    onChange={e => update({ colors: [first, fromHex(e.target.value)] })} />
                {second != null && <button className="cp-clear-btn" onClick={() => update({ colors: [first] })}><CloseIcon /></button>}
            </div>
            <div className="cp-hint">{t("The second color is for Gradient, Glow and Prism.")}</div>
        </>
    );
}
