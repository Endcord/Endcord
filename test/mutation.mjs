/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Tests the tests. Each entry switches off one security check, and test/security.mjs has to notice.
// A survivor means that protection could be deleted tomorrow with every test still green.
import { spawn } from "child_process";
import { cpus } from "os";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");

const MUTATIONS = [
    ["IPC stops checking the sender", "src/main/utils/ipc.ts", "if (!isTrustedSender(event, channel)) throw new Error(`Refused ${channel}`);", ""],
    ["The editor page gets every channel", "src/main/utils/ipc.ts", "return EDITOR_CHANNELS.has(channel);", "return true;"],
    ["Origin check loses its end anchor", "src/shared/trustedOrigins.ts", String.raw`discord\.com)$/`, String.raw`discord\.com)/`],
    ["Origin check accepts plain http", "src/shared/trustedOrigins.ts", "^https:", "^https?:"],
    ["Preload trusts every page", "src/preload.ts", "isDiscordOrigin(window.origin)", "true"],
    ["A second install replaces the kept version", "src/main/updater/http.ts", "if (await installedFilesMatch(PendingUpdates)) {", "if (false) {"],
    ["Files count as matching without a check", "src/main/updater/http.ts", 'await installedFilesMatch(manifest.assets) ? "match" : "changed"', '"match"'],
    ["An unsigned manifest counts as checked", "src/main/updater/http.ts", "trust.signed = isSignedManifest(manifest);", "trust.signed = true;"],
    ["Link check allows every protocol", "src/shared/externalLinks.ts", "return LINK_PROTOCOLS.includes(new URL(href ?? \"\", \"https://discord.com/\").protocol);", "return true;"],
    ["External links allow every protocol", "src/shared/externalLinks.ts", "if (!ALLOWED_PROTOCOLS.includes(protocol)) return false;", ""],
    ["Steam links lose their check", "src/shared/externalLinks.ts", "if (protocol === \"steam:\" && !SAFE_STEAM_URL.test(url)) return false;", ""],
    ["Native fetches reach the local network", "src/main/utils/http.ts", "addresses.some(({ address }) => isPrivateAddress(address))", "false"],
    ["Written-out addresses skip the check", "src/main/utils/http.ts", "if (isIP(host) && isPrivateAddress(host)) throw new Error(\"Disallowed URL\");", ""],
    ["NAT64 addresses are allowed", "src/main/utils/http.ts", "[\"64:ff9b::\", 96], ", ""],
    ["A redirect can drop to http", "src/main/utils/http.ts", "if (parsed.protocol === \"https:\" && next.protocol !== \"https:\") throw new Error(\"Disallowed URL\");", ""],
    ["Host allowlist accepts any host", "src/main/utils/http.ts", "|| !hosts.includes(parsed.hostname)", ""],
    ["Host allowlist accepts http", "src/main/utils/http.ts", "parsed?.protocol !== \"https:\" ||", "!parsed ||"],
    ["readBody ignores its limit", "src/main/utils/http.ts", "if (total > maxBytes) {", "if (false) {"],
    ["Paths stop checking file names", "src/main/utils/ensureSafePath.ts", "if (!names.every(isSafeFileName)) return null;", ""],
    ["Paths can leave their base", "src/main/utils/ensureSafePath.ts", "normalizedPath === normalize(basePath) || normalizedPath.startsWith(normalizedBasePath)", "true"],
    ["Updates skip the signature", "src/main/updater/http.ts", "if (!isSignedManifest(apiData)) {", "if (false) {"],
    ["Updates skip the checksum", "src/main/updater/http.ts", "if (actual !== sha256)", "if (false)"],
    ["Updates accept any download host", "src/main/updater/http.ts", "isAllowedAssetUrl(a.url) && ", ""],
    ["A failed update is offered again", "src/main/updater/http.ts", "if (isRejectedUpdate(apiData.hash)) return false;", ""],
    ["A broken update is never undone", "src/main/updater/rollback.ts", "if (++state.loads < MAX_UNCONFIRMED_LOADS) {", "if (true) {"],
    ["A half-done swap isn't recovered", "src/main/updater/rollback.ts", "if (!state?.swapping) return false;", "return false;"],
    ["Rollback doesn't restore the files", "src/main/updater/rollback.ts", "if (existsSync(previous)) copyFileSync(previous, join(__dirname, name));", ""],
    ["Damaged settings aren't recovered", "src/main/utils/durableFile.ts", "return JSON.parse(readFileSync(backupOf(path), \"utf-8\"));", "return null;"],
    ["Writes keep no backup", "src/main/utils/durableFile.ts", "if (existsSync(path)) copyFileSync(path, backupOf(path));", ""],
    ["Logger prints arguments unchanged", "src/utils/Logger.ts", "const args = rawArgs.map(scrub);", "const args = rawArgs;"],
    ["Tokens reach the logs", "src/shared/redact.ts", String.raw`[/\b[\w-]{20,}\.[\w-]{6}\.[\w-]{27,}\b/g, REDACTED],`, ""],
    ["Secrets go out with exports", "src/api/SettingsSync/offline.ts", "for (const key of getSensitiveKeys(plugin)) delete settings.plugins[pluginName]?.[key];", ""],
    ["Cloud sync can set secrets", "src/api/SettingsSync/offline.ts", "keepLocalSettings(parsed.settings, source);", ""],
    ["Imports allow prototype pollution", "src/api/SettingsSync/offline.ts", "if (!isSafeObject(parsed))", "if (false)"],
    ["Permission prompts show raw names", "src/main/csp/manager.ts", "String(callerName ?? \"\").replace(/\\s+/g, \" \").trim().slice(0, 40)", "String(callerName ?? \"\")"],
    ["Recordings can be any file type", "src/plugins/callrecorder/native.ts", "|| !/^[\\w.-]+\\.ogg$/.test(filename)", ""],
    ["Message logger takes any extension", "src/plugins/messageLoggerEnhanced/native/index.ts", "!SAFE_EXTENSION.test(cleanExt) || ", ""],
    ["Message logger takes any id", "src/plugins/messageLoggerEnhanced/native/index.ts", "if (!SAFE_ATTACHMENT_ID.test(attachment.id)) {", "if (false) {"],
    ["PDF limit can be switched off", "src/plugins/pdf-viewer/native.ts", "Math.min(Number(maxBytes) || 0, MAX_PDF_BYTES)", "maxBytes"],
    ["Quest id can hold a host", "src/plugins/questify/native.ts", "if (!/^\\d+$/.test(appId)) {", "if (false) {"],
    ["Rollback puts back a kept copy that changed", "src/main/updater/rollback.ts", "sha256(join(PREVIOUS_DIR, name)) !== state.previous![name]", "false"],
    ["A rejection never expires", "src/main/updater/rollback.ts", "Date.now() - (rejection.at ?? 0) < REJECTION_TTL", "true"],
    ["S3 uploads reach the local network", "src/plugins/fileUpload/native.ts", "const response = await fetchPublicUrl(uploadUrl, { method: \"PUT\", headers: { ...headers }, body: new Uint8Array(fileBuffer) });", "const response = await fetch(uploadUrl, { method: \"PUT\", headers, body: new Blob([fileBuffer]) });"],
    ["Theme downloads have no size limit", "src/plugins/themeLibrary/native.ts", "const content = await readBody(download, MAX_THEME_BYTES);", "const content = await readBody(download, Infinity);"],
    ["Custom uploads skip the address check", "src/plugins/fileUpload/native.ts", "const response = await fetchPublicUrl(url, { method, headers: { ...headers }, body: body ?? undefined });", "const response = await fetch(url, { method, headers, body });"]
];

