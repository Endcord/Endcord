/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-check

// Publishes a release's downloads (the installers, the extension, the update files' archive) as a GitHub release of
// Endcord/Endcord, tagged v<version>. endcord.com links to github.com/Endcord/Endcord/releases/latest/download/<file>
// instead of serving them itself: a site that hands out executables gets listed as a malware source by URL filters.
//
//   node scripts/githubRelease.mjs <version>      uploads dist/release/ again for a release that's already pushed
//
// uploadRelease.mjs --push calls publishGithubRelease right after the push. The GitHub account is the one git pushes
// with (Git Credential Manager), or GITHUB_TOKEN when set; the token is only ever sent to api.github.com

import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const RELEASE_REPO = "Endcord/Endcord";
export const RELEASE_DIR = join(ROOT, "dist", "release");
/** What dist/release/ holds after a release build, in the order the release page lists them */
export const RELEASE_FILES = [
    "EndcordInstaller.exe",
    "EndcordInstaller.zip",
    "EndcordInstaller-macOS.zip",
    "EndcordWeb.zip",
    "EndcordFiles.tar.gz",
    "SHA256SUMS"
];

export const latestDownload = (/** @type {string} */ name) => `https://github.com/${RELEASE_REPO}/releases/latest/download/${name}`;

function token() {
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
    // The credential git itself pushes with; no prompt in the terminal, Git Credential Manager may ask in a window
    const out = execFileSync("git", ["credential", "fill"], {
        input: "protocol=https\nhost=github.com\n\n",
        encoding: "utf8",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
    });
    const found = /^password=(.+)$/m.exec(out)?.[1];
    if (!found) throw new Error("git has no GitHub credential; push once from this PC, or set GITHUB_TOKEN");
    return found;
}

/**
 * @param {string} auth
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function github(auth, url, init = {}) {
    const res = await fetch(url, {
        ...init,
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${auth}`,
            "User-Agent": "endcord-release",
            "X-GitHub-Api-Version": "2022-11-28",
            ...init.headers
        }
    });
    if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url.replace(/\?.*/, "")}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res;
}

/**
 * A changelog's section for this version under the given intro, or a link to the whole changelog
 * @param {{ changelog: string; version: string; intro: string; link: string }} notes
 */
export function releaseNotes({ changelog, version, intro, link }) {
    const text = readFileSync(changelog, "utf8").replaceAll(String.fromCharCode(13), "");
    const heading = new RegExp(String.raw`^## \[?${version.replaceAll(".", String.raw`\.`)}\b.*$`, "m");
    const start = text.search(heading);
    const section = start === -1 ? "" : text.slice(text.indexOf("\n", start) + 1).split(/^## /m)[0].trim();
    return `${intro}\n\n${section || `See [CHANGELOG.md](${link}).`}`;
}

const endcordNotes = (/** @type {string} */ version) => releaseNotes({
    changelog: join(ROOT, "CHANGELOG.md"),
    version,
    intro: "Install from [endcord.com/download](https://endcord.com/download), or download a file below. Endcord updates itself after that.\n\n"
        + "Check a download against SHA256SUMS, or against the signed version.json on [endcord.com/trust](https://endcord.com/trust).",
    link: `https://github.com/${RELEASE_REPO}/blob/main/CHANGELOG.md`
});

/**
 * Creates or updates a release, uploads every file (replacing ones with the same name), then publishes it as the latest
 * release, so links to the latest one move to it at once. beforePublish runs once the files are up and the release is
 * still a draft. Resolves once each file downloads from its public address
 * @param {{ repo?: string; tag: string; name: string; notes: string; target: string; dir?: string; files?: string[]; beforePublish?: () => unknown }} release
 */
export async function publishGithubRelease({ repo = RELEASE_REPO, tag, name, notes, target, dir = RELEASE_DIR, files = RELEASE_FILES, beforePublish }) {
    const auth = token();
    const api = `https://api.github.com/repos/${repo}`;
    const uploads = `https://uploads.github.com/repos/${repo}`;

    // A rerun finds the release it made before, even unpublished, and fills it in
    const existing = await (await github(auth, `${api}/releases?per_page=30`)).json();
    let release = Array.isArray(existing) ? existing.find(r => r.tag_name === tag) : null;
    if (!release) {
        // Drafts don't move "latest" or show on the releases page until they're published below
        release = await (await github(auth, `${api}/releases`, {
            method: "POST",
            body: JSON.stringify({ tag_name: tag, target_commitish: target, name, body: notes, draft: true })
        })).json();
    }

    for (const file of files) {
        const old = release.assets?.find((/** @type {{ name: string; }} */ asset) => asset.name === file);
        if (old) await github(auth, `${api}/releases/assets/${old.id}`, { method: "DELETE" });
        const data = readFileSync(join(dir, file));
        await github(auth, `${uploads}/releases/${release.id}/assets?name=${encodeURIComponent(basename(file))}`, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: data
        });
        console.log(`  uploaded ${file} (${Math.round(data.length / 1024)} KB)`);
    }

    await beforePublish?.();
    await github(auth, `${api}/releases/${release.id}`, {
        method: "PATCH",
        body: JSON.stringify({ draft: false, prerelease: false, make_latest: "true", name, body: notes })
    });

    for (const file of files) {
        const res = await fetch(`https://github.com/${repo}/releases/download/${tag}/${file}`, { method: "HEAD", redirect: "follow" });
        if (!res.ok) throw new Error(`${file} doesn't download from the release (${res.status})`);
    }
    return `https://github.com/${repo}/releases/tag/${tag}`;
}

