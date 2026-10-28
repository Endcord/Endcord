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
// 2. Builds the desktop files, the browser extension, and the signed, self-tested EndcordInstaller.exe.
// 3. Writes version.json with a SHA-256 for each of the four update files.
// 4. Copies the installer, install.sh, the update files and version.json into the local site folder.
//    Nothing is deployed: uploading that folder to endcord.com stays a manual step.
// 5. Commits dist/ and version.json in the local public repo clone. Only with --push is it pushed to
//    GitHub; that push is the update: every Endcord checks version.json there and asks to restart.
//
// --dry-run   steps 1-3 only; nothing outside this folder (and the Desktop installer copy) changes
// --site-only steps 1-4: refresh the local site folder, leave the public repo alone
// --push      also push the release commit to GitHub (without it, nothing leaves this PC)

import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const NODE_DIR = dirname(process.execPath);
// The site folder and the public clone sit next to this repo
const SITE_DIR = process.env.ENDCORD_SITE_DIR ?? join(ROOT, "..", "Endcord-site");
const PUBLIC_REPO = process.env.ENDCORD_PUBLIC_REPO ?? join(ROOT, "..", "endcord");
// The updater reads version.json from here and rejects files that don't match their checksum
const RAW_BASE = "https://raw.githubusercontent.com/rootpoii/endcord/main";
const UPDATE_FILES = ["patcher.js", "preload.js", "renderer.js", "renderer.css"];
// The same four files in one archive on the site. install.sh uses it until GitHub has a checksummed
// release, and Cloudflare blocks the site's .js files for scripts, so they can't be fetched one by one
const BUNDLE = "EndcordFiles.tar.gz";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const siteOnly = args.includes("--site-only");
const push = args.includes("--push");
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

// ---- 1. Checks -------------------------------------------------------------------------------------

const installerSource = join(ROOT, "InstallerGUI.cs");
const packageJsonPath = join(ROOT, "package.json");

if (setVersion) {
    if (!/^\d+\.\d+\.\d+$/.test(setVersion)) fail(`"${setVersion}" is not a version like 4.0.26`);
    step(`Setting the version to ${setVersion}`);
    writeFileSync(installerSource, readFileSync(installerSource, "utf8")
        .replace(/(AssemblyVersion|AssemblyFileVersion)\("[\d.]+"\)/g, `$1("${setVersion}.0")`)
        .replace(/AssemblyInformationalVersion\("[^"]+"\)/, `AssemblyInformationalVersion("${setVersion}")`));
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    pkg.version = setVersion;
    writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 4) + "\n");
}

const version = readFileSync(installerSource, "utf8").match(/AssemblyInformationalVersion\("([^"]+)"\)/)?.[1];
const packageVersion = JSON.parse(readFileSync(packageJsonPath, "utf8")).version;
if (!version) fail("InstallerGUI.cs has no AssemblyInformationalVersion");
if (version !== packageVersion) fail(`InstallerGUI.cs says ${version} but package.json says ${packageVersion}. Use --set-version to set both.`);

const uncommitted = git(ROOT, "status", "--porcelain", "--untracked-files=no");
if (uncommitted && !dryRun) fail(`commit your changes first, so the release matches a commit:\n${uncommitted}`);

step(`Releasing Endcord ${version}${dryRun ? " (dry run)" : ""}`);
step("Type-checking");
run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "."]);

// ---- 2. Builds -------------------------------------------------------------------------------------

// Taken before the build: clients built now have a later BUILD_TIMESTAMP, so they never see their own release as an update
const releasedAt = Date.now();
const buildHash = releasedAt.toString(16).slice(-7);

step("Building the desktop files");
run(process.execPath, ["scripts/build/build.mjs", "--standalone"], { env: { ENDCORD_HASH: buildHash, ENDCORD_REMOTE: "rootpoii/endcord" } });

step("Building the browser extension");
run(process.execPath, ["scripts/build/buildWeb.mjs"]);
// Mozilla only signs Firefox extensions built from minified code when the source comes along
git(ROOT, "archive", "--format=zip", "-o", join(DIST, "EndcordSource.zip"), "HEAD");

