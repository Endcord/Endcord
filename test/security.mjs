/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Bundles the real main-process code with electron stubbed out, then attacks it from Node.
// The network checks that read cdn.discordapp.com need internet access.
import { execFile } from "child_process";
import { generateKeyPairSync, sign } from "crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync as listDirectory, readFileSync, rmSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const ROOT = join(import.meta.dirname, "..");
const IS_WINDOWS = process.platform === "win32";
const require = createRequire(join(ROOT, "package.json"));
const esbuild = require("esbuild");
const { zipSync, strToU8 } = require("fflate");

const OUT = mkdtempSync(join(tmpdir(), "endcord-security-"));
process.env.ENDCORD_USER_DATA_DIR = join(OUT, "data");
mkdirSync(process.env.ENDCORD_USER_DATA_DIR, { recursive: true });

// A key made for this run: the suite never needs the real one
const { privateKey: key, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

const DISCORD_FRAME = { senderFrame: { url: "https://discord.com/app", origin: "https://discord.com" } };
globalThis.__discordFrame = DISCORD_FRAME;

const stubs = {
    electron: `
        globalThis.__handlers = {}; globalThis.__rawHandlers = {}; globalThis.__opened = []; globalThis.__appListeners = {};
        export const ipcMain = { handle: (k, f) => { __rawHandlers[k] = f; __handlers[k] = (e, ...a) => f(e ?? __discordFrame, ...a); }, on() {} };
        export const app = { getPath: () => ${JSON.stringify(OUT)}, on: (e, f) => { __appListeners[e] = f; } };
        export const shell = { openExternal: u => __opened.push(u) };
        export const session = { defaultSession: { loadExtension() {} } };
        export const dialog = { showMessageBox: async options => { globalThis.__dialog = options; return { response: 0, checkboxChecked: false }; } };
        export const net = {};
        export class BrowserWindow {}`,
    "~git-hash": "export default 'abc1234';",
    "electron/renderer": `
        export const contextBridge = { exposeInMainWorld: name => globalThis.__exposed.push(name) };
        export const webFrame = { executeJavaScript: () => { globalThis.__rendererRan = true; } };
        export const ipcRenderer = { sendSync: () => ({}), invoke: async () => {}, on() {} };`,
    "~git-remote": "export default 'Endcord/Endcord';",
    "@api/Settings": "export const PlainSettings = globalThis.__plain;",
    "@utils/i18n": "export const t = s => s;",
    "@utils/Logger": "export class Logger { error() {} info() {} }",
    "@utils/web": "export const chooseFile = () => {}; export const saveFile = () => {};",
    "@webpack/common": "export const moment = {}; export const Toasts = {};",
    "~plugins": "export default { Secret: { settings: { def: { key: { sensitive: true, default: '' }, url: { sensitive: true, default: 'https://default.example' }, plain: {} } } }, NoSettings: {} };",
    "@main/settings": "export const RendererSettings = { store: { plugins: { YoutubeAdblock: { enabled: true } } } }; export const NativeSettings = { store: { customCspRules: {} } };",
    https: `import { request as real } from "node:https";
        import { Readable } from "node:stream";
        export const request = (url, opts, cb) => {
            if (!String(url).includes("spotify.link")) return real(url, opts, cb);
            globalThis.__hops = (globalThis.__hops ?? 0) + 1;
            globalThis.__hopMethod = opts.method;
            const to = String(url).includes("/private") ? "https://127.0.0.1/" : String(url).includes("/downgrade") ? "http://example.com/" : "https://spotify.link/loop";
            if (String(url).includes("/last")) {
                const res = Readable.from([]);
                Object.assign(res, { statusCode: 200, headers: {}, rawHeaders: [] });
                return { on() {}, end() { cb(res); } };
            }
            return { on() {}, end() { cb({ statusCode: 302, resume() {}, headers: { location: String(url).includes("/hop") ? "https://spotify.link/last" : to } }); } };
        };`,
    http: `import { request as real } from "node:http";
        import { EventEmitter } from "node:events";
        export const request = (url, opts, cb) => {
            if (String(url).includes("file.test")) {
                globalThis.__fileRequests = (globalThis.__fileRequests ?? 0) + 1;
                const req = new EventEmitter();
                req.end = async () => {
                    const { Readable } = await import("node:stream");
                    const res = Readable.from([Buffer.from("image bytes")]);
                    Object.assign(res, { statusCode: 200, headers: {}, rawHeaders: [] });
                    cb(res);
                };
                return req;
            }
            if (!String(url).includes("redirector.test")) return real(url, opts, cb);
            globalThis.__redirects = (globalThis.__redirects ?? 0) + 1;
            globalThis.__sentHeaders = opts.headers;
            const req = new EventEmitter();
            req.end = () => cb({ statusCode: 302, headers: { location: globalThis.__redirectTo }, rawHeaders: [], resume() {} });
            return req;
        };`
};
const mutation = process.env.ENDCORD_MUTATION ? JSON.parse(process.env.ENDCORD_MUTATION) : null;
const stubPlugin = {
    name: "stubs",
    setup(b) {
        // test/mutation.mjs switches one check off through this, to prove these tests would notice
        if (mutation) b.onLoad({ filter: /\.tsx?$/ }, a => {
            if (!a.path.split("\\").join("/").endsWith(mutation.file)) return;

            const source = readFileSync(a.path, "utf8").split("\r\n").join("\n");
            if (!source.includes(mutation.from)) {
                console.error("MUTATION_NOT_APPLIED");
                process.exit(2);
            }
            return { contents: source.replace(mutation.from, () => mutation.to), loader: a.path.endsWith("x") ? "tsx" : "ts" };
        });

        const filter = new RegExp(`^(${Object.keys(stubs).map(s => s.replace(/[/~@]/g, "\\$&")).join("|")})$`);
        b.onResolve({ filter }, a => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, a => ({ contents: stubs[a.path], loader: "js" }));
        b.onResolve({ filter: /^file:\/\// }, a => ({ path: a.path, namespace: "file-stub", pluginData: a.resolveDir }));
        b.onLoad({ filter: /.*/, namespace: "file-stub" }, a => ({
            contents: `export default ${a.path.includes("updateKey") ? JSON.stringify(publicKey.export({ type: "spki", format: "pem" })) : '"adguard"'}`,
            loader: "js"
        }));
    }
};

const entry = `
export * as offline from "./src/api/SettingsSync/offline";
export { fetchPdf } from "./src/plugins/pdf-viewer/native";
export { fetchMedia as gifMakerFetch } from "./src/plugins/gifMaker/native";
export { fetchAttachment as favoriteFetch } from "./src/plugins/favoriteAnything/native";
export { isSafeExternalUrl, isSafeLink } from "./src/shared/externalLinks";
export { makeLinksOpenExternally } from "./src/main/utils/externalLinks";
export { installExt } from "./src/main/utils/extensions";
export { IpcEvents } from "./src/shared/IpcEvents";
export * as uploader from "./src/plugins/fileUpload/native";
export * as recorder from "./src/plugins/callrecorder/native";
export * as gpu from "./src/plugins/gpuBinder/native";
export * as questify from "./src/plugins/questify/native";
export * as openInApp from "./src/plugins/openInApp/native";
export * as zipPlusNative from "./src/plugins/ZIPplus/native";
export * as gifNative from "./src/plugins/gifCaptioner/native";
export * as audioNative from "./src/plugins/betterAudioPlayer/native";
export * as transcriber from "./src/plugins/voiceMessageTranscriber.desktop/native";
export * as mle from "./src/plugins/messageLoggerEnhanced/native";
export { unzipBlob } from "./src/plugins/ZIPplus/unzip";
export { getCachedZip } from "./src/plugins/zipPreview/utils";
export { canSendCredentials } from "./src/plugins/richPresence/services/serverUrl";
export { readBody } from "./src/main/utils/http";
export { isSecureCloudUrl } from "./src/api/SettingsSync/cloudUrl";
export { registerCspIpcHandlers } from "./src/main/csp/manager";
export { isTrustedSender } from "./src/main/utils/ipc";
export { canonicalizeMatch } from "./src/utils/patches";
export { DISCORD_CDN_HOSTS, parseAllowedUrl } from "./src/main/utils/http";
export { ensureSafePath, isSafeFileName } from "./src/main/utils/ensureSafePath";
export { readJsonDurably, writeFileDurably } from "./src/main/utils/durableFile";
export { redactSecrets } from "./src/shared/redact";
export * as rollback from "./src/main/updater/rollback";
export { runtimeHashMessageKey } from "./src/utils/intlHash";
import "./src/main/updater/http";
import "./src/plugins/youtubeAdblock.desktop/native";
`;
await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, loader: "ts" },
    bundle: true, platform: "node", format: "cjs", outfile: join(OUT, "bundle.cjs"), tsconfig: join(ROOT, "tsconfig.json"), logLevel: "error",
    plugins: [stubPlugin],
    define: { IS_DISCORD_DESKTOP: "true", IS_VESKTOP: "false", IS_DEV: "false", IS_STANDALONE: "true", IS_WEB: "false", BUILD_TIMESTAMP: "1000", VERSION: '"0"' }
});

