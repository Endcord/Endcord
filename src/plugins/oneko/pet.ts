/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// A pixel pet that trots after another pet, or after the pointer when it has nobody to follow.
// Pets are drawn on a 16 pixel grid, facing right; they're flipped to face left

export type Frame = "run1" | "run2" | "sit" | "sleep1" | "sleep2";

export interface Pet {
    id: string;
    /** One letter per colour used in the frames; "." is see-through */
    palette: Record<string, string>;
    frames: Record<Frame, string[]>;
    /** Element ids of the pets it follows, first one found wins */
    follows: string[];
    /** Pixels per tick */
    speed: number;
    /** Ticks of sitting still before it falls asleep */
    sleepAfter: number;
}

const SIZE = 32;
const TICK = 100;
/** How far beside its leader it stays */
const BESIDE = 34;
/** Close enough to its spot to sit down */
const KEEP = 6;

/** Each frame as an SVG picture, made once per pet */
function makeFrames(pet: Pet) {
    const urls = {} as Record<Frame, string>;
    for (const [frame, rows] of Object.entries(pet.frames) as [Frame, string[]][]) {
        const paths: Record<string, string> = {};
        rows.forEach((row, y) => [...row].forEach((cell, x) => {
            if (pet.palette[cell]) paths[cell] = `${paths[cell] ?? ""}M${x} ${y}h1v1h-1z`;
        }));
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${Object.entries(paths).map(([cell, d]) => `<path fill="${pet.palette[cell]}" d="${d}"/>`).join("")}</svg>`;
        urls[frame] = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    return urls;
}

export function startPet(pet: Pet) {
    const frames = makeFrames(pet);

    const el = document.createElement("div");
    el.id = pet.id;
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, {
        width: `${SIZE}px`,
        height: `${SIZE}px`,
        position: "fixed",
        pointerEvents: "none",
        imageRendering: "pixelated",
        backgroundSize: "100% 100%",
        zIndex: "2147483646",
        left: "48px",
        top: "48px"
    });
    document.body.append(el);

    // Where its element starts out (left and top are 48px), so the first frame is drawn in the window
    let x = 64, y = 64;
    let mouseX = x, mouseY = y;
    let idleTicks = 0;
    let step = 0;
    let facingLeft = false;

    const onMove = (event: MouseEvent) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
    };
    document.addEventListener("mousemove", onMove, { passive: true });

    // Asleep, a pet shows the same picture in the same place for minutes, so only what changed is written
    let shown = "";
    const show = (frame: Frame) => {
        const left = `${Math.round(x - SIZE / 2)}px`, top = `${Math.round(y - SIZE / 2)}px`;
        const key = `${frame} ${facingLeft} ${left} ${top}`;
        if (key === shown) return;
        shown = key;
        el.style.backgroundImage = frames[frame];
        el.style.transform = facingLeft ? "scaleX(-1)" : "";
        el.style.left = left;
        el.style.top = top;
    };

    // Which side of its leader it keeps to: behind it, so it's where the leader came from
    let side = -1;
    let lastLeaderX: number | undefined;

    const tick = () => {
        // Nobody sees it while Discord is minimised or in the tray
        if (document.hidden) return;

        // The leader walks to the pointer; the pet walks to a spot beside the leader, never on top of it
        let rect: DOMRect | undefined;
        for (const id of pet.follows) {
            rect = document.getElementById(id)?.getBoundingClientRect();
            if (rect?.width) break;
        }
        const leaderX = rect?.width ? rect.left + rect.width / 2 : mouseX;
        const leaderY = rect?.width ? rect.top + rect.height / 2 : mouseY;
        if (lastLeaderX != null && Math.abs(leaderX - lastLeaderX) > 2) side = leaderX > lastLeaderX ? -1 : 1;
        lastLeaderX = leaderX;

        // Its spot stays inside the window: by the left edge it keeps to the leader's right, and the other way round
        const half = SIZE / 2;
        if (leaderX + side * BESIDE < half) side = 1;
        else if (leaderX + side * BESIDE > innerWidth - half) side = -1;
        const spotX = Math.min(Math.max(leaderX + side * BESIDE, half), innerWidth - half);
        const spotY = Math.min(Math.max(leaderY + 4, half), innerHeight - half);

        const dx = spotX - x;
        const dy = spotY - y;
        const distance = Math.hypot(dx, dy);
        step++;

        if (distance < KEEP) {
            idleTicks++;
            // Sitting, it looks at its leader
            facingLeft = side > 0;
            if (idleTicks < pet.sleepAfter) return show("sit");
            return show(Math.floor(step / 6) % 2 ? "sleep2" : "sleep1");
        }

        idleTicks = 0;
        if (Math.abs(dx) > 2) facingLeft = dx < 0;
        const move = Math.min(pet.speed, distance);
        x += (dx / distance) * move;
        y += (dy / distance) * move;
        show(step % 2 ? "run2" : "run1");
    };

    show("sit");
    const timer = setInterval(tick, TICK);

    return () => {
        clearInterval(timer);
        document.removeEventListener("mousemove", onMove);
        el.remove();
    };
}
