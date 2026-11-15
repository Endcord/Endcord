/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Now and then the panda somersaults along the bottom of Discord, and clicking it catches it. A hidden plugin that is
// on by default, so its code sits with the plugins' instead of in the script every start runs. Settings.pandaVisits
// (the Endcord tab) turns the visits off; "panda roll" or "panda party" typed outside a text field, or tumble() in the
// console, calls it. Its styles are with the other easter eggs, in @components/delight

import * as DataStore from "@api/DataStore";
import { getIsEndcordHidden } from "@api/EndcordVisibility";
import { Settings } from "@api/Settings";
import { bambooRain, floatHearts, peek } from "@components/delight";
import { EndcordMark } from "@components/EndcordIcons";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { classNameFactory, ENDCORD_THEME } from "@utils/css";
import { t } from "@utils/i18n";
import { classes } from "@utils/misc";
import definePlugin from "@utils/types";
import { ApplicationStreamingStore, createRoot, useEffect, useMemo, useRef, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { COLUMNS, frame, FUR, GOLDEN_FUR, type Pose, ROWS } from "./art";

const cl = classNameFactory("ec-delight-");

const MINUTE = 60_000;
// Minutes until a visit: the first in a session, the ones after it, and a retry when now isn't a good time
const FIRST_VISIT: [number, number] = [30, 90];
const NEXT_VISIT: [number, number] = [120, 300];
const RETRY_VISIT: [number, number] = [5, 10];
// It flips over the message box, so not while someone is typing
const QUIET_TIME = 30_000;
// Screen pixels per art pixel, for the panda and its babies
const PIXEL = 3;
const BABY_PIXEL = 2;
// In art pixels: how far a flip goes, how high it jumps, and how far down a panda lying on its side reaches
const FLIP_LENGTH = 72;
const FLIP_HEIGHT = 22;
const LYING_DROP = 4;
const FLIP_TIME = 720;
// Parts of a flip: crouch, leave the ground, top of the jump, land, squash down
const CROUCH = 0.1;
const TAKEOFF = 0.2;
const APEX = 0.52;
const LAND = 0.84;
const SETTLE = 0.92;
const RISE = "cubic-bezier(0.3, 0.7, 0.6, 1)";
const FALL = "cubic-bezier(0.4, 0, 0.7, 0.3)";
// Asleep it rolls curled up instead, this many screen pixels a millisecond
const ROLL_SPEED = 0.16;
const BABY_DELAY = 420;
const HI_TIME = 1_600;
const WAVE_TIME = 200;
const OOPS_TIME = 1_100;
const CAUGHT_TIME = 1_500;
const GOLDEN_CHANCE = 1 / 40;
const CAUGHT_KEY = "Endcord_pandasCaught";
const GOLDEN_KEY = "Endcord_goldenPandasCaught";
// Animations of which frame shows, which a catch drops instead of keeping
const FRAME = "frame";
const CALLS: [string, () => void][] = [["panda roll", () => roll()], ["panda party", () => roll({ party: true })]];
const LONGEST_CALL = Math.max(...CALLS.map(([word]) => word.length));

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const prefersLessMotion = () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTyping = (element: Element | null) => element instanceof HTMLElement && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName));

function mount(content: ReactNode) {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    root.render(<ErrorBoundary noop>{content}</ErrorBoundary>);

    return () => {
        root.unmount();
        container.remove();
    };
}

/** The same days and lines as seasonalLine in @components/delight: on these the panda always stops to say it */
function holidayLine(date: Date) {
    switch (`${date.getMonth() + 1}-${date.getDate()}`) {
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

/** Pixel art with each run of one colour in a row drawn as one rect */
function Pixels({ rows, palette, pixel, className, style }: { rows: string[]; palette: Record<string, string>; pixel: number; className: string; style?: React.CSSProperties; }) {
    const rects: ReactNode[] = [];
    rows.forEach((row, y) => {
        for (let x = 0; x < row.length;) {
            let end = x + 1;
            while (row[end] === row[x]) end++;
            const fill = palette[row[x]];
            if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x + 0.02} height={1.02} fill={fill} />);
            x = end;
        }
    });

    return (
        <svg className={className} style={style} aria-hidden="true" width={COLUMNS * pixel} height={ROWS * pixel} viewBox={`0 0 ${COLUMNS} ${ROWS}`} shapeRendering="crispEdges">
            {rects}
        </svg>
    );
}

