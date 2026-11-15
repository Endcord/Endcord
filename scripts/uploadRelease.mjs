/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Builds and publishes an Endcord release in one go.
//
//   node-v22\node.exe scripts/uploadRelease.mjs [--set-version 4.0.26] [--dry-run] [--push]
//
// 1. Checks the code (tsc) and that the version in InstallerGUI.cs and package.json match.
// 2. Builds the desktop files, the browser extension, and the self-tested EndcordInstaller.exe.
// 3. Writes and signs version.json, with a SHA-256 for each of the four update files, and puts the downloads (the
//    installers, the extension, the update files' archive and SHA256SUMS) in dist/release.
// 4. Copies install.sh, the update files' archive and version.json into the local site folder. The site serves no
//    executables: its download links go to the GitHub release (scripts/githubRelease.mjs). Nothing is deployed:
//    uploading that folder to endcord.com stays a manual step.
// 5. Commits dist/ and version.json in the local public repo clone, on top of the source commit
//    `node scripts/syncPublicRepo.mjs --commit` made there first. Only with --push is it pushed to
//    GitHub; that push is the update: every Endcord checks version.json there and asks to restart. Then the
//    downloads go up as the GitHub release v<version>, which becomes the latest one the site links to.
//
// --dry-run   steps 1-3 only; nothing outside this folder (and the Desktop installer copy) changes
// --site-only steps 1-4: refresh the local site folder, leave the public repo alone
// --push      also push the release commit to GitHub (without it, nothing leaves this PC)
// --desktop   also release Endcord Desktop, from its own repository Endcord/EndcordDesktop. Its six update files
//             (dist/) and its signed version.json are committed to the local clone of that repository with a copy of
//             the app's code (scripts/syncDesktopRepo.mjs). A new runtime (Electron as Endcord Desktop, 140 MB) goes up
//             with EndcordDesktopSetup.exe as the GitHub release desktop-<version>-electron<electron> there; a release
//             whose version and Electron are already up there keeps that zip and only pushes the clone. Its version is in
//             desktop/app.json. With --push the files are uploaded first and the clone pushed before the release is
//             published, so the manifest never names a zip that isn't there

import { execFileSync } from "child_process";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { DESKTOP_RELEASE_DIR, DESKTOP_RELEASE_REPO, DESKTOP_SETUP, publishDesktopRelease, publishEndcordRelease, RELEASE_DIR, RELEASE_FILES } from "./githubRelease.mjs";
import { changedThere, DESKTOP_REPO, syncDesktopRepo } from "./syncDesktopRepo.mjs";

const ROOT =join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const NODE_DIR = dirname(process.execPath);
// The site folder and the public clone sit next to this repo
const SITE_DIR = process.env.ENDCORD_SITE_DIR ?? join(ROOT, "..", "Endcord-site");
const PUBLIC_REPO = process.env.ENDCORD_PUBLIC_REPO ?? join(ROOT, "..", "endcord");
// The updater reads version.json from here and rejects files that don't match their checksum
const RAW_BASE = "https://raw.githubusercontent.com/Endcord/Endcord/main";
const UPDATE_FILES = ["patcher.js", "preload.js", "renderer.js", "renderer.css"];
// The same four files in one archive on the site. install.sh uses it until GitHub has a checksummed
// release, and Cloudflare blocks the site's .js files for scripts, so they can't be fetched one by one
const BUNDLE = "EndcordFiles.tar.gz";
// Signs version.json. It never goes in a repo: without it there are no more updates, and whoever has it can ship one
const SIGNING_KEY = process.env.ENDCORD_UPDATE_KEY ?? join(homedir(), ".endcord", "update-signing-key.pem");
const PUBLIC_KEY = join(ROOT, "src", "main", "updater", "updateKey.pem");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const siteOnly = args.includes("--site-only");
const push = args.includes("--push");
const desktop = args.includes("--desktop");
// What Endcord Desktop's updater swaps in (ENDCORD_FILES in src/main/updater/common.ts for that build)
const DESKTOP_FILES = ["endcordDesktopMain.js", "endcordDesktopPreload.js", "endcordDesktopRenderer.js", "endcordDesktopRenderer.css", "main.js", "preload.js"];
// Where they are served from: the repository's dist/, with version.json at its root. Kept in step with MANIFEST_URL in
// src/main/updater/common.ts, and FileBase and DesktopUrl in the installer
const DESKTOP_RAW = "https://raw.githubusercontent.com/Endcord/EndcordDesktop/main";
const setVersion = args.includes("--set-version") ? args[args.indexOf("--set-version") + 1] : null;