globalThis.__plain = { plugins: { Secret: { key: "LOCAL-SECRET", plain: 1 } } };
globalThis.EndcordNative = {
    settings: { get: () => ({ plugins: { Secret: { key: "LOCAL-SECRET", plain: 1 } } }), set: async s => { globalThis.__setSettings = s; } },
    quickCss: { get: async () => "css", set: async () => {} },
    pluginHelpers: { ZipPreview: { fetchDiscordAttachment: async () => ({ success: true, data: globalThis.__zip }) } }
};
const m = require(join(OUT, "bundle.cjs"));

let failed = 0;
function check(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -> ${JSON.stringify(detail)}`}`);
    if (!ok) failed++;
}
const rejects = p => p.then(() => false, () => true);

// ---- Updater: the real handlers against a fake network ----------------------------------------------
const realFetch = globalThis.fetch;
const FILES = { "patcher.js": "p", "preload.js": "l", "renderer.js": "r", "renderer.css": "c" };
const { createHash } = await import("crypto");
const hex = s => createHash("sha256").update(s).digest("hex");
const RAW = "https://raw.githubusercontent.com/Endcord/Endcord/main/dist/";
const payloadOf = ({ version, hash, updatedAt, installerSha256, assets }) => Buffer.from([version, hash, updatedAt, installerSha256, ...assets.map(a => `${a.name} ${a.sha256}`).sort()].join("\n"));
function manifest(over = {}, signWith = key) {
    const data = { version: "9", hash: "newhash", updatedAt: 5000, installerSha256: hex("installer"), assets: Object.entries(FILES).map(([name, c]) => ({ name, url: RAW + name, sha256: hex(c) })), ...over };
    return { ...data, signature: sign("sha256", payloadOf(data), signWith).toString("base64") };
}
let served, bodies;
globalThis.fetch = async url => String(url).includes("version.json") ? Response.json(served) : new Response(bodies[String(url).split("/").pop()]);
const { UPDATE, BUILD } = m.IpcEvents;
const h = globalThis.__handlers;
const offers = async mf => { served = mf; return (await h[UPDATE]()).value; };

bodies = FILES;
check("signed release is accepted", await offers(manifest()) === true);
const applied = await h[BUILD]();
check("signed release installs", applied.ok && readFileSync(join(OUT, "renderer.js"), "utf8") === "r", applied);
const good = manifest();
check("unsigned manifest refused", await offers({ ...good, signature: undefined }) === false);
check("garbage signature refused", await offers({ ...good, signature: "AAAA" }) === false);
check("swapped file hash refused", await offers({ ...good, assets: good.assets.map(a => a.name === "renderer.js" ? { ...a, sha256: hex("evil") } : a) }) === false);
check("edited timestamp refused", await offers({ ...good, updatedAt: 9999 }) === false);
check("edited version refused", await offers({ ...good, version: "10" }) === false);
check("edited installer hash refused", await offers({ ...good, installerSha256: hex("evil") }) === false);
check("correctly signed manifest with a missing field refused", await offers(manifest({ installerSha256: undefined })) === false);
check("correctly signed manifest with a text timestamp refused", await offers(manifest({ updatedAt: "9000" })) === false);
const stranger = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
check("attacker's own key refused", await offers(manifest({}, stranger)) === false);
const evilHost = { ...good, assets: good.assets.map(a => ({ ...a, url: `https://evil.example/${a.name}` })) };
check("evil download host refused", await offers(evilHost) === false);
check("plain http refused", await offers(manifest({ assets: good.assets.map(a => ({ ...a, url: a.url.replace("https:", "http:") })) })) === false);
check("non-https endcord.com refused, https allowed", await offers(manifest({ assets: good.assets.map(a => ({ ...a, url: `https://endcord.com/dist/${a.name}` })) })) === true);
await offers(manifest());
bodies = { ...FILES, "renderer.js": "evil" };
const badFile = await h[BUILD]();
check("download not matching its hash aborts", !badFile.ok && readFileSync(join(OUT, "renderer.js"), "utf8") === "r", badFile);
// ---- Updates that undo themselves -----------------------------------------------------------------------
const inOut = name => join(OUT, name);
const installBad = async hash => {
    bodies = FILES;
    writeFileSync(inOut("renderer.js"), "good");
    served = manifest({ hash });
    await h[UPDATE]();
    await h[BUILD]();
};