interface Roller {
    mover: Element;
    body: Element;
    squash: Element;
    pose: Element;
    tuck: Element;
    pixel: number;
}

interface FlipOptions {
    delay?: number;
    /** The last flip comes up short and it lands on its side */
    oops?: boolean;
    /** Where in the trip one flip is a double, from 0 to 1 */
    showOff?: number;
}

/** Flips from one spot to another, the number of flips that fits the distance */
function flipsBetween({ mover, body, squash, pose, tuck, pixel }: Roller, from: number, to: number, { delay = 0, oops = false, showOff }: FlipOptions = {}) {
    const count = Math.max(1, Math.round(Math.abs(to - from) / (FLIP_LENGTH * pixel)));
    // Babies flip lower and a little quicker
    const flips = Array.from({ length: count }, () => ({ turns: 1, height: FLIP_HEIGHT * pixel, time: FLIP_TIME * (0.7 + 0.3 * pixel / PIXEL) }));
    if (showOff != null && count > 3) {
        const flip = flips[1 + Math.floor(showOff * (count - 2))];
        Object.assign(flip, { turns: 2, height: flip.height * 1.6, time: flip.time * 1.35 });
    }
    if (oops) flips[count - 1].turns = 0.75;

    const total = flips.reduce((sum, flip) => sum + flip.time, 0);
    const direction = Math.sign(to - from) || 1;
    const xs: Keyframe[] = [];
    const ys: Keyframe[] = [];
    const spins: Keyframe[] = [];
    const squashes: Keyframe[] = [{ offset: 0, transform: "scale(1, 1)" }];
    const tucked: Keyframe[] = [];
    let start = 0;
    let angle = 0;

    flips.forEach((flip, index) => {
        const at = (part: number) => Math.min(1, (start + part * flip.time) / total);
        const fall = oops && index === count - 1;
        const settle = fall ? "scale(1, 1)" : "scale(1.14, 0.84)";

        xs.push({ offset: at(TAKEOFF), translate: `${from + (to - from) * index / count}px` }, { offset: at(LAND), translate: `${from + (to - from) * (index + 1) / count}px` });
        ys.push(
            { offset: at(TAKEOFF), transform: "translateY(0px)", easing: RISE },
            { offset: at(APEX), transform: `translateY(${-flip.height}px)`, easing: FALL },
            { offset: at(LAND), transform: `translateY(${fall ? LYING_DROP * pixel : 0}px)` }
        );
        spins.push({ offset: at(TAKEOFF), transform: `rotate(${angle}deg)` });
        angle += flip.turns * 360 * direction;
        spins.push({ offset: at(LAND), transform: `rotate(${angle}deg)` });
        squashes.push(
            { offset: at(CROUCH), transform: "scale(1.12, 0.84)" },
            { offset: at(TAKEOFF), transform: "scale(0.9, 1.12)" },
            { offset: at(TAKEOFF + 0.1), transform: "scale(1, 1)" },
            { offset: at(LAND), transform: "scale(1, 1)" },
            { offset: at(SETTLE), transform: settle },
            { offset: at(1), transform: "scale(1, 1)" }
        );
        // Tucked in the air, in two keyframes at one offset for a cut instead of a fade
        const up = at(TAKEOFF + 0.04), down = at(LAND - 0.06);
        tucked.push({ offset: up, opacity: 0 }, { offset: up, opacity: 1 }, { offset: down, opacity: 1 }, { offset: down, opacity: 0 });
        start += flip.time;
    });

    // Held from the start and to the end
    const whole = (keyframes: Keyframe[]) => [{ ...keyframes[0], offset: 0 }, ...keyframes, { ...keyframes[keyframes.length - 1], offset: 1 }];
    const timing = { duration: total, delay, fill: "both" as const };
    const frames = { ...timing, id: FRAME };

    return [
        mover.animate(whole(xs), timing),
        mover.animate(whole(ys), timing),
        body.animate(whole(spins), timing),
        squash.animate(squashes, timing),
        tuck.animate(whole(tucked), frames),
        pose.animate(whole(tucked.map(keyframe => ({ ...keyframe, opacity: 1 - Number(keyframe.opacity) }))), frames)
    ];
}

