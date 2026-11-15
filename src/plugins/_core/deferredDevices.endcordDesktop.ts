/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Discord's web app lists the media devices and listens for device changes as soon as its media engine starts, and
// either one starts Chromium's video capture service: a process of its own, about 50 MB for the whole session, even
// for someone who never joins a call. Until the page uses the microphone, a camera or the screen, it gets the list the
// last real listing saved, and its devicechange listeners wait. The moment it does, the listeners are added, the real
// list takes over and a devicechange event makes Discord read it. Without a saved list (the first start) it gets what
// a browser gives a site before it may use media: one microphone and one speaker, with no IDs or names, which Discord's
// web app knows from every browser. A device plugged in while held back shows up once media is used

import { get as getStored, set as setStored } from "@api/DataStore";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const STORE_KEY = "EndcordDesktop_mediaDevices";

type SavedDevice = Pick<MediaDeviceInfo, "deviceId" | "groupId" | "kind" | "label">;
type Listener = [listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions];

const proto = MediaDevices.prototype;
const realEnumerate = proto.enumerateDevices;
const realAdd = EventTarget.prototype.addEventListener;
const realRemove = EventTarget.prototype.removeEventListener;
const handlerProperty = Object.getOwnPropertyDescriptor(proto, "ondevicechange");

let live = false;
let saved: Promise<SavedDevice[] | undefined> | undefined;
const heldListeners: Listener[] = [];
let heldHandler: unknown = null;

const toSaved = (list: MediaDeviceInfo[]): SavedDevice[] => list.map(({ deviceId, groupId, kind, label }) => ({ deviceId, groupId, kind, label }));
const UNNAMED: SavedDevice[] = (["audioinput", "audiooutput"] as const).map(kind => ({ deviceId: "", groupId: "", kind, label: "" }));

function goLive() {
    if (live) return;
    live = true;
    const devices = navigator.mediaDevices;
    if (!devices) return;
    for (const [listener, options] of heldListeners.splice(0)) realAdd.call(devices, "devicechange", listener, options);
    if (heldHandler) handlerProperty?.set?.call(devices, heldHandler);
    // After the call that started it, so Discord's own handler reads the real list
    setTimeout(() => devices.dispatchEvent(new Event("devicechange")));
}

function enumerateLive(this: MediaDevices) {
    return realEnumerate.call(this).then(list => {
        setStored(STORE_KEY, toSaved(list)).catch(() => { });
        return list;
    });
}

proto.enumerateDevices = function (this: MediaDevices) {
    if (live) return enumerateLive.call(this);
    saved ??= getStored<SavedDevice[]>(STORE_KEY).catch(() => undefined);
    return saved.then(list => {
        if (live) return enumerateLive.call(this);
        // Plain copies: what Discord reads of them is these four fields
        return (list?.length ? list : UNNAMED).map(device => ({ ...device, toJSON: () => device })) as unknown as MediaDeviceInfo[];
    });
};

proto.addEventListener = function (this: MediaDevices, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (!live && type === "devicechange") {
        heldListeners.push([listener, options]);
        return;
    }
    realAdd.call(this, type, listener, options);
};

proto.removeEventListener = function (this: MediaDevices, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    const held = type === "devicechange" ? heldListeners.findIndex(([l]) => l === listener) : -1;
    if (held !== -1) heldListeners.splice(held, 1);
    else realRemove.call(this, type, listener, options);
};

if (handlerProperty?.set) {
    Object.defineProperty(proto, "ondevicechange", {
        ...handlerProperty,
        get(this: MediaDevices) {
            return live ? handlerProperty.get?.call(this) : heldHandler;
        },
        set(this: MediaDevices, handler: unknown) {
            if (live) handlerProperty.set!.call(this, handler);
            else heldHandler = handler;
        }
    });
}

for (const name of ["getUserMedia", "getDisplayMedia"] as const) {
    const real = proto[name] as (...args: unknown[]) => Promise<MediaStream>;
    (proto as unknown as Record<string, unknown>)[name] = function (this: MediaDevices, ...args: unknown[]) {
        goLive();
        return real.apply(this, args);
    };
}

export default definePlugin({
    name: "DeferredDevices",
    description: "Holds back Chromium's video capture service in Endcord Desktop until the page uses media",
    authors: [Devs.rootpoi],
    required: true,
    hidden: true
});