await installBad("broken-release");
check("an update installs before it's proven", readFileSync(inOut("renderer.js"), "utf8") === "r" && existsSync(inOut("update-state.json")));
check("one failed load proves nothing", m.rollback.recordUnconfirmedLoad() === false);
check("two failed loads prove nothing", m.rollback.recordUnconfirmedLoad() === false);
check("the third puts the old version back", m.rollback.recordUnconfirmedLoad() === true && readFileSync(inOut("renderer.js"), "utf8") === "good");
check("nothing is left pending after that", !existsSync(inOut("update-state.json")) && m.rollback.recordUnconfirmedLoad() === false);
check("the release that failed isn't offered again", await offers(manifest({ hash: "broken-release" })) === false);
check("the next release is", await offers(manifest({ hash: "fixed-release" })) === true);

await installBad("working-release");
m.rollback.confirmUpdate();
check("a confirmed update stays", m.rollback.recordUnconfirmedLoad() === false && m.rollback.recordUnconfirmedLoad() === false && m.rollback.recordUnconfirmedLoad() === false && readFileSync(inOut("renderer.js"), "utf8") === "r");

writeFileSync(inOut("renderer.js"), "good");
m.rollback.keepPreviousVersion("half-installed");
writeFileSync(inOut("renderer.js"), "half");
check("a crash in the middle of the swap is undone at the next start", m.rollback.recoverInterruptedUpdate() === true && readFileSync(inOut("renderer.js"), "utf8") === "good");
check("a normal start finds nothing to recover", m.rollback.recoverInterruptedUpdate() === false);
rmSync(inOut("update-rejected.json"), { force: true });
writeFileSync(inOut("renderer.js"), "r");

globalThis.fetch = realFetch;

// ---- Files that survive a power cut -----------------------------------------------------------------------
const durable = join(OUT, "durable.json");
m.writeFileDurably(durable, '{"a":1}');
m.writeFileDurably(durable, '{"a":2}');
check("a durable write leaves no temp file", readFileSync(durable, "utf8") === '{"a":2}' && !listDirectory(OUT).some(name => name.includes("durable.json.") && name.endsWith(".tmp")));
check("the last good copy is kept", readFileSync(`${durable}.bak`, "utf8") === '{"a":1}');
for (const [name, damage] of [["emptied by a power cut", ""], ["cut off halfway", '{"a":'], ["filled with garbage", "\0\0\0"]]) {
    writeFileSync(durable, damage);
    check(`settings recover when ${name}`, m.readJsonDurably(durable)?.a === 1, m.readJsonDurably(durable));
}
check("the damaged file is kept for support", existsSync(`${durable}.damaged`));
check("a missing file is simply new", m.readJsonDurably(join(OUT, "never-written.json")) === null);

// ---- Names Windows treats specially ---------------------------------------------------------------------
for (const name of ["CON", "con.css", "NUL", "nul.theme.css", "AUX.txt", "PRN", "COM1", "com9.css", "LPT1", "CONIN$", "conout$.css", "a.css:stream", "a.css::$DATA", "a.css.", "a.css ", "a<b", "a>b", 'a"b', "a|b", "a?b", "a*b", "a\0b", "a\nb"])
    check(`file name refused: ${JSON.stringify(name)}`, m.isSafeFileName(name) === false);
for (const name of ["theme.css", "my theme.theme.css", "console.css", "nullable.css", "com10.css", "auxiliary.css", "a.b.c", ".hidden"])
    check(`file name allowed: ${name}`, m.isSafeFileName(name) === true);
const themes = join(OUT, "themes");
for (const path of ["../settings.json", "..\\settings.json", "sub/../../x", "CON", "sub/NUL.css", "a.css:evil"])
    check(`path refused: ${path}`, m.ensureSafePath(themes, path) === null);
check("a normal path still works", m.ensureSafePath(themes, "sub/theme.css") === join(themes, "sub", "theme.css"));

// ---- Secrets in logs ---------------------------------------------------------------------------------------
await esbuild.build({
    stdin: { contents: 'export { Logger } from "./src/utils/Logger";', resolveDir: ROOT, loader: "ts" },
    bundle: true, platform: "node", format: "cjs", outfile: join(OUT, "logger.cjs"), tsconfig: join(ROOT, "tsconfig.json"), logLevel: "error",
    plugins: mutation ? [{ name: "mutation", setup: stubPlugin.setup }] : [],
    define: { IS_REPORTER: "false", IS_WEB: "false", IS_VESKTOP: "false" }
});
{
    const { Logger } = require(join(OUT, "logger.cjs"));
    const secret = ["MTIzNDU2Nzg5MDEyMzQ1Njc4", "GabcDE", "abcdefghijklmnopqrstuvwxyz1234567"].join(".");
    const printed = [];
    const realInfo = console.info;
    console.info = (...args) => printed.push(args);
    new Logger("Test").info("token is", secret, new Error(`failed with ${secret}`), { kept: 1 });
    console.info = realInfo;

    const text = printed.flat().map(arg => arg instanceof Error ? arg.stack : String(arg)).join(" ");
    check("Logger removes a token from what it prints", printed.length === 1 && !text.includes(secret) && text.includes("[redacted]"), text.slice(0, 200));
    check("Logger keeps the error type and other values", printed[0].some(arg => arg instanceof Error) && printed[0].some(arg => arg?.kept === 1));
}

const token = ["MTIzNDU2Nzg5MDEyMzQ1Njc4", "GabcDE", "abcdefghijklmnopqrstuvwxyz1234567"].join(".");
for (const [name, text] of [["Discord token", `login ${token}`], ["token from a 17-digit account", `login ${token.slice(1)}`], ["old mfa token", `mfa.${"a".repeat(84)}`], ["bearer header", "Authorization: Bearer abc.def-ghi123"], ["github token", `ghp_${"a".repeat(36)}`], ["openai key", `sk-${"a".repeat(40)}`], ["aws key", `AKIA${"A".repeat(16)}`], ["json field", '{"api_key":"abcdef123456"}'], ["url parameter", "https://x.test/?access_token=abcdef123456&b=1"]]) {
    const clean = m.redactSecrets(text);
    check(`log hides a ${name}`, clean.includes("[redacted]") && !clean.includes("abcdef123456") && !clean.includes(token), clean);
}
check("ordinary log text is left alone", m.redactSecrets("Patch by Foo had no effect (module 123456789012345678)") === "Patch by Foo had no effect (module 123456789012345678)");

