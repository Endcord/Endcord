/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFile as childExecFile } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import { join } from "path";
import { promisify } from "util";

const execFile = promisify(childExecFile);

// By full path: Windows looks a bare name up in the working folder first, so a planted powershell.exe would run instead
const POWERSHELL = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

const powershell = (script: string) =>
    execFile(POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });

/**
 * Manages Windows Graphics Settings (DirectX) for Discord.
 * Automatically binds the current Discord executable to the preferred GPU
 * and cleans up stale registry entries from previous versions.
 */
export async function applyGpuPreference(_event: IpcMainInvokeEvent, preference: number): Promise<boolean> {
    // Only Windows supports this registry-based GPU binding
    if (process.platform !== "win32") return false;

    // 0 = let Windows decide, 1 = power saving, 2 = high performance
    if (!Number.isInteger(preference) || preference < 0 || preference > 2) {
        throw new Error(`Invalid GPU preference: ${preference}`);
    }

    // Current Discord executable path (changes with every update)
    const discordPath = process.execPath;
    const regPath = "HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences";
    const gpuValue = `GpuPreference=${preference};`;

    // Escape single quotes for PowerShell
    const nameEsc = discordPath.replace(/'/g, "''");
    const valEsc = gpuValue.replace(/'/g, "''");
    const regPathEsc = regPath.replace(/'/g, "''");

    try {
        // 1. Check if the current executable already has the correct preference set
        const { stdout } = await powershell(`$p = '${regPathEsc}'; $n = '${nameEsc}'; if (Test-Path $p) { (Get-ItemProperty -Path $p -ErrorAction SilentlyContinue).$n } else { '' }`);
        const currentValue = (stdout || "").trim();

        let changed = false;

        // 2. Apply or update settings if they don't match the desired preference
        if (currentValue !== gpuValue) {
            await powershell(`$p = '${regPathEsc}'; if (-not (Test-Path $p)) { New-Item -Path $p -Force | Out-Null }; Set-ItemProperty -Path $p -Name '${nameEsc}' -Value '${valEsc}' -Type String -Force`);
            console.debug("[GpuBinder Native] Applied GPU preference to current Discord path.");
            changed = true;
        }

        // 3. Stale Entries Cleanup
        // This removes old registry properties containing 'Discord.exe' that point to
        // non-existent previous version folders (e.g., app-1.0.9001), keeping the registry clean.
        await powershell(`$p = '${regPathEsc}'; if (Test-Path $p) { $props = Get-ItemProperty -Path $p; $props.PSObject.Properties | Where-Object { $_.Name -like '*Discord.exe*' -and $_.Name -ne '${nameEsc}' } | ForEach-Object { Remove-ItemProperty -Path $p -Name $_.Name -ErrorAction SilentlyContinue } }`);

        return changed;
    } catch (error) {
        console.error("[GpuBinder Native] Registry operation failed:", error);
        throw error;
    }
}
