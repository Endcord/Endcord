/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { getIsEndcordHidden } from "@api/EndcordVisibility";
import ErrorBoundary from "@components/ErrorBoundary";
import { HEART_PALETTE, HEART_ROWS, PANDA_PALETTE, PANDA_ROWS, PixelArt } from "@components/settings/SpecialCard";
import { classNameFactory, ENDCORD_THEME } from "@utils/css";
import { t } from "@utils/i18n";
import { createKeySequence } from "@utils/keySequence";
import { Logger } from "@utils/Logger";
import { classes } from "@utils/misc";
import { createRoot, useEffect, useMemo, useRef, useState } from "@webpack/common";
import type { ReactNode } from "react";

// Small surprises for curious people, the same ones the site has. Nothing here loads anything or sends data anywhere,
// and apart from a yawn in an idle settings tab, all of it answers something the person did

const cl = classNameFactory("ec-delight-");
const logger = new Logger("Endcord", "#9ccbff");

const PEEK_TIME = 3_200;
const IDLE_TIME = 90_000;
const RAIN_PIECES = 30;
const RAIN_TIME = 5_000;
const HEART_COUNT = 6;
const HEART_TIME = 1_500;
const VERSION_TAPS = 3;
const VERSION_TAP_WINDOW = 1_500;
// Five boops this close together and the panda gives in
const BOOP_STREAK = 5;
const BOOP_WINDOW = 4_000;
const ROLL_TIME = 1_100;

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

const BAMBOO_PALETTE = { G: "#74D49A", D: "#4FAE78", L: "#9CE8BB" };
const BAMBOO_ROWS = ["...GG..", "...GD..", ".L.GG..", "LL.GD..", ".LLGG..", "...DD..", "...GG.L", "...GDLL", "...GGL.", "...GD..", "...GG..", "...DD.."];
const LEAF_ROWS = ["......LL", "...LLLL.", ".LLGGL..", "LGGLL...", "LL......"];

const prefersLessMotion = () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTyping = (element: Element | null) => element instanceof HTMLElement && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName));
const isSettingsTabOpen = () => document.querySelector(".vc-settings-tab") !== null;

function mount(content: ReactNode) {
    const container = document.createElement("div");
    document.body.append(container);

    const root = createRoot(container);
    root.render(<ErrorBoundary noop>{content}</ErrorBoundary>);

    return () => {
        root.unmount();
        container.remove();
    };
}

let say: ((text: string, time: number) => void) | undefined;

function PandaPeek({ first, time }: { first: string; time: number; }) {
    const [text, setText] = useState(first);
    const [shown, setShown] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
        say = (next, ms) => {
            setText(next);
            setShown(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setShown(false), ms);
        };

        // A frame later, so the panda slides in instead of just being there
        requestAnimationFrame(() => say?.(first, time));

        return () => {
            say = undefined;
            clearTimeout(timer.current);
        };
    }, []);

    return (
        <div className={classes(cl("peek", { shown }), ENDCORD_THEME)}>
            <div className={cl("bubble")} role="status">{text}</div>
            <button className={cl("panda")} aria-label={t("Boop the panda")} onClick={boop}>
                <PixelArt rows={PANDA_ROWS} palette={PANDA_PALETTE} pixel={4} />
            </button>
        </div>
    );
}

/** A panda pops up from the bottom-right corner to say something */
export function peek(text: string, time = PEEK_TIME) {
    if (getIsEndcordHidden()) return;

    if (say) say(text, time);
    else mount(<PandaPeek first={text} time={time} />);
}

let boops: number[] = [];

export function boop() {
    const now = Date.now();
    boops = [...boops.filter(at => now - at < BOOP_WINDOW), now];

    if (boops.length >= BOOP_STREAK) {
        boops = [];
        bambooRain();
        peek(t("okay okay! have some bamboo 🎋"), 2_800);
        return;
    }

    const replies = [t("boop!"), t("hehe"), t("that tickles"), t("*munches bamboo*"), t("hi again!")];
    peek(replies[Math.floor(Math.random() * replies.length)], 2_200);
}

/** The whole window does a barrel roll, once */
export function barrelRoll() {
    const app = document.getElementById("app-mount");
    if (!app || prefersLessMotion() || app.classList.contains(cl("roll"))) return;

    app.classList.add(cl("roll"));
    setTimeout(() => app.classList.remove(cl("roll")), ROLL_TIME);
}

/** A line for days worth a line, or undefined */
export function seasonalLine(date: Date) {
    const day = `${date.getMonth() + 1}-${date.getDate()}`;

    switch (day) {
        case "1-1": return t("happy new year! 🎆");
        case "2-14": return t("you're my favorite person to boop 💙");
        case "4-1": return t("the panda is a raccoon now. (it isn't)");
        case "10-31": return t("boo! 🎃");
        case "12-24":
        case "12-25":
        case "12-26": return t("merry bamboo! 🎄");
        default: return undefined;
    }
}