// ---- External links ---------------------------------------------------------------------------------
for (const url of ["https://discord.com/x y", "spotify://track/abc?si=1", "spotify:track:abc", "spotify:user:abc", "steam://openurl/https://store.steampowered.com/app/1", "steam://rungameid/730", "steam://run/730/",
    "com.epicgames.launcher://store/p/fortnite", "com.epicgames.launcher://apps/fn%3A4fe75bbc%3AFortnite?action=launch&silent=true", "tidal://track/123", "itunes://music.apple.com/us/album/name/1"])
    check(`allowed ${url}`, m.isSafeExternalUrl(url) === true);
for (const url of ["steam://run/730//-console", "steam://rungameid/730//+exec", "steam://install/1", 'spotify:x" --gpu-launcher=calc', "spotify:a b", "tidal://x\\..\\y", "file:///c:/windows/system32/calc.exe", "javascript:alert(1)", "ms-msdt:/id", "notaurl", ""])
    check(`refused ${url}`, m.isSafeExternalUrl(url) === false);

// ---- fetchFile --------------------------------------------------------------------------------------
for (const url of ["http://127.0.0.1:9333/json", "http://localhost:9333/json", "http://[::1]:9333/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[64:ff9b::7f00:1]/", "http://[2002:7f00:1::]/", "http://[2001:0:7f00:1::]/", "http://[fec0::1]/", "http://2130706433/", "http://0x7f.0.0.1/", "http://0177.0.0.1/", "http://127.1/", "http://192.168.1.1/", "http://10.0.0.1/", "http://169.254.169.254/latest/meta-data", "file:///c:/windows/win.ini", "ftp://example.com/"]) {
    const r = await m.uploader.fetchFile(null, url);
    check(`fetchFile refuses ${url}`, r.success === false && r.error === "Disallowed URL", r);
}
const avatar = await m.uploader.fetchFile(null, "https://cdn.discordapp.com/embed/avatars/0.png");
check("fetchFile still reads the Discord CDN", avatar.success === true && avatar.data.byteLength > 100, { ...avatar, data: undefined });
const external = await m.uploader.fetchFile(null, "https://www.google.com/favicon.ico");
check("fetchFile still reads a public site", external.success === true, { ...external, data: undefined });
globalThis.__redirectTo = "http://127.0.0.1:9333/json";
const redirected = await m.uploader.fetchFile(null, "http://redirector.test/x");
check("fetchFile blocks a redirect into localhost", redirected.success === false && redirected.error === "Disallowed URL" && globalThis.__redirects === 1, { redirected, hops: globalThis.__redirects });
globalThis.__redirects = 0;
globalThis.__redirectTo = "http://redirector.test/next";
const looped = await m.uploader.fetchFile(null, "http://redirector.test/x");
check("fetchFile stops a redirect loop", looped.success === false && looped.error === "Too many redirects" && globalThis.__redirects === 6, { looped, hops: globalThis.__redirects });

check("fetches ask for an uncompressed body", globalThis.__sentHeaders?.["Accept-Encoding"] === "identity", globalThis.__sentHeaders);

// Size limits that don't depend on what the server claims
const streamed = (chunkSize, chunks, headers) => {
    let sent = 0, cancelled = false;
    const body = new ReadableStream({
        pull(c) { if (sent++ >= chunks) c.close(); else c.enqueue(new Uint8Array(chunkSize)); },
        cancel() { cancelled = true; }
    });
    return { response: new Response(body, { headers }), sent: () => sent, cancelled: () => cancelled };
};
const small = streamed(1024, 4);
check("readBody returns a body under the limit", (await m.readBody(small.response, 8192))?.byteLength === 4096);
const noLength = streamed(1024 * 1024, 200);
check("readBody stops a chunked body with no length", await m.readBody(noLength.response, 5 * 1024 * 1024) === null && noLength.sent() < 20 && noLength.cancelled(), noLength.sent());
const lying = streamed(1024 * 1024, 200, { "content-length": "10" });
check("readBody ignores a lying Content-Length", await m.readBody(lying.response, 5 * 1024 * 1024) === null && lying.sent() < 20, lying.sent());
check("readBody handles an empty response", (await m.readBody(new Response(null), 10))?.byteLength === 0);
check("readBody result has its own exact buffer", (await m.readBody(streamed(10, 2).response, 100)).buffer.byteLength === 20);

// A plugin naming itself in the permission dialog
m.registerCspIpcHandlers();
await globalThis.__handlers[m.IpcEvents.CSP_REQUEST_ADD_OVERRIDE](undefined, "https://evil.example/x", ["connect-src"], `Discord\n\nWindows   Security${"x".repeat(80)}`);
const asked = globalThis.__dialog?.message ?? "";
check("permission dialog can't be worded as Discord", asked.startsWith('The Endcord plugin or feature "Discord Windows Security') && !asked.includes("\n") && asked.length < 120, asked);
await globalThis.__handlers[m.IpcEvents.CSP_REQUEST_ADD_OVERRIDE](undefined, "https://evil.example/x", ["connect-src"], "");
check("permission dialog names an unknown caller", globalThis.__dialog.message.includes('"Unknown"'), globalThis.__dialog.message);

// DNS rebinding: the resolver is scripted, the server and the connection are real
const dns = require("dns");
const realLookup = dns.lookup;
const { createServer } = await import("http");
let localHits = 0;
const localServer = createServer((_, res) => { localHits++; res.end("SECRET"); });
await new Promise(r => localServer.listen(0, "127.0.0.1", r));
const localPort = localServer.address().port;
const scriptDns = answers => {
    let calls = 0;
    dns.lookup = (host, options, cb) => {
        const address = answers[Math.min(calls++, answers.length - 1)];
        cb(null, [{ address, family: address.includes(":") ? 6 : 4 }]);
    };
    return () => calls;
};
let calls = scriptDns(["127.0.0.1"]);
const direct = await m.uploader.fetchFile(null, `http://evil.test:${localPort}/`);
check("hostname resolving to localhost is blocked", direct.error === "Disallowed URL" && localHits === 0, { direct, localHits });
calls = scriptDns(["::ffff:127.0.0.1"]);
const mapped = await m.uploader.fetchFile(null, `http://evil.test:${localPort}/`);
check("IPv4-mapped IPv6 answer is blocked", mapped.error === "Disallowed URL" && localHits === 0, mapped);
calls = scriptDns(["203.0.113.1", "127.0.0.1"]);
const rebound = await m.gifNative.fetchMedia(null, `http://evil.test:${localPort}/`);
check("rebinding: the checked answer is the one connected to", rebound === null && localHits === 0 && calls() === 1, { rebound, localHits, lookups: calls() });
dns.lookup = (host, options, cb) => cb(null, []);
const emptyAnswer = await m.uploader.fetchFile(null, `http://evil.test:${localPort}/`);
check("an empty DNS answer fails cleanly", emptyAnswer.success === false && emptyAnswer.error === "Disallowed URL", emptyAnswer);
dns.lookup = realLookup;
localServer.close();