const step = msg => console.log(`\n== ${msg}`);
function fail(msg) {
    console.error(`\nRelease stopped: ${msg}`);
    process.exit(1);
}
function run(cmd, cmdArgs, opts = {}) {
    execFileSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", ...opts, env: { ...process.env, PATH: `${NODE_DIR};${process.env.PATH}`, ...opts.env } });
}
const git = (cwd, ...gitArgs) => execFileSync("git", gitArgs, { cwd, encoding: "utf8" }).trim();
const sha256 = file => createHash("sha256").update(readFileSync(file)).digest("hex");

// Keep the payload in sync with isSignedManifest in src/main/updater/http.ts and verify_manifest in install.sh and linux/gui.py
function signManifest({ version, hash, updatedAt, installerSha256, assets }, key) {
    const payload = Buffer.from([version, hash, updatedAt, installerSha256, ...assets.map(a => `${a.name} ${a.sha256}`).sort()].join("\n"));
    const signature = sign("sha256", payload, key);
    if (!verify("sha256", payload, readFileSync(PUBLIC_KEY, "utf8"), signature)) fail("the signature doesn't match the public key clients have");
    return signature.toString("base64");
}

// ---- 1. Checks -------------------------------------------------------------------------------------

const installerSource = join(ROOT, "installer", "InstallerGUI.cs");
const packageJsonPath = join(ROOT, "package.json");

if (setVersion) {
    if (!/^\d+\.\d+\.\d+$/.test(setVersion)) fail(`"${setVersion}" is not a version like 4.0.26`);
    step(`Setting the version to ${setVersion}`);
    writeFileSync(installerSource, readFileSync(installerSource, "utf8")
        .replace(/(AssemblyVersion|AssemblyFileVersion)\("[\d.]+"\)/g, `$1("${setVersion}.0")`)
        .replace(/AssemblyInformationalVersion\("[^"]+"\)/, `AssemblyInformationalVersion("${setVersion}")`));
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    pkg.version = setVersion;
    writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 4)}\n`);
}

const version = readFileSync(installerSource, "utf8").match(/AssemblyInformationalVersion\("([^"]+)"\)/)?.[1];
const packageVersion = JSON.parse(readFileSync(packageJsonPath, "utf8")).version;
if (!version) fail("InstallerGUI.cs has no AssemblyInformationalVersion");
if (version !== packageVersion) fail(`InstallerGUI.cs says ${version} but package.json says ${packageVersion}. Use --set-version to set both.`);

const uncommitted = git(ROOT, "status", "--porcelain", "--untracked-files=no");
if (uncommitted && !dryRun) fail(`commit your changes first, so the release matches a commit:\n${uncommitted}`);

if (!existsSync(SIGNING_KEY)) fail(`no update signing key at ${SIGNING_KEY}; set ENDCORD_UPDATE_KEY or restore it from your backup`);
const signingKey = createPrivateKey(readFileSync(SIGNING_KEY, "utf8"));

const publicKey = readFileSync(PUBLIC_KEY, "utf8").replaceAll("\r\n", "\n").trim();
if (createPublicKey(signingKey).export({ type: "spki", format: "pem" }).trim() !== publicKey) fail(`${SIGNING_KEY} doesn't match ${PUBLIC_KEY}`);
for (const script of ["install.sh", "linux/gui.py"]) {
    if (!readFileSync(join(ROOT, script), "utf8").replaceAll("\r\n", "\n").includes(publicKey)) fail(`${script} has a different public key than the client`);
}

step(`Releasing Endcord ${version}${dryRun ? " (dry run)" : ""}`);
step("Type-checking");
run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "."]);

