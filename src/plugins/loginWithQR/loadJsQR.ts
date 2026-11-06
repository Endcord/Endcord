/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type jsQRType from "jsqr";

// jsQR is only needed while a login QR code is being read, so it's loaded then instead of adding 128 KB to every
// Endcord install. The browser checks the file against its known hash (integrity) before running it. The web build
// keeps it bundled
const JSQR_URL = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
const JSQR_INTEGRITY = "sha256-vEDIoVGWI2sjFNsIVvcsoLSZgM1UE7jIUqc0n1/uCFk=";

type JsQR = typeof jsQRType;
let loading: Promise<JsQR> | undefined;

async function fetchJsQR(): Promise<JsQR> {
    if (IS_WEB) return (await import("jsqr")).default;

    const script = document.createElement("script");
    script.src = JSQR_URL;
    script.integrity = JSQR_INTEGRITY;
    script.crossOrigin = "anonymous";
    try {
        await new Promise<void>((resolve, reject) => {
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Couldn't load the QR reader"));
            document.head.append(script);
        });
    } finally {
        script.remove();
    }

    // The file is a UMD bundle: as a plain script it puts itself on window.jsQR
    const loaded = (window as unknown as { jsQR?: JsQR & { default?: JsQR; }; }).jsQR;
    const jsQR = loaded?.default ?? loaded;
    if (typeof jsQR !== "function") throw new Error("The QR reader didn't load");
    return jsQR;
}

/** jsQR, loaded once on first use */
export function loadJsQR() {
    loading ??= fetchJsQR().catch(e => {
        loading = undefined;
        throw e;
    });
    return loading;
}