/** Endcord's own release v<version> at the given commit of Endcord/Endcord */
export const publishEndcordRelease = (/** @type {string} */ version, /** @type {string} */ commit) =>
    publishGithubRelease({ tag: `v${version}`, name: `Endcord ${version}`, notes: endcordNotes(version), target: commit });

export const DESKTOP_RELEASE_REPO = "Endcord/EndcordDesktop";
export const DESKTOP_RELEASE_DIR = join(ROOT, "dist", "release-desktop");
export const DESKTOP_SETUP = "EndcordDesktopSetup.exe";

/**
 * Endcord Desktop's release in its own repository: dist/release-desktop goes up as the release <tag> (the one setup
 * derives from the signed version), the local clone is pushed while the release is still a draft, since its manifest
 * names that zip, and then the release is published as the latest
 * @param {{ tag: string; version: string; zip: string; desktopRepo: string }} release
 */
export const publishDesktopRelease = ({ tag, version, zip, desktopRepo }) => publishGithubRelease({
    repo: DESKTOP_RELEASE_REPO,
    tag,
    name: `Endcord Desktop ${version}`,
    notes: releaseNotes({
        changelog: join(desktopRepo, "CHANGELOG.md"),
        version,
        intro: `Install with ${DESKTOP_SETUP} below (Windows 10 and 11, 64-bit). It downloads ${zip}, checks it against the signed version.json, and the app updates itself after that.`,
        link: `https://github.com/${DESKTOP_RELEASE_REPO}/blob/main/CHANGELOG.md`
    }),
    target: "main",
    dir: DESKTOP_RELEASE_DIR,
    files: [DESKTOP_SETUP, zip, "SHA256SUMS"],
    beforePublish: () => execFileSync("git", ["push"], { cwd: desktopRepo, stdio: "inherit" })
});

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    const [version] = process.argv.slice(2);
    if (version === "--desktop") {
        // Endcord Desktop's release again, from what the last uploadRelease.mjs --desktop left in dist/
        const build = JSON.parse(readFileSync(join(ROOT, "dist", "desktop-build.json"), "utf8"));
        const desktopRepo = process.env.ENDCORD_DESKTOP_REPO ?? join(ROOT, "..", "endcord-desktop");
        console.log(await publishDesktopRelease({ tag: `desktop-${build.version}-electron${build.electron}`, version: build.version, zip: build.zip, desktopRepo }));
        process.exit(0);
    }
    if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
        console.error("Usage: node scripts/githubRelease.mjs <version> | --desktop");
        process.exit(1);
    }
    const publicRepo = process.env.ENDCORD_PUBLIC_REPO ?? join(ROOT, "..", "endcord");
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: publicRepo, encoding: "utf8" }).trim();
    console.log(await publishEndcordRelease(version, commit));
}