// ---- 2. Builds -------------------------------------------------------------------------------------

// Clients are built just after this, so they never see their own release as an update. Fixing the time rather than
// using the clock is what lets anyone rebuild a release and get the same bytes: see scripts/verifyReproducible.mjs
const releasedAt = Date.now();
const buildHash = releasedAt.toString(16).slice(-7);

step("Building the desktop files");
run(process.execPath, ["scripts/build/build.mjs", "--standalone"], { env: { ENDCORD_HASH: buildHash, ENDCORD_REMOTE: "Endcord/Endcord", SOURCE_DATE_EPOCH: String(releasedAt + 1) } });

step("Building the browser extension");
run(process.execPath, ["scripts/build/buildWeb.mjs"]);
// Mozilla only signs Firefox extensions built from minified code when the source comes along
git(ROOT, "archive", "--format=zip", "-o", join(DIST, "EndcordSource.zip"), "HEAD");

step("Building the macOS installer app");
run(process.execPath, ["scripts/buildMacInstaller.mjs"]);

step("Building and testing EndcordInstaller.exe");
run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/buildInstaller.ps1"]);

if (desktop) {
    step("Building Endcord Desktop");
    // From the endcordDesktop* files the release build above made, so they carry the same hash and time
    run(process.execPath, ["scripts/build/buildDesktopApp.mjs"]);
    run(process.execPath, ["test/desktop.mjs"]);
}

// ---- 3. version.json -------------------------------------------------------------------------------

// Git's GNU tar can come first on PATH and reads "C:\..." as a remote host, so use Windows' own tar there
const windowsTar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const tar = process.platform === "win32" && existsSync(windowsTar) ? windowsTar : "tar";
execFileSync(tar, ["-czf", join(DIST, BUNDLE), "-C", DIST, ...UPDATE_FILES]);

const assets = UPDATE_FILES.map(name => ({
    name,
    url: `${RAW_BASE}/dist/${name}`,
    sha256: sha256(join(DIST, name))
}));
const installerSha256 = sha256(join(ROOT, "EndcordInstaller.exe"));
const versionData = {
    version,
    hash: buildHash,
    updatedAt: releasedAt,
    date: new Date(releasedAt).toISOString(),
    downloadUrl: "https://endcord.com/download",
    bundle: `https://endcord.com/${BUNDLE}`,
    // What people can check their download against, on the site's /trust page
    installerSha256,
    signature: signManifest({ version, hash: buildHash, updatedAt: releasedAt, installerSha256, assets }, signingKey),
    assets
};
const versionJson = `${JSON.stringify(versionData, null, 2)}\n`;
writeFileSync(join(DIST, "version.json"), versionJson);
step("version.json");
console.log(versionJson);

