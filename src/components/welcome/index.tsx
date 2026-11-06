/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css?screen";

import { getIsEndcordHidden } from "@api/EndcordVisibility";
import { isPluginEnabled } from "@api/PluginManager";
import { addStarterPacksGradually, getPackAdditions, StarterPack } from "@api/PluginProfiles";
import { Settings, useSettings } from "@api/Settings";
import { enableScreenStyles } from "@api/Styles";
import { ChevronRightIcon, EndcordMark } from "@components/EndcordIcons";
import ErrorBoundary from "@components/ErrorBoundary";
import { useStarterPacks } from "@components/settings/StarterPacks";
import { Switch } from "@components/Switch";
import type ThemeStudio from "@plugins/themeStudio";
import { IS_MAC } from "@utils/constants";
import { classNameFactory, ENDCORD_THEME } from "@utils/css";
import { useI18n } from "@utils/i18n";
import { classes } from "@utils/misc";
import { relaunch } from "@utils/native";
import { createRoot, useEffect, useLayoutEffect, useMemo, useRef, useState } from "@webpack/common";
import type { CSSProperties, ReactNode } from "react";

import Plugins from "~plugins";

const cl = classNameFactory("ec-welcome-");

const enum Step {
    Hello,
    Look,
    Plugins,
    Done
}

// The steps named in the header. Hello isn't a step anyone has to take
const STEPS = [
    { step: Step.Look, name: "Look" },
    { step: Step.Plugins, name: "Plugins" },
    { step: Step.Done, name: "Ready" }
];

/** How long the card takes to grow or shrink to the next screen, matching --ec-ease-out */
const RESIZE_TIME = 440;
/** Turning plugins on takes a moment people can see, even when the plugins themselves start at once */
const MIN_BUSY_TIME = 900;
const FADE_OUT_TIME = 300;
/** The panda is asleep on the logo, as in the installer, and wakes up once the card has arrived */
const WAKE_AFTER = 1150;

const prefersLessMotion = () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** Its place in the order things arrive in on a screen */
const at = (index: number) => ({ "--ec-i": index }) as CSSProperties;

