/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const ONEKO_SCRIPT_URL = "https://raw.githubusercontent.com/adryd325/oneko.js/c4ee66353b11a44e4a5b7e914a81f8d33111555e/oneko.js";
const ONEKO_SCRIPT_SHA256 = "21c9b60ffdc9ae84fb00dd9105f6598acb4ede52fe309a12b67d550a4b4ebbfd";
const ONEKO_GIF_URL = "https://raw.githubusercontent.com/adryd325/oneko.js/14bab15a755d0e35cd4ae19c931d96d306f99f42/oneko.gif";

export default definePlugin({
    name: "oneko",
    description: "cat follow mouse (real)",
    tags: ["Fun", "Appearance"],
    // Listing adryd here because this literally just evals her script
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    async start() {
        const bytes = await fetch(ONEKO_SCRIPT_URL).then(x => x.arrayBuffer());
        const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        const hex = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
        if (hex !== ONEKO_SCRIPT_SHA256) throw new Error("oneko.js doesn't match its known hash");

        const script = new TextDecoder().decode(bytes)
            .replace("./oneko.gif", ONEKO_GIF_URL)
            .replace("(isReducedMotion)", "(false)");

        // eslint-disable-next-line no-eval -- only runs the exact file checked above
        (0, eval)(script);
    },

    stop() {
        document.getElementById("oneko")?.remove();
    }
});