// Endcord Desktop's own manifest, signed the same way. Its version names the Electron it was built on, so an app on an
// older Electron downloads the new zip instead of taking files that may not run on it (needsNewApp in the updater)
let desktopBuild = null;
let desktopJson = "";
// The runtime zip setup downloads (installer/Core/DesktopEngine.cs) is on the GitHub release the signed version names,
// desktop-<version>-electron<electron>. A release on the same version and Electron keeps the zip that's up there, and
// the SHA-256 the published manifest has for it; anything else uploads a new zip. Decided from GitHub, not from a
// local record, so a run without --push leaves the next run nothing to trust
// Kept in step with ReleaseBase in installer/Core/DesktopEngine.cs
const RUNTIME_REPO = DESKTOP_RELEASE_REPO;
async function publishedRuntime(/** @type {string} */ version, /** @type {string} */ url) {
    if (!existsSync(join(DESKTOP_REPO, ".git"))) fail(`${DESKTOP_REPO} is not a git clone; set ENDCORD_DESKTOP_REPO`);
    try {
        git(DESKTOP_REPO, "fetch", "-q", "origin", "main");
        if (!git(DESKTOP_REPO, "ls-tree", "--name-only", "origin/main", "version.json")) return null;
        const manifest = JSON.parse(git(DESKTOP_REPO, "show", "origin/main:version.json"));
        if (manifest.version !== version) return null;
        // A draft's files don't download, and setup needs this one
        const res = await fetch(url, { method: "HEAD", redirect: "follow" });
        return res.ok ? manifest.installerSha256 : null;
    } catch (e) {
        if (!dryRun) fail(`couldn't read what Endcord/EndcordDesktop has published: ${e instanceof Error ? e.message : e}`);
        console.warn("Couldn't read what Endcord/EndcordDesktop has published, so this dry run counts the runtime as new.");
        return null;
    }
}
let runtime = null;
let newRuntime = false;
if (desktop) {
    desktopBuild = JSON.parse(readFileSync(join(DIST, "desktop-build.json"), "utf8"));
    const appDir = join(DIST, desktopBuild.folder, "resources", "app");
    const desktopAssets = DESKTOP_FILES.map(name => ({ name, url: `${DESKTOP_RAW}/dist/${name}`, sha256: sha256(join(appDir, name)) }));
    const desktopVersion = `${desktopBuild.version}+electron${desktopBuild.electron}`;
    const tag = `desktop-${desktopBuild.version}-electron${desktopBuild.electron}`;
    const url = `https://github.com/${RUNTIME_REPO}/releases/download/${tag}/${desktopBuild.zip}`;
    const keptSha256 = await publishedRuntime(desktopVersion, url);
    // A pull request merged there since the last release has to be in this tree first, or the release's copy undoes it
    let conflicts = [];
    try {
        conflicts = changedThere("origin/main");
    } catch (e) {
        if (!dryRun) fail(`couldn't compare with Endcord/EndcordDesktop: ${e instanceof Error ? e.message : e}`);
    }
    if (conflicts.length) fail(`Endcord/EndcordDesktop changed files since its last release that this tree has differently:\n  ${conflicts.join("\n  ")}\nBring those changes into this tree first (git -C "${DESKTOP_REPO}" log -p origin/main -- <file>).`);
    newRuntime = !keptSha256;
    runtime = { tag, url, sha256: keptSha256 ?? desktopBuild.zipSha256 };
    const desktopData = {
        version: desktopVersion,
        hash: buildHash,
        updatedAt: releasedAt,
        date: new Date(releasedAt).toISOString(),
        downloadUrl: "https://endcord.com/download",
        // Setup checks the runtime zip against this before unpacking it
        installerSha256: runtime.sha256,
        signature: signManifest({ version: desktopVersion, hash: buildHash, updatedAt: releasedAt, installerSha256: runtime.sha256, assets: desktopAssets }, signingKey),
        assets: desktopAssets
    };
    desktopJson = `${JSON.stringify(desktopData, null, 2)}\n`;
    writeFileSync(join(DIST, "desktop-version.json"), desktopJson);
    step("Endcord Desktop's version.json");
    console.log(desktopJson);

    rmSync(DESKTOP_RELEASE_DIR, { recursive: true, force: true });
    if (newRuntime) {
        mkdirSync(DESKTOP_RELEASE_DIR, { recursive: true });
        copyFileSync(join(DIST, desktopBuild.zip), join(DESKTOP_RELEASE_DIR, desktopBuild.zip));
        // The installer under the name that makes it Endcord Desktop's setup (installer/InstallerGUI.cs)
        copyFileSync(join(ROOT, "EndcordInstaller.exe"), join(DESKTOP_RELEASE_DIR, DESKTOP_SETUP));
        const desktopSums = [desktopBuild.zip, DESKTOP_SETUP].map(name => `${sha256(join(DESKTOP_RELEASE_DIR, name))}  ${name}`);
        writeFileSync(join(DESKTOP_RELEASE_DIR, "SHA256SUMS"), `${desktopSums.join("\n")}\n`);
    }
    console.log(newRuntime
        ? `New runtime: ${DESKTOP_RELEASE_DIR} goes up as the GitHub release "${runtime.tag}" on ${RUNTIME_REPO} with --push.`
        : `Runtime unchanged: setup keeps downloading ${runtime.url}.`);
}

