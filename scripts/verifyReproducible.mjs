/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Proves the update files come from this source, and nothing else got in along the way.
//   node scripts/verifyReproducible.mjs                       builds twice and compares the two
//   node scripts/verifyReproducible.mjs --release version.json  rebuilds a release and compares it to its signed hashes
// The second form needs the source the release was built from.

import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["patcher.js", "preload.js", "renderer.js", "renderer.css"];

function build(env) {
    execFileSync(process.execPath, ["scripts/build/build.mjs", "--standalone"], { cwd: ROOT, stdio: "ignore", env: { ...process.env, ENDCORD_REMOTE: "Endcord/Endcord", ...env } });

    return Object.fromEntries(FILES.map(name => [name, createHash("sha256").update(readFileSync(join(ROOT, "dist", name))).digest("hex")]));
}

function compare(label, actual, expected) {
    let same = true;
    for (const name of FILES) {
        const matches = actual[name] === expected[name];
        if (!matches) same = false;
        console.log(`${matches ? "same     " : "DIFFERENT"}  ${name}  ${actual[name].slice(0, 16)}`);
    }

    console.log(same ? `\n${label}: identical` : `\n${label}: DIFFERENT`);
    process.exit(same ? 0 : 1);
}

const releaseFlag = process.argv.indexOf("--release");

if (releaseFlag !== -1) {
    const manifest = JSON.parse(readFileSync(process.argv[releaseFlag + 1], "utf8"));
    const actual = build({ ENDCORD_HASH: manifest.hash, SOURCE_DATE_EPOCH: String(manifest.updatedAt + 1) });

    compare(`Release ${manifest.version}`, actual, Object.fromEntries(manifest.assets.map(asset => [asset.name, asset.sha256])));
}

const inputs = { ENDCORD_HASH: "reproducible", SOURCE_DATE_EPOCH: "1700000000000" };
compare("Two builds from this source", build(inputs), build(inputs));