/** Asleep, curled up: turns to match the distance, so it rolls instead of sliding */
function rollAlong({ mover, body, pixel }: Roller, from: number, to: number, delay = 0) {
    const angle = (to - from) / (Math.PI * 20 * pixel) * 360;
    const timing = { duration: Math.abs(to - from) / ROLL_SPEED, delay, fill: "both" as const };

    return [
        mover.animate([{ translate: `${from}px` }, { translate: `${to}px` }], timing),
        body.animate([{ transform: "rotate(0deg)" }, { transform: `rotate(${angle}deg)` }], timing)
    ];
}

/** Up from lying on its side with a little hop */
function getUp({ mover, body, squash, pixel }: Roller, direction: number) {
    const timing = { duration: 560, fill: "both" as const };

    return [
        mover.animate([
            { transform: `translateY(${LYING_DROP * pixel}px)`, easing: RISE },
            { offset: 0.45, transform: `translateY(${-8 * pixel}px)`, easing: FALL },
            { offset: 0.8, transform: "translateY(0px)" },
            { transform: "translateY(0px)" }
        ], timing),
        body.animate([{ transform: `rotate(${270 * direction}deg)` }, { offset: 0.8, transform: `rotate(${360 * direction}deg)` }, { transform: `rotate(${360 * direction}deg)` }], timing),
        squash.animate([{ transform: "scale(1, 1)" }, { offset: 0.8, transform: "scale(1, 1)" }, { offset: 0.9, transform: "scale(1.12, 0.86)" }, { transform: "scale(1, 1)" }], timing)
    ];
}

const matrixOf = (element: Element) => {
    const { transform } = getComputedStyle(element);
    return new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
};