step("Building the macOS installer app");
run(process.execPath, ["scripts/buildMacInstaller.mjs"]);

step("Building, testing and signing EndcordInstaller.exe");
run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/buildAndSignExe.ps1", ...(dryRun ? ["-NoSite"] : [])]);

// ---- 3. version.json -------------------------------------------------------------------------------

// Git's GNU tar can come first on PATH and reads "C:\..." as a remote host, so use Windows' own tar there
const windowsTar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const tar = process.platform === "win32" && existsSync(windowsTar) ? windowsTar : "tar";
execFileSync(tar, ["-czf", join(DIST, BUNDLE), "-C", DIST, ...UPDATE_FILES]);

const versionData = {
    version,
    hash: buildHash,
    updatedAt: releasedAt,
    date: new Date(releasedAt).toISOString(),
    downloadUrl: "https://endcord.com/download",
    bundle: `https://endcord.com/${BUNDLE}`,
    assets: UPDATE_FILES.map(name => ({
        name,
        url: `${RAW_BASE}/dist/${name}`,
        sha256: sha256(join(DIST, name))
    }))
};
const versionJson = JSON.stringify(versionData, null, 2) + "\n";
writeFileSync(join(DIST, "version.json"), versionJson);
step("version.json");
console.log(versionJson);

if (dryRun) {
    console.log("Dry run finished. Nothing was copied to the site or the public repo.");
    process.exit(0);
}

// ---- 4. Site folder --------------------------------------------------------------------------------

step(`Copying the release into ${SITE_DIR}`);
if (!existsSync(SITE_DIR)) fail(`${SITE_DIR} doesn't exist; set ENDCORD_SITE_DIR`);
mkdirSync(join(SITE_DIR, "dist"), { recursive: true });
for (const name of UPDATE_FILES) copyFileSync(join(DIST, name), join(SITE_DIR, "dist", name));
copyFileSync(join(DIST, BUNDLE), join(SITE_DIR, BUNDLE));
copyFileSync(join(ROOT, "install.sh"), join(SITE_DIR, "install.sh"));
// Old download links and docs point at this name; it was always the shell installer
copyFileSync(join(ROOT, "install.sh"), join(SITE_DIR, "EndcordInstallerCli-linux"));
copyFileSync(join(DIST, "extension-chrome.zip"), join(SITE_DIR, "EndcordWeb.zip"));
copyFileSync(join(DIST, "EndcordInstaller-macOS.zip"), join(SITE_DIR, "EndcordInstaller-macOS.zip"));
writeFileSync(join(SITE_DIR, "version.json"), versionJson);
console.log(`Copied the update files, ${BUNDLE}, install.sh, EndcordWeb.zip, EndcordInstaller-macOS.zip and version.json (the Windows installer was copied by its build).`);

if (siteOnly) {
    console.log(`\nSite folder refreshed; the public repo was not touched. Upload ${SITE_DIR} to endcord.com when you're ready.`);
    process.exit(0);
}

// ---- 5. Public repo --------------------------------------------------------------------------------

step(`Committing the release in ${PUBLIC_REPO}`);
if (!existsSync(join(PUBLIC_REPO, ".git"))) fail(`${PUBLIC_REPO} is not a git clone; set ENDCORD_PUBLIC_REPO`);
if (!/rootpoii\/endcord/i.test(git(PUBLIC_REPO, "remote", "get-url", "origin"))) fail(`${PUBLIC_REPO} doesn't point at rootpoii/Endcord`);
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

if (!push) {
    console.log(`\nNot pushed. Users get the update once you push it: git -C "${PUBLIC_REPO}" push (or rerun with --push)`);
} else {
    step("Pushing");
    run("git", ["push"], { cwd: PUBLIC_REPO });
    console.log("\nPushed. Every Endcord picks the update up within 15 minutes (or on its next start) and asks to restart.");
}

console.log(`\nLast step: upload ${SITE_DIR} to endcord.com so new downloads get EndcordInstaller.exe ${version} and the new install.sh.`);
