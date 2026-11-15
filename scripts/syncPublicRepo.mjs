/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-check

// Makes a release's source commit: copies this tree's committed files into the local clone of Endcord/Endcord.
//
//   node scripts/syncPublicRepo.mjs [--commit]
//
// Left out (NOT_PUBLISHED): Endcord Desktop's app, which is published from Endcord/EndcordDesktop. Kept as they are
// (PUBLIC_ONLY): what only the public repository has, the release's update files and manifest, the bundled Node, the
// badge images and its own two workflows. A file deleted here is deleted there. --commit commits the result as
// "Endcord <version> source"; uploadRelease.mjs then adds the release commit on top, and pushes both with --push

import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_REPO = process.env.ENDCORD_PUBLIC_REPO ?? join(ROOT, "..", "endcord");

const NOT_PUBLISHED = [
    "desktop/",
    "scripts/build/buildDesktopApp.mjs",
    "scripts/syncDesktopRepo.mjs",
    "test/desktop.mjs",
    "assets/desktop_icon"
];
const PUBLIC_ONLY = [
    "dist/",
    "dist_compressed/",
    "node-v22/",
    "badge_temp/",
    "version.json",
    ".github/workflows/codeberg-mirror.yml",
    ".github/workflows/publish.yml"
];

const under = (/** @type {string[]} */ prefixes) => (/** @type {string} */ path) => prefixes.some(prefix => path === prefix || path.startsWith(prefix));
const isNotPublished = under(NOT_PUBLISHED);
const isPublicOnly = under(PUBLIC_ONLY);
const git = (/** @type {string} */ cwd, /** @type {string[]} */ ...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const files = (/** @type {string} */ cwd, /** @type {string[]} */ ...args) => git(cwd, ...args, "-z").split("\0").filter(Boolean);

function fail(/** @type {string} */ message) {
    console.error(`syncPublicRepo: ${message}`);
    process.exit(1);
}

const commit = process.argv.includes("--commit");

// The source commit has to match a commit here, so nothing uncommitted may be left out of it or slip into it
if (git(ROOT, "status", "--porcelain")) fail("commit everything here first, new files included (git status isn't clean)");

if (!existsSync(join(PUBLIC_REPO, ".git"))) fail(`${PUBLIC_REPO} is not a git clone; set ENDCORD_PUBLIC_REPO`);
if (!/\bEndcord\/Endcord(\.git)?$/i.test(git(PUBLIC_REPO, "remote", "get-url", "origin"))) fail(`${PUBLIC_REPO} doesn't point at Endcord/Endcord`);
if (git(PUBLIC_REPO, "rev-parse", "--abbrev-ref", "HEAD") !== "main") fail(`${PUBLIC_REPO} is not on the main branch`);
if (git(PUBLIC_REPO, "status", "--porcelain", "--untracked-files=no")) fail(`${PUBLIC_REPO} has uncommitted changes`);
// Up to date with GitHub first, so the source commit and the release commit after it push without a merge. A change
// made on GitHub itself (an edit to the README there) has to be in this tree too, or the source commit undoes it
git(PUBLIC_REPO, "pull", "--ff-only");

const published = files(ROOT, "ls-tree", "-r", "--name-only", "HEAD").filter(path => !isNotPublished(path) && !isPublicOnly(path));
const wanted = new Set(published);
const stale = files(PUBLIC_REPO, "ls-files").filter(path => !wanted.has(path) && !isPublicOnly(path));

// The files as committed, not as the working tree has them (line endings, mostly)
const tree = mkdtempSync(join(tmpdir(), "endcord-public-"));
try {
    const archive = join(tree, "HEAD.tar");
    execFileSync("git", ["archive", "--format=tar", "-o", archive, "HEAD"], { cwd: ROOT });
    // Git's GNU tar can come first on PATH and reads "C:\..." as a remote host, so use Windows' own tar there
    const windowsTar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
    execFileSync(process.platform === "win32" && existsSync(windowsTar) ? windowsTar : "tar", ["-xf", archive, "-C", tree]);
    for (const path of published) {
        const to = join(PUBLIC_REPO, path);
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(join(tree, path), to);
    }
} finally {
    rmSync(tree, { recursive: true, force: true });
}
// In batches, so a long list never outgrows the command line
for (let i = 0; i < stale.length; i += 200) git(PUBLIC_REPO, "rm", "-q", "--", ...stale.slice(i, i + 200));
git(PUBLIC_REPO, "add", "-A", "--", ...[...new Set(published.map(path => path.split("/")[0]))]);

const changes = git(PUBLIC_REPO, "status", "--porcelain");
console.log(`${published.length} files published, ${stale.length} removed there; ${changes ? changes.split("\n").length : 0} changed in ${PUBLIC_REPO}`);

if (commit && changes) {
    const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    git(PUBLIC_REPO, "commit", "-q", "-m", `Endcord ${version} source`);
    console.log(git(PUBLIC_REPO, "log", "--oneline", "-1"));
}