/** Down to the ground where it is, upright */
function settle({ mover, body, squash }: Roller) {
    const { f: height } = matrixOf(mover);
    const { a, b } = matrixOf(body);

    mover.animate([{ transform: `translateY(${height}px)` }, { transform: "translateY(0px)" }], { duration: 160 + Math.abs(height) * 2.4, easing: height < 0 ? "cubic-bezier(0.5, 0, 0.9, 0.5)" : "ease-out", fill: "forwards" });
    body.animate([{ transform: `rotate(${Math.atan2(b, a) * 180 / Math.PI}deg)` }, { transform: "rotate(0deg)" }], { duration: 320, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)", fill: "forwards" });
    squash.animate([{ transform: getComputedStyle(squash).transform }, { transform: "scale(1, 1)" }], { duration: 160, fill: "forwards" });
}

/** Holds each animation where it is, so the next can take over from there */
function stopAll(animations: Animation[]) {
    for (const animation of animations) {
        if (animation.id !== FRAME) {
            try {
                animation.commitStyles();
            } catch { }
        }
        animation.cancel();
    }
}

const caughtThisSession: Record<string, number> = {};

async function countCatch(key: string) {
    try {
        const count = ((await DataStore.get<number>(key)) ?? 0) + 1;
        await DataStore.set(key, count);
        return count;
    } catch {
        caughtThisSession[key] = (caughtThisSession[key] ?? 0) + 1;
        return caughtThisSession[key];
    }
}

async function caughtLine(golden: boolean) {
    const count = await countCatch(golden ? GOLDEN_KEY : CAUGHT_KEY);
    if (golden) {
        bambooRain();
        return count === 1 ? t("a golden panda! ✨ they're rare") : t("{count} golden pandas caught ✨", { count });
    }
    if (count === 1) return t("you caught me! 🐼");
    if (count === 10) return t("{count} pandas caught! you're a natural 🎋", { count });
    if (count % 25 === 0) {
        bambooRain();
        return t("{count} pandas! the bamboo is on me 🎋", { count });
    }
    return t("{count} pandas caught 🐼", { count });
}

interface Visit {
    fromLeft: boolean;
    babies: number;
    /** Stops in the middle to say this */
    greeting?: string;
    asleep: boolean;
    golden: boolean;
    /** Where in the trip it lands on its side, from 0 to 1 */
    oops?: number;
    showOff?: number;
}

function Figure({ pixel, pose, asleep, curled, golden }: { pixel: number; pose: Pose; asleep: boolean; curled: boolean; golden: boolean; }) {
    const palette = golden ? GOLDEN_FUR : FUR;
    const standing = useMemo(() => frame(pose, asleep), [pose, asleep]);
    const tucked = useMemo(() => frame("tuck", asleep), [asleep]);

    return (
        <span className={cl("squash")}>
            <Pixels className={cl("pose")} rows={standing} palette={palette} pixel={pixel} style={curled ? { opacity: 0 } : undefined} />
            <Pixels className={cl("tuck")} rows={tucked} palette={palette} pixel={pixel} style={curled ? { opacity: 1 } : undefined} />
        </span>
    );
}

function VisitingPanda({ visit: { fromLeft, babies, greeting, asleep, golden, oops, showOff }, onDone }: { visit: Visit; onDone(): void; }) {
    const container = useRef<HTMLDivElement>(null);
    const [pose, setPose] = useState<Pose>("stand");
    const [awake, setAwake] = useState(!asleep);
    const [curled, setCurled] = useState(asleep);
    const [line, setLine] = useState<string>();
    const caught = useRef(false);
    const running = useRef<Animation[]>([]);
    const waving = useRef<ReturnType<typeof setInterval>>(undefined);

    // The panda is the last one drawn, so it's in front of its babies
    const rollers = (): Roller[] => Array.from(container.current!.children).reverse().map((mover, index) => {
        const part = (name: string) => mover.querySelector(`.${cl(name)}`)!;
        return { mover, body: part("roller-body"), squash: part("squash"), pose: part("pose"), tuck: part("tuck"), pixel: index ? BABY_PIXEL : PIXEL };
    });
    // Just off screen on either side
    const edges = (pixel: number): [number, number] => {
        const width = COLUMNS * pixel;
        return fromLeft ? [-width - 8, innerWidth + 8] : [innerWidth + 8, -width - 8];
    };
    const play = (animations: Animation[]) => {
        stopAll(running.current);
        running.current = animations;
        return Promise.all(animations.map(animation => animation.finished));
    };
    const stopWaving = () => {
        clearInterval(waving.current);
        setPose("stand");
    };

    useEffect(() => {
        const all = rollers();
        const [panda] = all;
        const [start, end] = edges(PIXEL);

        (async () => {
            if (asleep) {
                await play(all.flatMap((roller, index) => rollAlong(roller, ...edges(roller.pixel), index * BABY_DELAY * 2)));
            } else if (greeting) {
                const middle = (innerWidth - COLUMNS * PIXEL) / 2;
                await play(flipsBetween(panda, start, middle));
                if (caught.current) return;
                setLine(greeting);
                setPose("wave");
                waving.current = setInterval(() => setPose(now => now === "wave" ? "waveOut" : "wave"), WAVE_TIME);
                await wait(HI_TIME);
                if (caught.current) return;
                stopWaving();
                setLine(undefined);
                await play(flipsBetween(panda, middle, end));
            } else if (oops != null) {
                const spot = start + (end - start) * oops;
                await play(flipsBetween(panda, start, spot, { oops: true }));
                if (caught.current) return;
                setLine(t("i'm ok! 🐼"));
                await wait(OOPS_TIME);
                if (caught.current) return;
                setLine(undefined);
                await play(getUp(panda, Math.sign(end - start)));
                await play(flipsBetween(panda, spot, end));
            } else {
                await play(all.flatMap((roller, index) => flipsBetween(roller, ...edges(roller.pixel), { delay: index * BABY_DELAY, showOff: index ? undefined : showOff })));
            }
            if (!caught.current) onDone();
        })().catch(() => { });

        return () => clearInterval(waving.current);
    }, []);

    const catchPanda = async () => {
        if (caught.current) return;
        caught.current = true;
        clearInterval(waving.current);
        stopAll(running.current);
        running.current = [];

        // Wakes up, lands where it was caught and cheers, babies too
        setLine(undefined);
        setAwake(true);
        setCurled(false);
        setPose("cheer");
        const all = rollers();
        all.forEach(settle);

        floatHearts(all[0].body);
        peek(await caughtLine(golden));
        await wait(CAUGHT_TIME);
        await Promise.all(all.map(({ mover }) => mover.animate([{ opacity: 1, transform: "translateY(0px)" }, { opacity: 0, transform: "translateY(24px)" }], { duration: 380, easing: "ease-in", fill: "forwards" }).finished));
        onDone();
    };

    const figure = (pixel: number) => <Figure pixel={pixel} pose={pose} asleep={!awake} curled={curled} golden={golden} />;

    return (
        <div ref={container} className={classes(cl("rollers", { curled }), ENDCORD_THEME)}>
            {Array.from({ length: babies }, (_, index) => (
                <div key={index} className={cl("roller")}>
                    <span className={cl("roller-body")}>{figure(BABY_PIXEL)}</span>
                </div>
            ))}
            <div className={cl("roller")}>
                {line && <div className={cl("bubble", "hi")} role="status">{line}</div>}
                <button className={cl("roller-body")} aria-label={t("Catch the panda")} onClick={catchPanda}>
                    {figure(PIXEL)}
                </button>
            </div>
        </div>
    );
}

let visiting = false;

function roll({ party = false } = {}) {
    if (visiting || getIsEndcordHidden()) return;
    if (prefersLessMotion()) {
        peek(t("consider it rolled 🌀"));
        return;
    }

    visiting = true;
    // Between midnight and five it rolls by curled up, asleep
    const asleep = !party && new Date().getHours() < 5;
    const greeting = asleep || party ? undefined : holidayLine(new Date()) ?? (Math.random() < 0.2 ? t("hi! 🐼") : undefined);
    const babies = party ? 2 : !greeting && Math.random() < 0.15 ? 1 : 0;
    const oops = !asleep && !greeting && !babies && Math.random() < 1 / 6 ? 0.35 + Math.random() * 0.3 : undefined;
    const showOff = Math.random() < 0.25 ? Math.random() : undefined;
    const visit: Visit = { fromLeft: Math.random() < 0.5, babies, greeting, asleep, golden: Math.random() < GOLDEN_CHANCE, oops, showOff };

    const unmount = mount(<VisitingPanda visit={visit} onDone={() => setTimeout(() => {
        visiting = false;
        unmount();
    })} />);
}

let visitTimer: ReturnType<typeof setTimeout> | undefined;
let lastKeyAt = 0;

function scheduleVisit([min, max]: [number, number]) {
    clearTimeout(visitTimer);
    visitTimer = setTimeout(visit, (min + Math.random() * (max - min)) * MINUTE);
}

function visit() {
    if (!Settings.pandaVisits || getIsEndcordHidden() || prefersLessMotion()) return scheduleVisit(NEXT_VISIT);

    const busy = Date.now() - lastKeyAt < QUIET_TIME
        || document.visibilityState !== "visible"
        || !document.hasFocus()
        || document.fullscreenElement !== null
        // A shared screen would show it to the whole call
        || Boolean(ApplicationStreamingStore?.getCurrentUserActiveStream?.());
    if (busy) return scheduleVisit(RETRY_VISIT);

    roll();
    scheduleVisit(NEXT_VISIT);
}

let typed = "";

// Capture phase, before Discord's own handlers, which may keep the message box's keys to themselves
function onKeyDown({ key }: KeyboardEvent) {
    lastKeyAt = Date.now();
    // Browsers send keyless events for things like autofill
    if (!key || key.length !== 1 || isTyping(document.activeElement)) return;

    typed = (typed + key.toLowerCase()).slice(-LONGEST_CALL);
    const call = CALLS.find(([word]) => typed.endsWith(word));
    if (call) {
        typed = "";
        call[1]();
    }
}

/** The sleeping panda of an empty list, awake for a moment when clicked (the Plugins tab) */
function SleepyPanda({ size }: { size: number; }) {
    const [awake, setAwake] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    const wake = () => {
        setAwake(true);
        peek(t("zzz… huh? nothing here. try another word 🐼"));
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setAwake(false), 3_200);
    };

    return (
        <button className={cl("sleepy")} aria-label={t("Boop the panda")} onClick={wake}>
            <EndcordMark width={size} asleep={!awake} />
        </button>
    );
}

export default definePlugin({
    name: "PandaVisits",
    description: "Now and then a panda flips along the bottom of Discord. Click it to catch it",
    authors: [Devs.rootpoi],
    hidden: true,
    enabledByDefault: true,

    SleepyPanda,

    start() {
        document.addEventListener("keydown", onKeyDown, { capture: true, passive: true });
        Object.assign(window, { tumble: () => (roll(), "🐼") });
        if (!IS_REPORTER) scheduleVisit(FIRST_VISIT);
    },

    stop() {
        document.removeEventListener("keydown", onKeyDown, { capture: true });
        Reflect.deleteProperty(window, "tumble");
        clearTimeout(visitTimer);
    }
});