const s3 = await m.uploader.uploadToS3(null, new ArrayBuffer(1), "http://127.0.0.1:9000/b/o", {});
check("S3 refuses plain http", s3.success === false, s3);

// ---- CallRecorder -----------------------------------------------------------------------------------
const buf = new ArrayBuffer(4);
const saved = await m.recorder.saveRecording(null, buf, OUT, "call-2026-10-30T12-00-00.ogg");
check("recording still saves", existsSync(saved));
for (const [folder, name] of [[OUT, "evil.bat"], [OUT, "evil.ogg.bat"], [OUT, "evil.ogg:stream.bat"], [OUT, "..\\evil.bat"], ["relative/folder", "a.ogg"], ...(IS_WINDOWS ? [["\\\\attacker\\share", "a.ogg"], ["//attacker/share", "a.ogg"]] : [])])
    check(`recorder refuses ${folder} / ${name}`, await rejects(m.recorder.saveRecording(null, buf, folder, name)));
check("recorder defaults to the Downloads folder", (await m.recorder.saveRecording(null, buf, "", "call-default.ogg")).startsWith(OUT));
check("no .bat was written", !existsSync(join(OUT, "evil.bat")));

// ---- GpuBinder --------------------------------------------------------------------------------------
if (IS_WINDOWS) {
    for (const bad of ['2"&calc&"', "2", 3, -1, 1.5, null])
        check(`gpu refuses ${JSON.stringify(bad)}`, await rejects(m.gpu.applyGpuPreference(null, bad)));
    const ps = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$p = 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences'; $n = 'C:\\no such\\Discord.exe'; if (Test-Path $p) { (Get-ItemProperty -Path $p -ErrorAction SilentlyContinue).$n } else { '' }; 'reached-end'"], { windowsHide: true });
    check("powershell gets the script as one argument", ps.stdout.trim() === "reached-end", ps);
}

// ---- Host allowlists: a DNS failure would pass these too, so the check is called directly -------------------
for (const url of ["https://evil.example/", "https://cdn.discordapp.com.evil.example/", "https://cdn.discordapp.com@evil.example/", "https://evil.example/cdn.discordapp.com", "https://evil.example#cdn.discordapp.com", "https://CDN.DISCORDAPP.COM.evil.example/"])
    check(`allowlist refuses ${url}`, await rejects(Promise.resolve().then(() => m.parseAllowedUrl(url, m.DISCORD_CDN_HOSTS))));
for (const url of ["https://cdn.discordapp.com/a.png", "https://CDN.discordapp.com/a.png", "https://media.discordapp.net/a.png"])
    check(`allowlist accepts ${url}`, m.parseAllowedUrl(url, m.DISCORD_CDN_HOSTS).protocol === "https:");

// ---- Questify, OpenInApp, YoutubeAdblock, extensions ----------------------------------------------
const quest = await m.questify.complete(null, "evil.example/#", "code", 1, "q");
check("questify refuses a host in the app id", quest.success === false && quest.error === "Invalid application ID", quest);
const redirectOf = url => m.openInApp.resolveRedirect(null, url).catch(e => `ERR ${e.message}`);
check("redirect loop ends", await redirectOf("https://spotify.link/start") === "ERR Too many redirects" && globalThis.__hops === 6, globalThis.__hops);
check("short link check only asks for headers", globalThis.__hopMethod === "HEAD", globalThis.__hopMethod);
check("short link returns its last hop", await redirectOf("https://spotify.link/hop") === "https://spotify.link/last");
check("short link can't redirect into this PC", await redirectOf("https://spotify.link/private") === "ERR Disallowed URL");
check("a redirect can't drop from https to http", await redirectOf("https://spotify.link/downgrade") === "ERR Disallowed URL");

// ---- Native file names and download limits ---------------------------------------------------------
const listDir = listDirectory;
await m.mle.updateAllowedExtensions(null, "png, .gif, png/../../x, bat, a b, ..\\y, ");
check("logger keeps only plain, allowed extensions", (await m.mle.getSettings()).attachmentFileExtensions === "png,gif", (await m.mle.getSettings()).attachmentFileExtensions);

const attachment = (id, fileExtension) => ({ id, fileExtension, url: "http://file.test/a", oldUrl: "http://file.test/a" });
for (const ext of [".png/../../../evil.png", "png/../../evil", ".png\\..\\evil", ".png:stream", ".bat", ".exe"]) {
    const before = globalThis.__fileRequests ?? 0;
    const res = await m.mle.downloadAttachment(null, attachment("1", ext));
    check(`logger refuses extension ${ext}`, !res.path && res.error && (globalThis.__fileRequests ?? 0) === before, res);
}
for (const id of ["..", "a/b", "a\\b", "a:b", "a.b"]) {
    const res = await m.mle.downloadAttachment(null, attachment(id, ".png"));
    check(`logger refuses id ${id}`, !res.path && res.error === "Invalid Attachment ID", res);
}
// A tampered mlSettings.json is the only way past updateAllowedExtensions, so the download has to hold on its own
{
    const settingsPath = join(await m.mle.getDefaultNativeDataDir(), "mlSettings.json");
    const original = readFileSync(settingsPath, "utf8");
    writeFileSync(settingsPath, JSON.stringify({ ...JSON.parse(original), attachmentFileExtensions: "png/../../evil,bat" }));

    for (const ext of [".png/../../evil", ".bat"]) {
        const res = await m.mle.downloadAttachment(null, attachment("9", ext));
        check(`a tampered settings file can't allow ${ext}`, !res.path && res.error, res);
    }
    writeFileSync(settingsPath, original);
}

const savedImage = await m.mle.downloadAttachment(null, attachment("123456", ".PNG"));
const imageDir = await m.mle.getDefaultNativeImageDir();
check("logger still saves a normal attachment", savedImage.path === join(imageDir, "123456.png") && existsSync(savedImage.path), savedImage);
check("nothing landed outside the image folder", !existsSync(join(imageDir, "..", "evil.png")) && !existsSync(join(imageDir, "evil")) && listDir(imageDir).length === 1, listDir(imageDir));

