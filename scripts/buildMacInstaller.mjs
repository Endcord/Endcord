/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Packs "Endcord Installer.app" for macOS into dist/EndcordInstaller-macOS.zip. Run it after a build: it
// bundles dist/ like the Windows installer does. The app is a small shell script that shows native dialogs
// and runs the bundled install.sh, so it can be built on any OS. The zip keeps Unix permissions, otherwise
// macOS can't launch the app after unzipping.

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { crc32, deflateRawSync } from "zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist", "EndcordInstaller-macOS.zip");
const APP = "Endcord Installer.app";

const version = readFileSync(join(ROOT, "InstallerGUI.cs"), "utf8").match(/AssemblyInformationalVersion\("([^"]+)"\)/)[1];

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>Endcord Installer</string>
    <key>CFBundleDisplayName</key><string>Endcord Installer</string>
    <key>CFBundleIdentifier</key><string>com.endcord.installer</string>
    <key>CFBundleVersion</key><string>${version}</string>
    <key>CFBundleShortVersionString</key><string>${version}</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleExecutable</key><string>EndcordInstaller</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>LSMinimumSystemVersion</key><string>10.13</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSAppleEventsUsageDescription</key><string>Endcord Installer asks Discord to quit before it changes Discord's files.</string>
</dict>
</plist>
`;

// [path inside the zip, contents or null for a folder, Unix mode]
const entries = [
    [`${APP}/`, null, 0o40755],
    [`${APP}/Contents/`, null, 0o40755],
    [`${APP}/Contents/MacOS/`, null, 0o40755],
    [`${APP}/Contents/Resources/`, null, 0o40755],
    [`${APP}/Contents/Info.plist`, Buffer.from(infoPlist), 0o100644],
    [`${APP}/Contents/MacOS/EndcordInstaller`, readFileSync(join(ROOT, "scripts/macInstaller/EndcordInstaller")), 0o100755],
    [`${APP}/Contents/Resources/install.sh`, readFileSync(join(ROOT, "install.sh")), 0o100755],
    [`${APP}/Contents/Resources/AppIcon.icns`, readFileSync(join(ROOT, "scripts/macInstaller/AppIcon.icns")), 0o100644],
    // Endcord itself, so the app installs this exact build without downloading anything
    [`${APP}/Contents/Resources/files/`, null, 0o40755],
    ...["patcher.js", "preload.js", "renderer.js", "renderer.css"].map(name =>
        [`${APP}/Contents/Resources/files/${name}`, readFileSync(join(ROOT, "dist", name)), 0o100644])
];

// Scripts must have Unix line endings to run
for (const entry of entries)
    if (entry[1] && /EndcordInstaller$|install\.sh$/.test(entry[0])) entry[1] = Buffer.from(entry[1].toString("utf8").replace(/\r\n/g, "\n"));

// Minimal zip writer: deflate for files, Unix modes in the external attributes ("made by" Unix)
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
const locals = [];
const centrals = [];
let offset = 0;
for (const [name, data, mode] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const raw = data ?? Buffer.alloc(0);
    const packed = data ? deflateRawSync(raw) : raw;
    const method = data ? 8 : 0;
    const crc = data ? crc32(raw) : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(((mode << 16) | (data ? 0 : 0x10)) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + packed.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

writeFileSync(OUT, Buffer.concat([...locals, ...centrals, end]));
console.log(`Wrote ${OUT} (Endcord Installer ${version})`);
