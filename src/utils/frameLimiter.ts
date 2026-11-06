/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

type FrameHost = Pick<Window, "requestAnimationFrame" | "cancelAnimationFrame" | "setTimeout" | "clearTimeout">;

/**
 * Chromium has no switch to cap a page's frame rate, but almost everything Discord animates asks for its frames through
 * requestAnimationFrame, so handing those out at a lower rate caps how often the interface redraws.
 *
 * Libraries keep their own reference to requestAnimationFrame, so this goes in before Discord's code loads, whether or
 * not a limit is ever set. With no limit it passes straight through.
 */
export function createFrameLimiter(host: FrameHost) {
    const nativeRequest = host.requestAnimationFrame.bind(host);
    const nativeCancel = host.cancelAnimationFrame.bind(host);

    let frameInterval = 0;
    let nextFrame = 0;
    let timer: number | undefined;
    // Negative, so they can never collide with the ids Chromium hands out
    let nextId = -1;
    let waiting = new Map<number, FrameRequestCallback>();

    function runFrame(time: number) {
        timer = undefined;
        // On a fixed timeline: the browser always adds a little delay, and measuring from the last frame would add it up
        nextFrame = Math.max(nextFrame + frameInterval, performance.now());

        const callbacks = waiting;
        waiting = new Map();

        for (const callback of callbacks.values()) {
            try {
                callback(time);
            } catch (error) {
                // One failing animation shouldn't take the others in this frame with it
                console.error(error);
            }
        }
    }

    function schedule() {
        timer ??= host.setTimeout(() => nativeRequest(runFrame), Math.max(0, nextFrame - performance.now()));
    }

    host.requestAnimationFrame = callback => {
        if (!frameInterval) return nativeRequest(callback);

        const id = nextId--;
        waiting.set(id, callback);
        schedule();

        return id;
    };

    host.cancelAnimationFrame = id => {
        if (id < 0) waiting.delete(id);
        else nativeCancel(id);
    };

    /** 0 lifts the limit */
    return function setFrameRate(framesPerSecond: number) {
        frameInterval = framesPerSecond ? 1000 / framesPerSecond : 0;
        nextFrame = 0;

        // Anything held back would otherwise wait for a timer that no longer matters
        if (!frameInterval && waiting.size) {
            if (timer !== undefined) host.clearTimeout(timer);
            timer = undefined;
            nativeRequest(runFrame);
        }
    };
}

export let setFrameRate: ReturnType<typeof createFrameLimiter> = () => { };

export function installFrameLimiter() {
    setFrameRate = createFrameLimiter(window);
}