const fetchBefore7 = globalThis.fetch;
globalThis.fetch = async () => new Response("%PDF-1.7 body");
const pdfUrl = "https://cdn.discordapp.com/attachments/1/2/a.pdf";
check("PDF size limit can't be switched off", await m.fetchPdf(null, pdfUrl, NaN).then(() => "OPENED", e => e.message) === "PDF exceeded the size limit");
check("PDF over the limit stops", await m.fetchPdf(null, pdfUrl, 4).then(() => "OPENED", e => e.message) === "PDF exceeded the size limit");
check("PDF inside the limit opens", (await m.fetchPdf(null, pdfUrl, 1024)).length === 13);
globalThis.fetch = async () => new Response("gif");
check("gif maker refuses http", await m.gifMakerFetch(null, "http://cdn.discordapp.com/a.gif").then(() => "OPENED", e => e.message) === "Disallowed URL");
check("gif maker reads https", (await m.gifMakerFetch(null, "https://cdn.discordapp.com/a.gif")).data.byteLength === 3);
check("favorites refuse http", await m.favoriteFetch(null, { url: "http://cdn.discordapp.com/a.gif" }).then(() => "OPENED", e => e.message) === "Disallowed URL");
check("favorites read https", (await m.favoriteFetch(null, { url: "https://cdn.discordapp.com/a.gif", filename: "a.gif" })).data.byteLength === 3);
globalThis.fetch = fetchBefore7;

const injected = [];
const frameFor = (url, parent) => {
    let onReady, onFrame;
    const frame = { url, parent, once: (_, f) => { onReady = f; }, executeJavaScript: () => injected.push(url) };
    globalThis.__appListeners["browser-window-created"](null, { webContents: { on: (_, f) => { onFrame = f; } } });
    onFrame(null, { frame });
    onReady();
};
frameFor("https://www.youtube.com/embed/abc");
frameFor("https://evil.example/?x=youtube.com/embed/");
frameFor("https://youtube.com.evil.example/embed/x");
frameFor("https://www.youtube.com/watch?v=1");
check("adblock only runs in real embeds", injected.length === 1 && injected[0].startsWith("https://www.youtube.com/embed/"), injected);

const zip = Buffer.from(zipSync({ "manifest.json": strToU8("{}"), "../../evil.txt": strToU8("x") }));
globalThis.fetch = async () => new Response(zip);
const errors = [];
const origError = console.error; console.error = (...a) => errors.push(a.join(" "));
await m.installExt("slip");
console.error = origError;
globalThis.fetch = realFetch;
check("zip slip refused", !existsSync(join(OUT, "evil.txt")) && !existsSync(join(OUT, "data", "evil.txt")) && errors.some(e => e.includes("Unsafe path")), errors);

// ---- Settings export / import -------------------------------------------------------------------------
const plain = globalThis.__plain;
const resetLocal = plugin => Object.assign(plain, { plugins: { Secret: plugin }, cloud: { url: "https://endcord.com/" }, autoUpdate: true, autoUpdateNotification: true });
const nativeSettings = { plugins: { Secret: { key: "LOCAL-SECRET", url: "https://mine.example", plain: 1 } } };
globalThis.EndcordNative.settings.get = () => nativeSettings;
const evil = { settings: { plugins: { Secret: { key: "EVIL-KEY", url: "https://evil.example", plain: 2, enabled: true } }, cloud: { url: "https://evil.example/" }, autoUpdate: false, autoUpdateNotification: false }, quickCss: "" };
const imported = async source => { await m.offline.importSettings(JSON.stringify(evil), source); return globalThis.__setSettings; };

const exported = JSON.parse(await m.offline.exportSettings());
const exportedPlugin = exported.settings.plugins.Secret;
check("secret and its address left out of the export", exportedPlugin.key === undefined && exportedPlugin.url === undefined && exportedPlugin.plain === 1, exported);
check("the export doesn't touch the live settings", nativeSettings.plugins.Secret.key === "LOCAL-SECRET");

resetLocal({ key: "LOCAL-SECRET", url: "https://mine.example" });
await m.offline.importSettings(JSON.stringify(exported));
check("own backup keeps this device's values", globalThis.__setSettings.plugins.Secret.key === "LOCAL-SECRET" && globalThis.__setSettings.plugins.Secret.url === "https://mine.example", globalThis.__setSettings);

resetLocal({ key: "LOCAL-SECRET", url: "https://mine.example" });
let got = await imported("cloud");
check("cloud can't redirect a configured device", got.plugins.Secret.key === "LOCAL-SECRET" && got.plugins.Secret.url === "https://mine.example", got);
check("ordinary settings still sync", got.plugins.Secret.plain === 2);

resetLocal({ key: "LOCAL-SECRET", url: "https://mine.example" });
got = await imported("file");
check("a shared backup file can't redirect a configured device", got.plugins.Secret.key === "LOCAL-SECRET" && got.plugins.Secret.url === "https://mine.example", got);

resetLocal({ key: "LOCAL-SECRET" });
got = await imported("file");
check("a backup can't add an address to a stored key", got.plugins.Secret.key === "LOCAL-SECRET" && got.plugins.Secret.url === undefined, got);

resetLocal({ key: "" });
got = await imported("cloud");
check("cloud can't set them on an empty device", got.plugins.Secret.key === "" && got.plugins.Secret.url === undefined, got);

resetLocal({ url: "https://default.example" });
got = await imported("file");
check("a real backup restores onto a fresh device", got.plugins.Secret.key === "EVIL-KEY" && got.plugins.Secret.url === "https://evil.example", got);

resetLocal({ key: "LOCAL-SECRET" });
got = await imported("file");
check("import can't move cloud sync or stop updates", got.cloud.url === "https://endcord.com/" && got.autoUpdate === true && got.autoUpdateNotification === true, got);
await m.offline.importSettings(JSON.stringify({ settings: {}, quickCss: "" }), "cloud");
check("import without a plugins block keeps the device's value", globalThis.__setSettings.plugins.Secret.key === "LOCAL-SECRET", globalThis.__setSettings);
check("broken JSON doesn't get logged", await rejects(m.offline.importSettings("{oops LOCAL-SECRET")));

const pollute = (where, key) => JSON.stringify({ settings: { [where]: 1 }, quickCss: "" }).replace(where, key).replace('"settings":{', '"settings":{"plugins":{"x":{"a":1}},');
for (const key of ["__proto__", "constructor", "prototype"]) {
    const refused = await m.offline.importSettings(pollute("KEY", key)).then(() => "IMPORTED", e => e.message);
    check(`import refuses a ${key} key`, refused === "Unsafe Settings", refused);
}
check("a nested __proto__ is refused too", await m.offline.importSettings('{"settings":{"plugins":{"a":{"__proto__":{"polluted":1}}}},"quickCss":""}').then(() => "IMPORTED", e => e.message) === "Unsafe Settings");
check("nothing reached Object.prototype", ({}).polluted === undefined);

