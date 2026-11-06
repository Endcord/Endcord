/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css?screen";

import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { HeadingSecondary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings";
import { debounce } from "@shared/debounce";
import { copyToClipboard } from "@utils/clipboard";
import { classNameFactory } from "@utils/css";
import { useI18n } from "@utils/i18n";
import { Margins } from "@utils/margins";
import { saveFile } from "@utils/web";
import { showToast, Slider, TextInput, Toasts, useMemo, useState } from "@webpack/common";

import { applyDesign, getThemeCss, saveDesign, settings } from ".";
import { DISCORD_ACCENT, DISCORD_BACKGROUND, DISCORD_DESIGN, FONTS, fromShareCode, isSameDesign, normalizeDesign, PRESETS, randomDesign, ThemeDesign, toShareCode, toThemeFile } from "./design";
import { LookPreview } from "./LookPreview";

const cl = classNameFactory("ec-studio-");

const SAVE_DELAY = 400;

function ColorField({ label, hint, value, fallback, onChange }: { label: string; hint: string; value: string; fallback: string; onChange(value: string): void; }) {
    const { t } = useI18n();

    return (
        <div className={cl("color")}>
            {/* The browser's own picker fires for every movement, and unlike Discord's it's always loaded */}
            <input
                className={cl("swatch")}
                type="color"
                aria-label={label}
                value={value || fallback}
                onChange={event => onChange(event.currentTarget.value)}
            />
            <div className={cl("color-text")}>
                <div className={cl("label")}>{label}</div>
                <Paragraph>{hint}</Paragraph>
            </div>
            {value && <Button variant="secondary" size="small" onClick={() => onChange("")}>{t("Reset")}</Button>}
        </div>
    );
}

/** A row of choices where one is picked, like Discord's segmented controls */
function Choices<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; style?: React.CSSProperties; }[]; onChange(value: T): void; }) {
    return (
        <div className={cl("field")}>
            <div className={cl("label")}>{label}</div>
            <div className={cl("choices")} role="radiogroup" aria-label={label}>
                {options.map(option => (
                    <button
                        key={option.value}
                        role="radio"
                        aria-checked={option.value === value}
                        className={cl("choice", { "choice-selected": option.value === value })}
                        style={option.style}
                        onClick={() => onChange(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// A different message each time, like the install command on the site
const COPIED = ["Theme copied to your clipboard", "Copied 🐼", "In your clipboard, ready to go.", "Copied. The panda approves."];
let copies = 0;
// After enough rolls the panda has an opinion
const ROLLS_FOR_PANDA = 10;

function StudioTab() {
    const { t } = useI18n();
    const [design, setDesign] = useState(() => normalizeDesign(settings.store.design));
    const [code, setCode] = useState("");
    const [rolls, setRolls] = useState(0);

    // Discord follows every movement of a slider, the settings file only needs where it ends up
    const save = useMemo(() => debounce(saveDesign, SAVE_DELAY), []);

    function change(next: ThemeDesign) {
        setDesign(next);
        applyDesign(next);
        save(next);
    }

    async function copyCss() {
        await copyToClipboard(toThemeFile(getThemeCss(design)));
        showToast(t(COPIED[copies++ % COPIED.length]), Toasts.Type.SUCCESS);
    }

    async function copyCode() {
        await copyToClipboard(toShareCode(design));
        showToast(t("Share code copied"), Toasts.Type.SUCCESS);
    }

    function applyCode() {
        const shared = fromShareCode(code);
        if (!shared) {
            showToast(t("That isn't a Theme Studio code"), Toasts.Type.FAILURE);
            return;
        }

        change(shared);
        setCode("");
        showToast(t("Look applied"), Toasts.Type.SUCCESS);
    }

    function surprise() {
        change(randomDesign());
        setRolls(rolls + 1);
        if (rolls + 1 === ROLLS_FOR_PANDA) showToast(t("Ten looks in. The panda thinks the first one was best."), Toasts.Type.MESSAGE);
    }

    function exportFile() {
        saveFile(new File([toThemeFile(getThemeCss(design))], "endcord-studio.theme.css", { type: "text/css" }));
    }

    return (
        <SettingsTab>
            <div className={cl("hero")}>
                <div className={cl("hero-preview")}><LookPreview design={design} /></div>
                <div className={cl("hero-text")}>
                    <Paragraph>{t("Everything here changes Discord as you drag. There's nothing to save and no code to write.")}</Paragraph>
                    <div className={cl("actions")}>
                        <Button size="small" onClick={surprise}>{t("Surprise me")}</Button>
                        <Button size="small" variant="secondary" onClick={() => change(DISCORD_DESIGN)}>{t("Back to Discord's look")}</Button>
                    </div>
                </div>
            </div>

            <section className={Margins.bottom20}>
                <HeadingSecondary>{t("Start from a look")}</HeadingSecondary>
                <div className={cl("presets")}>
                    {PRESETS.map(preset => (
                        <button
                            key={preset.name}
                            className={cl("preset", { active: isSameDesign(preset.design, design) })}
                            onClick={() => change(preset.design)}
                        >
                            <LookPreview design={preset.design} />
                            <span className={cl("preset-name")}>{t(preset.name)}</span>
                        </button>
                    ))}
                </div>
            </section>

            <section className={Margins.bottom20}>
                <HeadingSecondary>{t("Colors")}</HeadingSecondary>
                <ColorField
                    label={t("Accent")}
                    hint={t("Buttons, links and switches.")}
                    value={design.accent}
                    fallback={DISCORD_ACCENT}
                    onChange={accent => change({ ...design, accent })}
                />
                <ColorField
                    label={t("Background")}
                    hint={t("Applies to Discord's dark themes.")}
                    value={design.background}
                    fallback={DISCORD_BACKGROUND}
                    onChange={background => change({ ...design, background })}
                />
            </section>

            <section className={Margins.bottom20}>
                <HeadingSecondary>{t("Type")}</HeadingSecondary>
                <Choices
                    label={t("Typeface")}
                    value={design.font ?? ""}
                    options={[
                        { value: "", label: "Discord" },
                        { value: "system", label: t("System"), style: { fontFamily: FONTS.system } },
                        { value: "geometric", label: t("Geometric"), style: { fontFamily: FONTS.geometric } },
                        { value: "serif", label: t("Serif"), style: { fontFamily: FONTS.serif } },
                        { value: "mono", label: t("Mono"), style: { fontFamily: FONTS.mono } }
                    ]}
                    onChange={font => change({ ...design, font })}
                />
            </section>

            <section className={Margins.bottom20}>
                <HeadingSecondary>{t("Shape")}</HeadingSecondary>

                <div className={cl("label")}>{t("Corners")}</div>
                <Slider
                    markers={[0, 0.5, 1, 1.5, 2]}
                    minValue={0}
                    maxValue={2}
                    initialValue={design.radius}
                    stickToMarkers={false}
                    asValueChanges={radius => change({ ...design, radius })}
                    onValueRender={value => `${Math.round(value * 100)}%`}
                />

                <div className={cl("label")}>{t("Glass menus")}</div>
                <Slider
                    markers={[0, 6, 12, 18, 24]}
                    minValue={0}
                    maxValue={24}
                    initialValue={design.glass}
                    stickToMarkers={false}
                    asValueChanges={glass => change({ ...design, glass: Math.round(glass) })}
                    onValueRender={value => `${Math.round(value)} px`}
                />

                <Choices
                    label={t("Scrollbars")}
                    value={design.scrollbars ?? ""}
                    options={[
                        { value: "", label: "Discord" },
                        { value: "accent", label: t("Accent color") },
                        { value: "hidden", label: t("Hidden") }
                    ]}
                    onChange={scrollbars => change({ ...design, scrollbars })}
                />

                <FormSwitch
                    title={t("Flat")}
                    description={t("Takes the shadows off menus, pop-ups and cards.")}
                    value={!!design.flat}
                    onChange={flat => change({ ...design, flat })}
                    hideBorder
                />
            </section>

            <section className={Margins.bottom20}>
                <HeadingSecondary>{t("Share")}</HeadingSecondary>
                <Paragraph className={Margins.bottom8}>{t("A short code for this look. Anyone with Endcord can paste it here to get the same one.")}</Paragraph>
                <div className={cl("share")}>
                    <TextInput placeholder="ECS1:..." value={code} onChange={setCode} />
                    <Button size="small" disabled={!code.trim()} onClick={applyCode}>{t("Apply")}</Button>
                    <Button size="small" variant="secondary" onClick={copyCode}>{t("Copy code")}</Button>
                </div>
            </section>

            <div className={cl("actions")}>
                <Button onClick={exportFile}>{t("Export theme")}</Button>
                <Button variant="secondary" onClick={copyCss}>{t("Copy CSS")}</Button>
            </div>
        </SettingsTab>
    );
}

export default wrapTab(StudioTab, "Theme Studio");