// The downloads, as they go up to the GitHub release
step(`Downloads in ${RELEASE_DIR}`);
rmSync(RELEASE_DIR, { recursive: true, force: true });
mkdirSync(RELEASE_DIR, { recursive: true });
copyFileSync(join(ROOT, "EndcordInstaller.exe"), join(RELEASE_DIR, "EndcordInstaller.exe"));
copyFileSync(join(DIST, "Installer", "EndcordInstaller.zip"), join(RELEASE_DIR, "EndcordInstaller.zip"));
copyFileSync(join(DIST, "EndcordInstaller-macOS.zip"), join(RELEASE_DIR, "EndcordInstaller-macOS.zip"));
copyFileSync(join(DIST, "extension-chrome.zip"), join(RELEASE_DIR, "EndcordWeb.zip"));
copyFileSync(join(DIST, BUNDLE), join(RELEASE_DIR, BUNDLE));
const sums = RELEASE_FILES.filter(name => name !== "SHA256SUMS").map(name => `${sha256(join(RELEASE_DIR, name))}  ${name}`);
writeFileSync(join(RELEASE_DIR, "SHA256SUMS"), `${sums.join("\n")}\n`);
console.log(sums.join("\n"));

if (dryRun) {
    console.log("Dry run finished. Nothing was copied to the site or the public repo.");
    process.exit(0);
}

// ---- 4. Site folder --------------------------------------------------------------------------------

step(`Copying the release into ${SITE_DIR}`);
if (!existsSync(SITE_DIR)) fail(`${SITE_DIR} doesn't exist; set ENDCORD_SITE_DIR`);
// The four files go to the site only inside the archive: Cloudflare's warning on endcord.com holds some single .js
// files back, so a dist folder there never worked as a mirror
copyFileSync(join(DIST, BUNDLE), join(SITE_DIR, BUNDLE));
copyFileSync(join(ROOT, "install.sh"), join(SITE_DIR, "install.sh"));
mkdirSync(join(SITE_DIR, "linux"), { recursive: true });
copyFileSync(join(ROOT, "linux", "gui.py"), join(SITE_DIR, "linux", "gui.py"));
// Old download links and docs point at this name; it was always the shell installer
copyFileSync(join(ROOT, "install.sh"), join(SITE_DIR, "EndcordInstallerCli-linux"));
writeFileSync(join(SITE_DIR, "version.json"), versionJson);
// The installer's hash, as text: the file itself is on the GitHub release
writeFileSync(join(SITE_DIR, "EndcordInstaller.exe.sha256"), `${installerSha256}  EndcordInstaller.exe\n`);
console.log(`Copied ${BUNDLE}, install.sh, version.json and the installers' checksums.`);

if (siteOnly) {
    console.log(`\nSite folder refreshed; the public repo was not touched. Upload ${SITE_DIR} to endcord.com when you're ready.`);
    process.exit(0);
}

// ---- 5. Public repo --------------------------------------------------------------------------------

step(`Committing the release in ${PUBLIC_REPO}`);
if (!existsSync(join(PUBLIC_REPO, ".git"))) fail(`${PUBLIC_REPO} is not a git clone; set ENDCORD_PUBLIC_REPO`);
if (!/\bEndcord\/Endcord\b/i.test(git(PUBLIC_REPO, "remote", "get-url", "origin"))) fail(`${PUBLIC_REPO} doesn't point at Endcord/Endcord`);
if (git(PUBLIC_REPO, "rev-parse", "--abbrev-ref", "HEAD") !== "main") fail(`${PUBLIC_REPO} is not on the main branch`);
git(PUBLIC_REPO, "pull", "--ff-only");

