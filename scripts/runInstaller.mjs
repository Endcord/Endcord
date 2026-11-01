/*
 * Endcord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./checkNodeVersion.js";

import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Uses the installers in this repo and the files in dist/, so nothing gets downloaded and run
const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const uninstall = process.argv.includes("--uninstall");

const run = (command, args) => execFileSync(command, args, { cwd: BASE_DIR, stdio: "inherit" });

try {
    if (process.platform === "win32") {
        run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/buildInstaller.ps1", "-NoSite"]);
        console.log(`Opening the installer. Choose ${uninstall ? "Uninstall" : "Install"} there.`);
        run(join(BASE_DIR, "EndcordInstaller.exe"), []);
    } else {
        run("sh", ["install.sh", ...(uninstall ? ["--uninstall"] : ["--install", "--local", "dist"])]);
    }
} catch {
    console.error("Something went wrong. Please check the logs above.");
}