// ---- Native fetches --------------------------------------------------------------------------------
const CDN_FILE = "https://cdn.discordapp.com/embed/avatars/0.png";
for (const url of ["http://127.0.0.1:9333/json", "http://localhost:9333/", "http://10.0.0.1/a", "http://169.254.169.254/latest/meta-data"]) {
    check(`ZIP+ blocks ${url}`, await m.zipPlusNative.fetchAttachment(null, url) === null);
    check(`GifCaptioner blocks ${url}`, await m.gifNative.fetchMedia(null, url) === null);
    const logged = await m.mle.downloadAttachment(null, { url, oldUrl: url, id: "111", fileExtension: ".png" });
    check(`MessageLogger blocks ${url}`, logged.error === "Disallowed URL" && logged.path === null, logged);
}
const zipRead = await m.zipPlusNative.fetchAttachment(null, CDN_FILE);
check("ZIP+ still reads the CDN", zipRead?.length > 100);
const gifRead = await m.gifNative.fetchMedia(null, CDN_FILE);
check("GifCaptioner still reads the CDN", gifRead?.data?.length > 100);
const gifPublic = await m.gifNative.fetchMedia(null, "https://www.google.com/favicon.ico");
check("GifCaptioner still reads a public site", gifPublic?.data?.length > 10);
const mleRead = await m.mle.downloadAttachment(null, { url: CDN_FILE, oldUrl: CDN_FILE, id: "222", fileExtension: ".png" });
check("MessageLogger still caches attachments", !mleRead.error && existsSync(mleRead.path), mleRead);
check("MessageLogger write IPC is gone", m.mle.writeImageNative === undefined);

for (const url of ["https://cdn.discordapp.com.evil.example/a.ogg", "https://cdn.discordapp.com@evil.example/a.ogg", "http://cdn.discordapp.com/a.ogg", "http://127.0.0.1:9333/json"]) {
    check(`audio player refuses ${url}`, await rejects(m.audioNative.fetchAudio(null, url)));
    check(`transcriber refuses ${url}`, await rejects(m.transcriber.fetchAudio(null, url)));
}
const audioRead = await m.audioNative.fetchAudio(null, CDN_FILE);
check("audio player reads the CDN without a proxy", audioRead?.data?.length > 100 && audioRead.type === "image/png", audioRead?.type);

// ---- Zip bombs -------------------------------------------------------------------------------------
const { zipSync: zipBomb } = require("fflate");
const MB = 1024 * 1024;
const honestBomb = zipBomb({ "bomb.bin": new Uint8Array(300 * MB) }, { level: 1 });
// Same bomb, but the central directory claims it unpacks to 10 bytes
const liarBomb = honestBomb.slice();
const view = new DataView(liarBomb.buffer);
let directory = liarBomb.length - 22;
while (view.getUint32(directory, true) !== 0x02014b50) directory--;
view.setUint32(directory + 24, 10, true);
const scoped = async blob => { const { entries, readEntry } = await m.unzipBlob(blob); return readEntry(entries[0]); };
check("ZIP+ refuses a declared bomb", await rejects(scoped(new Blob([honestBomb]))));
const memBefore = process.memoryUsage().arrayBuffers;
const liar = await scoped(new Blob([liarBomb])).then(() => "UNPACKED", e => e.message);
check("ZIP+ stops a bomb that lies about its size", liar === "Entry is too large to preview", liar);
const normal = zipBomb({ "hello.txt": strToU8("merhaba") }, { level: 6 });
check("ZIP+ still reads a normal file", new TextDecoder().decode(await scoped(new Blob([normal]))) === "merhaba");

const previewOf = async (name, bytes) => {
    globalThis.__zip = bytes.buffer;
    const state = m.getCachedZip(`https://cdn.discordapp.com/attachments/1/2/${name}.zip`);
    return state.promise.then(r => r, e => e.message);
};
check("ZipPreview refuses a declared bomb", await previewOf("bomb", honestBomb) === "ZIP is too large to preview.");
const liarPreview = await previewOf("liar", liarBomb);
check("ZipPreview survives a lying header", typeof liarPreview === "string" || liarPreview.entries[0].size <= 10, typeof liarPreview);
const fine = await previewOf("fine", normal);
check("ZipPreview still opens a normal zip", fine.entries?.[0]?.name === "hello.txt", fine);

// ---- RichPresence login URLs ------------------------------------------------------------------------
for (const url of ["https://jelly.example.com", "http://localhost:8096", "http://127.0.0.1:8096", "http://192.168.1.5:8096", "http://10.0.0.2", "http://172.20.1.1", "http://100.100.1.1:8096", "http://nas:8096", "http://nas.local:8096", "http://media.lan", "http://[::1]:8096"])
    check(`login allowed to ${url}`, m.canSendCredentials(url) === true);
for (const url of ["http://jelly.example.com", "http://8.8.8.8:8096", "http://172.32.0.1", "http://192.169.1.1", "http://localhost.evil.example", "http://10.0.0.1.evil.example", "ftp://nas", "jelly.example.com:8096", ""])
    check(`login refused to ${url || "(empty)"}`, m.canSendCredentials(url) === false);

// ---- Links from themes and APIs ---------------------------------------------------------------------
for (const href of ["https://example.com/", "http://example.com/", "mailto:a@example.com", "/relative/path", "#section", "", undefined])
    check(`link allowed ${href}`, m.isSafeLink(href) === true);
for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)", "\u0001javascript:alert(1)", "data:text/html,<script>1</script>", "vbscript:x", "blob:https://discord.com/x", "file:///c:/x", "steam://run/730", "http://[bad"])
    check(`link refused ${JSON.stringify(href)}`, m.isSafeLink(href) === false);
check("web and desktop share one external-link rule", m.isSafeExternalUrl("javascript:alert(1)") === false && m.isSafeExternalUrl("spotify:track:abc") === true);

// ---- Cloud address ----------------------------------------------------------------------------------
for (const url of ["https://endcord.com/", "https://my.server:8443/", "http://localhost:8080/", "http://127.0.0.1:8080", "http://[::1]:8080/"])
    check(`cloud allows ${url}`, m.isSecureCloudUrl(url) === true);
for (const url of ["http://endcord.com/", "http://192.168.1.5/", "http://localhost.evil.example/", "ftp://endcord.com/", "endcord.com", ""])
    check(`cloud refuses ${url || "(empty)"}`, m.isSecureCloudUrl(url) === false);