const only = process.argv[2]?.toLowerCase();
const queue = MUTATIONS.filter(([name]) => !only || name.toLowerCase().includes(only));

function run([name, file, from, to]) {
    return new Promise(resolve => {
        const child = spawn(process.execPath, [join(ROOT, "test", "security.mjs")], {
            cwd: ROOT,
            env: { ...process.env, ENDCORD_MUTATION: JSON.stringify({ file, from, to }) },
            stdio: ["ignore", "pipe", "pipe"]
        });

        let output = "";
        child.stdout.on("data", d => output += d);
        child.stderr.on("data", d => output += d);
        child.on("close", code => {
            const failedChecks = output.split("\n").filter(line => line.startsWith("FAIL")).length;
            resolve({ name, invalid: output.includes("MUTATION_NOT_APPLIED"), killed: code !== 0, failedChecks });
        });
    });
}

const results = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(4, Math.max(1, cpus().length - 1)) }, async () => {
    while (next < queue.length) {
        const result = await run(queue[next++]);
        results.push(result);
        console.log(`${result.invalid ? "STALE   " : result.killed ? "CAUGHT  " : "SURVIVED"}  ${result.name}${result.failedChecks ? ` (${result.failedChecks} checks failed)` : ""}`);
    }
}));

const survivors = results.filter(r => !r.killed);
const stale = results.filter(r => r.invalid);
console.log(`\n${results.length - survivors.length - stale.length} of ${results.length} caught`);
if (stale.length) console.log(`${stale.length} no longer match the source: update them`);
process.exit(survivors.length || stale.length ? 1 : 0);
