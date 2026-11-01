/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Throws hostile input at every validator and checks the promise each one makes, instead of checking examples.
// A failure prints its seed: ENDCORD_FUZZ_SEED=<seed> pnpm testFuzz replays exactly that run.
import { mkdtempSync, rmSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { isAbsolute, join, relative, sep } from "path";

const ROOT = join(import.meta.dirname, "..");
const require = createRequire(join(ROOT, "package.json"));
const esbuild = require("esbuild");

const SEED = Number(process.env.ENDCORD_FUZZ_SEED) || Date.now() % 2 ** 31;
const ROUNDS = Number(process.env.ENDCORD_FUZZ_ROUNDS) || 150_000;

const OUT = mkdtempSync(join(tmpdir(), "endcord-fuzz-"));
await esbuild.build({
    stdin: {
        contents: `
            export { isSafeExternalUrl, isSafeLink } from "./src/shared/externalLinks";
            export { isDiscordOrigin } from "./src/shared/trustedOrigins";
            export { redactSecrets } from "./src/shared/redact";
            export { ensureSafePath, isSafeFileName } from "./src/main/utils/ensureSafePath";
            export { isSecureCloudUrl } from "./src/api/SettingsSync/cloudUrl";
        `,
        resolveDir: ROOT,
        loader: "ts"
    },
    bundle: true, platform: "node", format: "cjs", outfile: join(OUT, "bundle.cjs"), tsconfig: join(ROOT, "tsconfig.json"), logLevel: "error"
});
const m = require(join(OUT, "bundle.cjs"));

// mulberry32: small, and the same seed always gives the same run
let state = SEED;
function random() {
    state = state + 0x6D2B79F5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const pick = list => list[Math.floor(random() * list.length)];
const repeat = (min, max, make) => Array.from({ length: min + Math.floor(random() * (max - min + 1)) }, make);

// What URL parsers strip or fold, and what path APIs treat specially
const IGNORED_BY_URL_PARSER = ["\t", "\n", "\r"];
const LEADING_JUNK = ["", " ", "\t", "\n", "\x01", "\x1f", "\0"];
const flipCase = text => [...text].map(c => random() < .5 ? c.toUpperCase() : c).join("");

function disguiseScheme(scheme) {
    const letters = [...flipCase(scheme)].map(c => random() < .25 ? c + pick(IGNORED_BY_URL_PARSER) : c).join("");
    return `${pick(LEADING_JUNK)}${letters}:alert(1)`;
}

const failures = [];
const expect = (ok, name, input) => {
    if (!ok && failures.length < 12) failures.push(`${name}: ${JSON.stringify(input)}`);
};

const startedAt = Date.now();
const BASE = join(OUT, "themes");
const PATH_PARTS = ["..", ".", "a", "b.css", "/", "\\", "//", "\\\\", "C:", "C:\\", "..\\", "../", "%2e%2e", "\0", ":", "CON", "nul.css", "a.css.", "a.css ", "...", "....", "\u2025", "\uff0e\uff0e"];
const ORIGIN_TRICKS = ["https://discord.com", "https://discord.com.", "https://discord.com:443", "https://discord.com.evil.example", "https://evil.example#discord.com", "http://discord.com", "HTTPS://DISCORD.COM", "https://discord.com\n", " https://discord.com", "https://xdiscord.com", "https://canary.discord.com.evil.example", "https://evil-discord.com", "https://discord.com@evil.example", "https://discordapp.com", "http://discordapp.com", "https://discordapp.com.evil.example", "https://xdiscordapp.com", "https://canary.discordapp.com"];
const TOKEN_PARTS = ["abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0123456789-_"].join("");
const randomToken = length => Array.from({ length }, () => pick(TOKEN_PARTS)).join("");

for (let i = 0; i < ROUNDS; i++) {
    // A scheme that runs code is never a safe link, however it's dressed up
    const hostile = disguiseScheme(pick(["javascript", "vbscript", "data", "file", "blob"]));
    expect(m.isSafeLink(hostile) === false, "isSafeLink let a script scheme through", hostile);
    expect(m.isSafeExternalUrl(hostile) === false, "isSafeExternalUrl let a script scheme through", hostile);

    // A path either stays inside its base or is refused
    const path = repeat(1, 6, () => pick(PATH_PARTS)).join(pick(["", "/", "\\"]));
    let safe = null;
    try {
        safe = m.ensureSafePath(BASE, path);
    } catch { }
    if (safe !== null) {
        const inside = relative(BASE, safe);
        expect(inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside), "ensureSafePath left its base", path);
        expect(!/[<>:"|?*\0]/.test(inside.replace(/^[A-Za-z]:/, "")), "ensureSafePath kept an unsafe character", path);
    }

    // Only exact Discord origins pass, and the check can't be fooled by what surrounds the name
    const origin = pick(ORIGIN_TRICKS) + pick(["", "", "/", ".", "x", "\n"]);
    if (m.isDiscordOrigin(origin)) expect(["https://discord.com", "https://ptb.discord.com", "https://canary.discord.com", "https://discordapp.com"].includes(origin), "isDiscordOrigin accepted a lookalike", origin);

    // A secret never survives, wherever it sits in the text, and scrubbing twice changes nothing
    // The first part is 23 characters for a 17-digit id, 26 for a 19-digit one
    const secret = `A${randomToken(22 + Math.floor(random() * 4))}.${randomToken(6)}.${randomToken(30)}A`;
    const text = `${repeat(0, 3, () => pick(["log ", "error: ", "{\"t\":\"", "x=", "\n"])).join("")}${secret}${pick(["", " ", "\"", ",", "\n"])}`;
    const clean = m.redactSecrets(text);
    expect(!clean.includes(secret), "redactSecrets missed a token", text);
    expect(m.redactSecrets(clean) === clean, "redactSecrets changed its own output", text);

    // Credentials only leave over https, or to this PC
    const cloud = `${pick(["http", "https", "HTTP", "ftp"])}://${pick(["example.com", "localhost.evil.example", "127.0.0.1.evil.example", "localhost@evil.example", "[::1]@evil.example"])}${pick(["", "/", ":8080/"])}`;
    if (m.isSecureCloudUrl(cloud)) expect(new URL(cloud).protocol === "https:", "isSecureCloudUrl allowed plain http off this PC", cloud);
}

rmSync(OUT, { recursive: true, force: true });

console.log(`${ROUNDS} rounds in ${Date.now() - startedAt}ms, seed ${SEED}`);
if (failures.length) {
    for (const failure of failures) console.log(`FAIL  ${failure}`);
    process.exit(1);
}
console.log("ALL PASSED");