const releasePaths = [...UPDATE_FILES.map(name => `dist/${name}`), "version.json"];
mkdirSync(join(PUBLIC_REPO, "dist"), { recursive: true });
for (const name of UPDATE_FILES) copyFileSync(join(DIST, name), join(PUBLIC_REPO, "dist", name));
writeFileSync(join(PUBLIC_REPO, "version.json"), versionJson);
// dist/ is gitignored in the public repo, so the update files are added explicitly
git(PUBLIC_REPO, "add", "-f", "--", ...releasePaths);
// Only the release files go into this commit, even if other changes are staged
git(PUBLIC_REPO, "commit", "-m", `Release ${version}`, "--", ...releasePaths);
console.log(git(PUBLIC_REPO, "log", "--oneline", "-1"));

// Endcord Desktop's release in its own repository: the six files and the manifest, with a copy of the app's code
let desktopCommit = null;
if (desktopBuild) {
    step(`Committing Endcord Desktop ${desktopBuild.version} in ${DESKTOP_REPO}`);
    git(DESKTOP_REPO, "pull", "--ff-only");
    const appDir = join(DIST, desktopBuild.folder, "resources", "app");
    mkdirSync(join(DESKTOP_REPO, "dist"), { recursive: true });
    for (const name of DESKTOP_FILES) copyFileSync(join(appDir, name), join(DESKTOP_REPO, "dist", name));
    writeFileSync(join(DESKTOP_REPO, "version.json"), desktopJson);
    desktopCommit = syncDesktopRepo({
        commit: true,
        include: ["dist", "version.json", "CHANGELOG.md", "README.md", "CONTRIBUTING.md", ".github"],
        message: `Endcord Desktop ${desktopBuild.version}`
    }).commit;
    console.log(desktopCommit ?? "Already up to date.");
}

if (!push) {
    console.log(`\nNot pushed. Users get the update once you push it: git -C "${PUBLIC_REPO}" push (or rerun with --push)`);
    console.log(`After the push, put the downloads up: node scripts/githubRelease.mjs ${version}`);
    if (desktopCommit) console.log(`Endcord Desktop is committed in ${DESKTOP_REPO}; rerun with --push to upload its release and push it.`);
} else {
    step("Pushing");
    run("git", ["push"], { cwd: PUBLIC_REPO });
    console.log("\nPushed. Every Endcord picks the update up within 15 minutes (or on its next start) and asks to restart.");

    step(`Publishing the downloads as the GitHub release v${version}`);
    try {
        console.log(await publishEndcordRelease(version, git(PUBLIC_REPO, "rev-parse", "HEAD")));
    } catch (e) {
        // The update is out either way; until this is done the site's download links still give the previous release
        console.error(`\nThe downloads aren't up: ${e instanceof Error ? e.message : e}\nRetry with: node scripts/githubRelease.mjs ${version}`);
        process.exitCode = 1;
    }

    if (desktopBuild) {
        step(newRuntime ? `Publishing Endcord Desktop as the GitHub release ${runtime.tag}` : `Pushing Endcord Desktop ${desktopBuild.version}`);
        try {
            if (newRuntime) console.log(await publishDesktopRelease({ tag: runtime.tag, version: desktopBuild.version, zip: desktopBuild.zip, desktopRepo: DESKTOP_REPO }));
            else run("git", ["push"], { cwd: DESKTOP_REPO });
        } catch (e) {
            console.error(`\nEndcord Desktop isn't released: ${e instanceof Error ? e.message : e}\nIts commit is in ${DESKTOP_REPO}; retry with ${newRuntime ? "node scripts/githubRelease.mjs --desktop" : `git -C "${DESKTOP_REPO}" push`}.`);
            process.exitCode = 1;
        }
    }
}

console.log(`\nLast step: upload ${SITE_DIR} to endcord.com for the new version.json, install.sh and ${BUNDLE}. Its download links go to the latest GitHub release, so they need no change.`);