// ---- Extension metadata: another frame posting to this window ----------------------------------------
await esbuild.build({
    stdin: { contents: 'export * from "./src/utils/web-metadata";', resolveDir: ROOT, loader: "ts" },
    bundle: true, platform: "node", format: "cjs", outfile: join(OUT, "meta.cjs"), logLevel: "error",
    tsconfig: join(ROOT, "tsconfig.json"), define: { IS_EXTENSION: "true" }
});
const pageWindow = new EventTarget();
globalThis.window = pageWindow;
const meta = require(join(OUT, "meta.cjs"));
const post = (source, base) => pageWindow.dispatchEvent(Object.assign(new Event("message"), { source, data: { type: "endcord:meta", meta: { EXTENSION_BASE_URL: base, EXTENSION_VERSION: "1", RENDERER_CSS_URL: base } } }));
post({ iframe: true }, "https://evil.example/");
check("metadata from another frame is ignored", meta.EXTENSION_BASE_URL === undefined, meta.EXTENSION_BASE_URL);
post(null, "https://evil.example/");
check("metadata with no source is ignored", meta.EXTENSION_BASE_URL === undefined, meta.EXTENSION_BASE_URL);
post(pageWindow, "chrome-extension://real/");
check("the page's own content script is accepted", meta.EXTENSION_BASE_URL === "chrome-extension://real/", meta.EXTENSION_BASE_URL);
delete globalThis.window;

// ---- Patch text ----------------------------------------------------------------------------------------
const hashed = m.runtimeHashMessageKey("APP_TAG");
check("::hash gives the bare key used in the intl bundles", m.canonicalizeMatch('"#{intl::APP_TAG::hash}":') === `"${hashed}":`);
check("::raw keeps the key as written", m.canonicalizeMatch("#{intl::abcDEF::raw}") === ".abcDEF");
check("a plain key becomes a property access", /^(\.|\[")/.test(m.canonicalizeMatch("#{intl::APP_TAG}")));

// ---- Who may reach the native API ---------------------------------------------------------------------
const frame = (url, origin) => ({ senderFrame: { url, origin } });
const { SET_SETTINGS, GET_QUICK_CSS, SET_QUICK_CSS, OPEN_EXTERNAL } = m.IpcEvents;

for (const origin of ["https://discord.com", "https://ptb.discord.com", "https://canary.discord.com"])
    check(`IPC accepts ${origin}`, m.isTrustedSender(frame(`${origin}/app`, origin), SET_SETTINGS) === true);
for (const origin of ["http://discord.com", "https://discord.com.evil.example", "https://evildiscord.com", "https://evil.example", "https://discordapp.com", "file://", "null"])
    check(`IPC refuses ${origin}`, m.isTrustedSender(frame(`${origin}/x`, origin), SET_SETTINGS) === false);

check("IPC refuses a frame that is gone", m.isTrustedSender({ senderFrame: null }, SET_SETTINGS) === false);
check("IPC reads the origin from the URL when the frame has none", m.isTrustedSender(frame("https://discord.com/app"), SET_SETTINGS) === true);
check("IPC refuses a bad URL with no origin", m.isTrustedSender(frame("not a url"), SET_SETTINGS) === false);
check("a Discord popout inherits its opener's origin", m.isTrustedSender(frame("about:blank", "https://discord.com"), SET_SETTINGS) === true);
check("the splash screen gets nothing", m.isTrustedSender(frame("file:///C:/splash/index.html", "file://"), SET_SETTINGS) === false);

const editor = frame("data:text/html;base64,AAAA", "null");
check("the editor can read QuickCSS", m.isTrustedSender(editor, GET_QUICK_CSS) === true);
check("the editor can write QuickCSS", m.isTrustedSender(editor, SET_QUICK_CSS) === true);
check("the editor can't change settings", m.isTrustedSender(editor, SET_SETTINGS) === false);
check("the editor can't open links", m.isTrustedSender(editor, OPEN_EXTERNAL) === false);

served = manifest();
globalThis.fetch = async () => { throw new Error("handler ran"); };
const refused = await new Promise(resolve => resolve(globalThis.__rawHandlers[UPDATE](frame("https://evil.example/", "https://evil.example")))).then(() => "RAN", e => e.message);
globalThis.fetch = realFetch;
check("a registered handler refuses a foreign page before it runs", refused === `Refused ${UPDATE}`, refused);

await esbuild.build({
    stdin: { contents: 'import "./src/preload";', resolveDir: ROOT, loader: "ts" },
    bundle: true, platform: "node", format: "cjs", outfile: join(OUT, "preload.cjs"), tsconfig: join(ROOT, "tsconfig.json"), logLevel: "error",
    plugins: [stubPlugin],
    define: { IS_DISCORD_DESKTOP: "true", IS_VESKTOP: "false", IS_DEV: "false" }
});
writeFileSync(join(OUT, "discordPreload.cjs"), "globalThis.__discordPreloadRuns++;");
process.env.DISCORD_PRELOAD = join(OUT, "discordPreload.cjs");

function loadPreload(protocol, origin) {
    Object.assign(globalThis, { __exposed: [], __rendererRan: false, __discordPreloadRuns: 0, window: { origin }, location: { protocol } });
    const path = require.resolve(join(OUT, "preload.cjs"));
    delete require.cache[path];
    delete require.cache[require.resolve(join(OUT, "discordPreload.cjs"))];
    require(path);
    delete globalThis.window;
    delete globalThis.location;
    return { exposed: globalThis.__exposed, renderer: globalThis.__rendererRan, discord: globalThis.__discordPreloadRuns };
}

const onDiscord = loadPreload("https:", "https://discord.com");
check("Discord gets Endcord", onDiscord.exposed.includes("EndcordNative") && onDiscord.renderer && onDiscord.discord === 1, onDiscord);
const onSplash = loadPreload("file:", "file://");
check("the splash screen keeps Discord's preload and gets nothing else", onSplash.exposed.length === 0 && !onSplash.renderer && onSplash.discord === 1, onSplash);
const onForeignPage = loadPreload("https:", "https://evil.example");
check("a foreign page gets no native API", onForeignPage.exposed.length === 0 && !onForeignPage.renderer, onForeignPage);
const inEditor = loadPreload("data:", "null");
check("the editor gets its three calls only", inEditor.exposed.join() === "setCss,getCurrentCss,getTheme" && !inEditor.renderer && inEditor.discord === 0, inEditor);

try {
    rmSync(OUT, { recursive: true, force: true });
} catch { }

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