/** A number that rolls to its new value instead of jumping there */
function useRollingNumber(target: number, from = target) {
    const [value, setValue] = useState(from);
    const shown = useRef(from);

    useEffect(() => {
        const start = shown.current;
        if (start === target || prefersLessMotion()) {
            shown.current = target;
            setValue(target);
            return;
        }

        const began = performance.now();
        const duration = Math.min(900, 240 + Math.abs(target - start) * 28);
        let frame = 0;
        const tick = (now: number) => {
            const progress = Math.min(1, (now - began) / duration);
            const next = Math.round(start + (target - start) * (1 - (1 - progress) ** 4));
            shown.current = next;
            setValue(next);
            if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target]);

    return value;
}

/** Where you are, as the installer's tabs: the names, and a line under the current one that slides to the next */
function Steps({ steps, current, onPick }: { steps: typeof STEPS; current: number; onPick?(step: Step): void; }) {
    const { t } = useI18n();
    const list = useRef<HTMLOListElement>(null);
    const [line, setLine] = useState<{ x: number; width: number; slide: boolean; }>();

    useLayoutEffect(() => {
        const place = () => {
            const item = list.current?.children[current] as HTMLElement | undefined;
            // It appears under the first step, and only slides from there on
            if (item) setLine(was => ({ x: item.offsetLeft, width: item.offsetWidth, slide: !!was }));
        };
        place();
        // The display font can arrive after the first layout and change the widths
        document.fonts?.ready.then(place);
    }, [current]);

    return (
        <ol ref={list} className={cl("steps")} aria-label={t("Step {step} of {count}", { step: current + 1, count: steps.length })}>
            {steps.map((entry, index) => {
                const done = index < current;
                return (
                    <li key={entry.step} className={cl("step", { "step-now": index === current, "step-done": done })} aria-current={index === current ? "step" : undefined}>
                        {done && onPick
                            ? <button className={cl("step-back")} onClick={() => onPick(entry.step)}>{t(entry.name)}</button>
                            : t(entry.name)}
                    </li>
                );
            })}
            {line && (
                <span
                    className={cl("steps-line", { "steps-line-slide": line.slide })}
                    aria-hidden="true"
                    style={{ transform: `translateX(${line.x}px) scaleX(${line.width})` }}
                />
            )}
        </ol>
    );
}

function Hello({ pluginCount }: { pluginCount: number; }) {
    const { t } = useI18n();
    const [awake, setAwake] = useState(prefersLessMotion);

    useEffect(() => {
        if (awake) return;
        const timer = setTimeout(() => setAwake(true), WAKE_AFTER);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className={cl("hello")}>
            <span className={cl("stage", { "stage-awake": awake })} aria-hidden="true">
                <span className={cl("floor")} />
                <span className={cl("zz")}><span>z</span><span>z</span></span>
                <span className={cl("panda")}><EndcordMark width={102} asleep={!awake} /></span>
            </span>
            <h1 className={classes(cl("title"), cl("in"))} style={at(0)}>{t("Welcome to Endcord")}</h1>
            <p className={classes(cl("lead"), cl("in"))} style={at(1)}>
                {t("Two quick choices: how Discord looks, and what Endcord adds to it. You can change both later in Settings.")}
            </p>
            <p className={classes(cl("meta"), cl("in"))} style={at(2)}>
                <span>{t("{count} plugins", { count: pluginCount })}</span>
                <span>{t("Open source")}</span>
                <span>{t("Signed updates")}</span>
            </p>
        </div>
    );
}

// Theme Studio is a plugin, so this only gets its looks while it's on
const getStudio = () => isPluginEnabled("ThemeStudio") ? Plugins.ThemeStudio as typeof ThemeStudio : undefined;

function Look({ studio, onOpenStudio }: { studio: typeof ThemeStudio; onOpenStudio(): void; }) {
    const { t } = useI18n();
    const design = studio.useDesign();
    const settings = useSettings(["pixelStyle"]);
    const { LookPreview } = studio;

    return (
        <>
            <h2 className={classes(cl("heading"), cl("in"))}>{t("Pick a look")}</h2>
            <p className={classes(cl("text"), cl("in"))} style={at(1)}>{t("Discord changes behind this window as you pick.")}</p>
            <div className={cl("looks")}>
                {studio.presets.map(({ name, design: preset }, index) => {
                    const selected = studio.isSameDesign(preset, design);
                    return (
                        <button
                            key={name}
                            className={classes(cl("look", { "look-on": selected }), cl("in"))}
                            style={at(index)}
                            aria-pressed={selected}
                            onClick={() => studio.saveDesign(preset)}
                        >
                            <LookPreview design={preset} />
                            <span className={cl("look-name")}>{t(name)}</span>
                        </button>
                    );
                })}
            </div>
            <div className={classes(cl("row"), cl("in"))} style={at(5)}>
                <span className={cl("row-text")}>
                    <span className={cl("row-title")}>{t("Theme Studio")}</span>
                    <span className={cl("row-hint")}>{t("Your own colors, font and corners. You can change your look here any time, under Settings.")}</span>
                </span>
                <button className={cl("outline")} onClick={onOpenStudio}>{t("Open Theme Studio")}</button>
            </div>
            <label className={classes(cl("row"), cl("in"))} style={at(6)}>
                <span className={cl("row-text")}>
                    <span className={cl("row-title")}>{t("Pixel style")}</span>
                    <span className={cl("row-hint")}>{t("Pixel corners, icons and lettering in Endcord's screens, like the installer")}</span>
                </span>
                <Switch checked={settings.pixelStyle} onChange={on => settings.pixelStyle = on} />
            </label>
        </>
    );
}

/** The packs as the installer lists Discords: a square check, the name, how many plugins and what they do */
function Packs({ packs, selected, locked, onToggle }: { packs: StarterPack[]; selected: ReadonlySet<string>; locked: boolean; onToggle(id: string): void; }) {
    const { t } = useI18n();

    return (
        <ul className={cl("packs")}>
            {packs.map(({ id, name, description, plugins, recommended }, index) => {
                const on = selected.has(id);
                return (
                    <li key={id} className={classes(cl("in"), recommended && cl("wide"))} style={at(index)}>
                        <button
                            className={cl("pack", { "pack-on": on })}
                            aria-pressed={on}
                            aria-disabled={locked || undefined}
                            title={plugins.join(", ")}
                            onClick={() => !locked && onToggle(id)}
                        >
                            <span className={cl("box")} aria-hidden="true">
                                <svg viewBox="0 0 16 16"><path d="m3.8 8.4 2.7 2.7 5.7-6.2" pathLength={1} /></svg>
                            </span>
                            <span className={cl("pack-text")}>
                                <span className={cl("pack-name")}>
                                    {t(name)}
                                    {recommended && <span className={cl("tag")}>{t("Recommended")}</span>}
                                    <span className={cl("pack-count")}>{t("{count} plugins", { count: plugins.length })}</span>
                                </span>
                                <span className={cl("pack-about")}>{t(description)}</span>
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

function Fact({ label, index, children }: { label: ReactNode; index: number; children: ReactNode; }) {
    return (
        <div className={classes(cl("fact"), cl("in"))} style={at(index)}>
            <dt className={cl("fact-label")}>{label}</dt>
            <dd className={cl("fact-text")}>{children}</dd>
        </div>
    );
}

function Done({ added, restartNeeded }: { added: number; restartNeeded: boolean; }) {
    const { t } = useI18n();
    const count = useRollingNumber(added, 0);
    const paletteKeys = IS_MAC ? ["⌘", "Shift", "P"] : ["Ctrl", "Shift", "P"];

    return (
        <>
            <div className={cl("done-head")}>
                <div className={cl("done-text")}>
                    <h2 className={classes(cl("heading"), cl("count"), cl("in"))}>
                        {added ? t("{count} plugins are on", { count }) : t("You're set")}
                    </h2>
                    <p className={classes(cl("text"), cl("in"))} style={at(1)}>
                        {added ? t("Endcord is ready. Everything you picked can be changed in Settings.") : t("No plugins yet. They're all waiting in Settings.")}
                    </p>
                    {restartNeeded && (
                        <p className={classes(cl("note"), cl("in"))} style={at(2)}>
                            {t("Some of them change Discord's own code, so they start after a restart.")}
                        </p>
                    )}
                </div>
                <span className={cl("done-panda")} aria-hidden="true"><EndcordMark width={68} /></span>
            </div>
            <p className={classes(cl("label"), cl("in"))} style={at(3)}>{t("Good to know")}</p>
            <dl className={cl("facts")}>
                <Fact index={4} label={t("Control Center")}>
                    {t("The panda at the top of the window opens it: looks, profiles, Game Mode and memory in one place.")}
                </Fact>
                {isPluginEnabled("CommandPalette") && (
                    <Fact index={5} label={paletteKeys.map(key => <kbd key={key} className={cl("key")}>{key}</kbd>)}>
                        {t("The command palette finds settings, channels and actions as you type.")}
                    </Fact>
                )}
                <Fact index={6} label={t("Safe mode")}>
                    {t("If a plugin ever keeps Discord from starting, Endcord starts without plugins and shows you which one it was.")}
                </Fact>
            </dl>
        </>
    );
}

function Welcome({ onClosed }: { onClosed(): void; }) {
    const { t } = useI18n();
    const packs = useStarterPacks();
    const studio = useMemo(getStudio, []);
    // Without Theme Studio there are no looks to pick, so that step is left out
    const afterHello = studio ? Step.Look : Step.Plugins;
    // The same total the Plugins tab shows
    const pluginCount = Object.keys(Plugins).length;
    const [step, setStep] = useState(Step.Hello);
    const [direction, setDirection] = useState<"forward" | "back">("forward");
    // The recommended pack starts picked, the way most people want it
    const [selected, setSelected] = useState(() => new Set(packs.filter(pack => pack.recommended).map(pack => pack.id)));
    const [result, setResult] = useState<{ added: number; restartNeeded: boolean; }>();
    const [busy, setBusy] = useState<{ done: number; total: number; }>();
    const [leaving, setLeaving] = useState(false);
    // Theme Studio opens as Discord's own dialog, under this one, so this steps aside until it's closed
    const [away, setAway] = useState(false);
    const awayRef = useRef(false);
    awayRef.current = away;
    const busyRef = useRef(false);
    busyRef.current = !!busy;
    const steps = studio ? STEPS : STEPS.filter(({ step }) => step !== Step.Look);
    const root = useRef<HTMLDivElement>(null);
    const card = useRef<HTMLDivElement>(null);
    // The card's height before a step changes, so it can grow or shrink to the next one instead of jumping
    const heightBefore = useRef<number | undefined>(undefined);

    const additions = useMemo(() => getPackAdditions(packs.filter(pack => selected.has(pack.id))).length, [packs, selected]);
    const shownAdditions = useRollingNumber(additions);

    const go = (next: Step) => {
        heightBefore.current = card.current?.getBoundingClientRect().height;
        setDirection(next > step ? "forward" : "back");
        setStep(next);
    };

    useLayoutEffect(() => {
        const node = card.current;
        const from = heightBefore.current;
        heightBefore.current = undefined;
        if (!node || from == null || prefersLessMotion()) return;

        const to = node.getBoundingClientRect().height;
        if (Math.abs(to - from) < 2) return;
        // No scrollbar flashing up while the new screen is taller than the card on its way there
        node.classList.add(cl("resizing"));
        const resize = node.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: RESIZE_TIME, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
        resize.onfinish = resize.oncancel = () => node.classList.remove(cl("resizing"));
    }, [step]);

    const openStudio = () => {
        setAway(true);
        studio?.openStudio(() => setAway(false));
    };

    // Inert while away, so the focus and the keyboard go to Theme Studio, and back here after it
    useEffect(() => {
        const node = root.current;
        if (!node) return;
        node.inert = away;
        if (away) (document.activeElement as HTMLElement | null)?.blur();
        else node.querySelector<HTMLElement>(".ec-welcome-primary")?.focus({ preventScroll: true });
    }, [away]);

    const close = () => {
        Settings.welcomePending = false;
        setLeaving(true);
        // After the fade, which takes no time at all when motion is reduced and then never says it ended
        setTimeout(onClosed, prefersLessMotion() ? 0 : FADE_OUT_TIME);
    };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            // Theme Studio has the keyboard while it's open
            if (awayRef.current) return;

            if (event.key === "Escape") {
                event.stopPropagation();
                if (!busyRef.current) close();
                return;
            }

            // The keyboard stays in here instead of wandering into Discord behind it, and from now on shows where it is
            if (event.key === "Tab" && root.current) {
                root.current.dataset.keys = "";
                const focusable = [...root.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])")]
                    .filter(node => node.offsetParent !== null);
                if (!focusable.length) return;
                const first = focusable[0], last = focusable[focusable.length - 1];
                const inside = root.current.contains(document.activeElement);
                if (event.shiftKey && (document.activeElement === first || !inside)) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, []);

    // Each screen starts at its top, and the way on has the focus, so Enter takes the next step
    useEffect(() => {
        root.current?.querySelector<HTMLElement>(".ec-welcome-body")?.scrollTo(0, 0);
        root.current?.querySelector<HTMLElement>(".ec-welcome-footer .ec-welcome-primary")?.focus({ preventScroll: true });
    }, [step]);

    async function addPacks() {
        if (busyRef.current) return;
        const chosen = packs.filter(pack => selected.has(pack.id));
        if (!chosen.length) {
            setResult({ added: 0, restartNeeded: false });
            return go(Step.Done);
        }

        busyRef.current = true;
        setBusy({ done: 0, total: additions });
        const began = performance.now();
        const applied = await addStarterPacksGradually(chosen, (done, total) => setBusy({ done, total }));
        const rest = MIN_BUSY_TIME - (performance.now() - began);
        if (rest > 0 && !prefersLessMotion()) await sleep(rest);

        setResult({ added: applied.turnedOn, restartNeeded: applied.restartNeeded });
        setBusy(undefined);
        go(Step.Done);
    }

    const skip = <button className={classes(cl("quiet"), cl("skip"))} disabled={!!busy} onClick={close}>{t("Skip setup")}</button>;
    const forward = (label: string, onClick: () => void) => (
        <button className={cl("primary", "primary-go")} onClick={onClick}>
            {label}
            <ChevronRightIcon width={16} className={cl("go-arrow")} />
        </button>
    );

    const footer = () => {
        switch (step) {
            case Step.Hello:
                return <>{skip}{forward(t("Get started"), () => go(afterHello))}</>;
            case Step.Look:
                return (
                    <>
                        {skip}
                        <button className={cl("quiet")} onClick={() => go(Step.Hello)}>{t("Back")}</button>
                        {forward(t("Next"), () => go(Step.Plugins))}
                    </>
                );
            case Step.Plugins: {
                const fraction = busy?.total ? busy.done / busy.total : 0;
                return (
                    <>
                        {skip}
                        <button className={cl("quiet")} disabled={!!busy} onClick={() => go(studio ? Step.Look : Step.Hello)}>{t("Back")}</button>
                        <button className={cl("primary", "primary-wide", { "primary-busy": !!busy })} aria-busy={!!busy} onClick={addPacks}>
                            <span className={cl("busy-fill")} style={{ transform: `scaleX(${fraction})` }} />
                            <span className={cl("primary-label")} aria-live="polite">
                                {busy
                                    ? t("Turning on {done}/{total}", { done: busy.done, total: busy.total })
                                    : selected.size ? t("Turn on {count} plugins", { count: shownAdditions }) : t("Continue without plugins")}
                            </span>
                        </button>
                    </>
                );
            }
            case Step.Done:
                return result?.restartNeeded
                    ? (
                        <>
                            <button className={cl("quiet")} onClick={close}>{t("Later")}</button>
                            <button
                                className={cl("primary")}
                                onClick={() => {
                                    Settings.welcomePending = false;
                                    relaunch();
                                }}
                            >
                                {t("Restart Discord to finish")}
                            </button>
                        </>
                    )
                    : <button className={cl("primary")} onClick={close}>{t("Start using Discord")}</button>;
        }
    };

    const current = steps.findIndex(entry => entry.step === step);

    return (
        <div
            ref={root}
            className={classes(cl("root", { "root-see-through": step === Step.Look, leaving, away }), ENDCORD_THEME)}
            role="dialog"
            aria-modal="true"
            aria-hidden={away || undefined}
            aria-label={t("Welcome to Endcord")}
        >
            <div ref={card} className={cl("card")}>
                <header className={cl("header")}>
                    <span className={cl("brand")}>
                        <EndcordMark width={17} />
                        Endcord
                    </span>
                    {step !== Step.Hello && (
                        <Steps
                            steps={steps}
                            current={current}
                            // Back to an earlier step, until the plugins are on
                            onPick={step !== Step.Done && !busy ? go : undefined}
                        />
                    )}
                </header>

                <div key={step} className={cl("body", `body-${direction}`)}>
                    {step === Step.Hello && <Hello pluginCount={pluginCount} />}
                    {step === Step.Look && studio && <Look studio={studio} onOpenStudio={openStudio} />}
                    {step === Step.Plugins && (
                        <>
                            <h2 className={classes(cl("heading"), cl("in"))}>{t("Pick what it does")}</h2>
                            <p className={classes(cl("text"), cl("in"))} style={at(1)}>{t("Start with a pack or two. All {count} plugins are in Settings, and any of them turns off with one click.", { count: pluginCount })}</p>
                            <Packs
                                packs={packs}
                                selected={selected}
                                locked={!!busy}
                                onToggle={id => setSelected(prev => {
                                    const next = new Set(prev);
                                    next.has(id) ? next.delete(id) : next.add(id);
                                    return next;
                                })}
                            />
                        </>
                    )}
                    {step === Step.Done && <Done added={result?.added ?? 0} restartNeeded={!!result?.restartNeeded} />}
                </div>

                <footer className={cl("footer")}>{footer()}</footer>
            </div>
        </div>
    );
}

/**
 * Resolves once Discord has settled: a run of smooth frames in a row, or after a few seconds at most. Discord is
 * busiest right after it starts, and an entrance during that stutters. While the window is hidden no frames come, so
 * this also waits until someone can see it
 */
function whenCalm(frames = 12, limit = 5000) {
    return new Promise<void>(resolve => {
        const end = performance.now() + limit;
        let last = performance.now(), smooth = 0;
        const tick = (now: number) => {
            smooth = now - last < 34 ? smooth + 1 : 0;
            last = now;
            if (smooth >= frames || now > end) resolve();
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

/** On a fresh install, once Discord is up. Someone who already set Endcord up never sees it */
export async function maybeShowWelcome() {
    if (!Settings.welcomePending || getIsEndcordHidden()) return;
    await whenCalm();
    if (!Settings.welcomePending || getIsEndcordHidden() || document.querySelector(".ec-welcome-root")) return;

    enableScreenStyles();
    const container = document.createElement("div");
    document.body.append(container);

    const root = createRoot(container);
    const onClosed = () => {
        root.unmount();
        container.remove();
    };

    root.render(
        <ErrorBoundary noop>
            <Welcome onClosed={onClosed} />
        </ErrorBoundary>
    );
}