function BambooRain() {
    const pieces = useMemo(() => Array.from({ length: RAIN_PIECES }, (_, index) => ({
        rows: index % 5 === 3 ? PANDA_ROWS : index % 2 ? LEAF_ROWS : BAMBOO_ROWS,
        palette: index % 5 === 3 ? PANDA_PALETTE : BAMBOO_PALETTE,
        pixel: index % 5 === 3 ? 2 : 3,
        style: {
            left: `${Math.random() * 100}vw`,
            animationDuration: `${2.4 + Math.random() * 2}s`,
            animationDelay: `${Math.random() * 1.2}s`,
            "--ec-spin": `${Math.round(Math.random() * 540 - 270)}deg`
        }
    })), []);

    return <>{pieces.map(({ rows, palette, pixel, style }, index) => <span key={index} className={cl("fall")} style={style}><PixelArt rows={rows} palette={palette} pixel={pixel} /></span>)}</>;
}

export function bambooRain() {
    if (getIsEndcordHidden()) return;

    if (prefersLessMotion()) {
        peek(t("bamboo for everyone 🎋"));
        return;
    }

    setTimeout(mount(<BambooRain />), RAIN_TIME);
}

/** Pixel hearts float up from an element */
export function floatHearts(element: Element) {
    if (prefersLessMotion()) return;

    const { left, top, width, height } = element.getBoundingClientRect();
    const hearts = Array.from({ length: HEART_COUNT }, (_, index) => (
        <span
            key={index}
            className={cl("heart")}
            style={{
                left: left + width / 2 - 9 + (Math.random() * 30 - 15),
                top: top + height / 3,
                animationDelay: `${index * 80}ms`,
                "--ec-drift": `${Math.round(Math.random() * 60 - 30)}px`
            } as React.CSSProperties}
        >
            <PixelArt rows={HEART_ROWS} palette={HEART_PALETTE} pixel={2} />
        </span>
    ));

    setTimeout(mount(<>{hearts}</>), HEART_TIME);
}

let versionTaps = 0;
let versionTimer: ReturnType<typeof setTimeout> | undefined;

/** Three quick clicks on the version number */
export function tapVersion() {
    versionTaps++;
    clearTimeout(versionTimer);
    versionTimer = setTimeout(() => versionTaps = 0, VERSION_TAP_WINDOW);

    if (versionTaps === VERSION_TAPS) {
        versionTaps = 0;
        peek(t("{version}, made with a lot of bamboo 🎋", { version: VERSION }));
    }
}

let yawned = false;
let greeted = false;

/** Sitting still in a settings tab for a while gets checked on, once */
export function useIdlePanda() {
    useEffect(() => {
        // On a day worth a line, the first settings tab of the session gets one
        if (!greeted) {
            greeted = true;
            const line = seasonalLine(new Date());
            if (line) setTimeout(() => peek(line), 1_200);
        }

        if (yawned) return;

        let timer: ReturnType<typeof setTimeout>;
        const reset = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (!document.hasFocus()) return reset();

                yawned = true;
                stop();
                peek(t("*yawn* still there?"));
            }, IDLE_TIME);
        };
        const events = ["pointermove", "keydown", "wheel"];
        const stop = () => {
            clearTimeout(timer);
            events.forEach(event => removeEventListener(event, reset));
        };

        events.forEach(event => addEventListener(event, reset, { passive: true }));
        reset();

        return stop;
    }, []);
}

let reachedTheEnd = false;

/** Goes at the bottom of a long list, for the people who scroll all the way down */
export function EndOfListPanda() {
    const marker = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (reachedTheEnd || !marker.current) return;

        const observer = new IntersectionObserver(([{ isIntersecting }]) => {
            if (!isIntersecting) return;

            reachedTheEnd = true;
            observer.disconnect();
            peek(t("you made it to the end! 🐼"));
        });

        observer.observe(marker.current);
        return () => observer.disconnect();
    }, []);

    return <div ref={marker} />;
}

export function installDelight() {
    const panda = createKeySequence([..."panda"], () => peek(t("you called? 🐼")));
    const konami = createKeySequence(KONAMI, () => {
        bambooRain();
        setTimeout(() => peek(t("↑↑↓↓←→←→BA, a classic")), 1_400);
    });
    const typed = [
        createKeySequence([..."bamboo"], bambooRain),
        createKeySequence([..."endcord"], () => peek(t("that's my house! 🏠"))),
        createKeySequence([..."zzz"], () => peek(t("shh… the panda is napping 💤"))),
        createKeySequence([..."do a barrel roll"], () => {
            barrelRoll();
            if (prefersLessMotion()) peek(t("consider it rolled 🌀"));
        })
    ];

    document.addEventListener("keydown", ({ key }) => {
        // Browsers send keyless events for things like autofill
        if (!key || isTyping(document.activeElement)) return;

        const pressed = key.length === 1 ? key.toLowerCase() : key;
        panda(pressed);
        konami(pressed);
        typed.forEach(sequence => sequence(pressed));

        if (key === "?" && isSettingsTabOpen()) peek(t("psst: type \"panda\", or try ↑↑↓↓←→←→BA"), 5_200);
    });

    // For people who open the console
    Object.assign(window, {
        panda() {
            logger.log(`\n${PANDA_ROWS.map(row => row.replace(/[KkE]/g, "█").replace(/[Ww]/g, "░").replace(/P/g, "▒").replace(/\./g, " ")).join("\n")}`);
            return "🐼";
        },
        bamboo() {
            bambooRain();
            return "🎋";
        },
        pet() {
            peek(t("*happy panda noises*"));
            return "💙";
        },
        roll() {
            barrelRoll();
            return "🌀";
        }
    });

    logger.info("Hi there, curious one! Try panda(), bamboo(), pet() or roll() here.");
}
