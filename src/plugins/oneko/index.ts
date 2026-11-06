/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";

import { panda } from "./panda";
import { Pet, startPet } from "./pet";
import { puppy } from "./puppy";

const ONEKO_SCRIPT_URL = "https://raw.githubusercontent.com/adryd325/oneko.js/c4ee66353b11a44e4a5b7e914a81f8d33111555e/oneko.js";
const ONEKO_SCRIPT_SHA256 = "21c9b60ffdc9ae84fb00dd9105f6598acb4ede52fe309a12b67d550a4b4ebbfd";
const ONEKO_GIF_URL = "https://raw.githubusercontent.com/adryd325/oneko.js/14bab15a755d0e35cd4ae19c931d96d306f99f42/oneko.gif";

const logger = new Logger("oneko");

const pets = { puppy, panda } satisfies Record<string, Pet>;
const stopPet: Partial<Record<keyof typeof pets, () => void>> = {};
let running = false;
let catScript: string | undefined;
let catLoading = false;

function syncPet(name: keyof typeof pets) {
    const wanted = running && settings.store[name];
    if (wanted && !stopPet[name]) stopPet[name] = startPet(pets[name]);
    if (!wanted && stopPet[name]) {
        stopPet[name]!();
        delete stopPet[name];
    }
}

/** oneko.js, checked against its known hash, fetched once */
async function loadCatScript() {
    if (catScript) return catScript;
    const bytes = await fetch(ONEKO_SCRIPT_URL).then(x => x.arrayBuffer());
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hex = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
    if (hex !== ONEKO_SCRIPT_SHA256) throw new Error("oneko.js doesn't match its known hash");

    return catScript = new TextDecoder().decode(bytes)
        .replace("./oneko.gif", ONEKO_GIF_URL)
        .replace("(isReducedMotion)", "(false)");
}

/** CursorBuddy can show a cat of its own under the same element id. This one is marked, so each only removes its own */
const ourCat = () => document.querySelector("#oneko[data-ec-oneko]");

async function syncCat() {
    const wanted = running && settings.store.cat;
    // The cat's own loop ends by itself once its element is gone
    if (!wanted) return ourCat()?.remove();
    // With CursorBuddy's cat out, the puppy and the panda follow that one instead
    if (document.getElementById("oneko") || catLoading) return;

    catLoading = true;
    try {
        const script = await loadCatScript();
        if (!(running && settings.store.cat) || document.getElementById("oneko")) return;
        // eslint-disable-next-line no-eval -- only runs the exact file checked above
        (0, eval)(script);
        document.getElementById("oneko")?.setAttribute("data-ec-oneko", "");
    } catch (err) {
        // Offline, or the file changed: no cat this time, but the panda and the puppy still come. Turning the cat off
        // and on again tries once more
        logger.error("Couldn't load the cat:", err);
    } finally {
        catLoading = false;
    }
}

const settings = definePluginSettings({
    // Only the panda comes at first. The cat and the puppy are for turning on by hand
    cat: {
        type: OptionType.BOOLEAN,
        description: "The cat follows your mouse",
        default: false,
        onChange: syncCat
    },
    puppy: {
        type: OptionType.BOOLEAN,
        description: "A puppy follows the cat, or your mouse when the cat is off",
        default: false,
        onChange: () => syncPet("puppy")
    },
    panda: {
        type: OptionType.BOOLEAN,
        description: "The Endcord panda follows your mouse, or the others when they're on, and naps whenever it can",
        default: true,
        onChange: () => syncPet("panda")
    }
});

export default definePlugin({
    name: "oneko",
    description: "The Endcord panda follows your mouse. A cat and a puppy can join it from the settings",
    settings,
    tags: ["Fun", "Appearance"],
    // Listing adryd here because this literally just evals her script
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    async start() {
        running = true;
        syncPet("puppy");
        syncPet("panda");
        await syncCat();
    },

    stop() {
        running = false;
        syncPet("puppy");
        syncPet("panda");
        syncCat();
    }
});
