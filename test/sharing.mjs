/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Shared CustomProfiles: bundles src/plugins/customProfile/sharing.ts with Discord stubbed out, then checks what a
// profile message may carry, how the channel is read and how a profile is published. Another user's message is
// untrusted input that every Endcord user's client reads, so most checks are about what it must not do
import { createRequire } from "module";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const require = createRequire(join(ROOT, "package.json"));
const esbuild = require("esbuild");

const CHANNEL = "900000000000000001";

const stubs = {
    "@api/index": "const m = new Map(); export const DataStore = { get: async k => structuredClone(m.get(k)), set: async (k, v) => { m.set(k, structuredClone(v)); } }; globalThis.__store = m;",
    "@endcord/discord-types/enums": "export const CloudUploadPlatform = { WEB: 1 };",
    "@utils/Logger": "export class Logger { warn() {} error() {} info() {} }",
    "@utils/i18n": "export const t = key => key;",
    "@webpack/common": `
        const handlers = {};
        globalThis.__dispatch = (type, event) => (handlers[type] ?? []).forEach(f => f(event));
        globalThis.__rest = { pages: [], posts: [], deletes: [], fail: null };
        globalThis.__member = true;
        globalThis.__lastId = null;
        export const ReadStateStore = { lastMessageId: () => globalThis.__lastId };
        export const FluxDispatcher = { subscribe: (t, f) => (handlers[t] ??= []).push(f), unsubscribe: (t, f) => { handlers[t] = (handlers[t] ?? []).filter(x => x !== f); } };
        export const GuildStore = { getGuild: () => globalThis.__member ? {} : undefined };
        export const Constants = { Endpoints: { MESSAGES: c => "/channels/" + c + "/messages", MESSAGE: (c, m) => "/channels/" + c + "/messages/" + m } };
        export const RestAPI = {
            get: async ({ query }) => { __rest.gets = (__rest.gets ?? 0) + 1; __rest.lastQuery = query; return { body: __rest.pages.shift() ?? [] }; },
            post: async req => { if (__rest.fail) { const f = __rest.fail; __rest.fail = null; throw f; } __rest.posts.push(req); __rest.next = (__rest.next ?? 950000000000000000n) + 1n; return { body: { id: String(__rest.next), content: req.body.content, attachments: (req.body.attachments ?? []).map(a => ({ filename: a.filename, url: "https://cdn.discordapp.com/attachments/1/2/" + a.filename })), author: { id: "1" } } }; },
            del: async req => { __rest.deletes.push(req.url); return {}; }
        };
        export class CloudUploader {
            constructor({ file }) { this.file = file; this.filename = file.name; this.uploadedFilename = "up/" + file.name; this.handlers = {}; }
            on(e, f) { this.handlers[e] = f; }
            upload() { (globalThis.__uploads ??= []).push(this.file); setTimeout(() => this.handlers.complete?.()); }
        }`
};

const result = await esbuild.build({
    entryPoints: [join(ROOT, "src/plugins/customProfile/sharing.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    logLevel: "silent",
    plugins: [{
        name: "stubs",
        setup(build) {
            build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "stub" } : undefined);
            build.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path], loader: "js" }));
            // A channel of the tests' own, so nothing here could ever be mistaken for the real one
            build.onLoad({ filter: /sharing\.ts$/ }, async args => {
                const source = (await import("fs")).readFileSync(args.path, "utf8");
                if (!/PROFILES_CHANNEL_ID = "\d*"/.test(source)) throw new Error("PROFILES_CHANNEL_ID not found in sharing.ts");
                return { contents: source.replace(/PROFILES_CHANNEL_ID = "\d*"/, `PROFILES_CHANNEL_ID = "${CHANNEL}"`), loader: "ts" };
            });
        }
    }]
});
const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);

let failed = 0;
const check = (name, ok) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PNG = `data:image/png;base64,${Buffer.from("not really a png").toString("base64")}`;

// ---- Writing a profile message --------------------------------------------------------------------------------
{
    const { content, files, fits } = m.writeProfileMessage({
        username: "panda", email: "a@b.c", phone: "+90 555", createdAt: "2015-05-13", copiedUserId: "5",
        avatar: PNG, banner: "https://example.com/tracker.png", bio: "hi"
    });
    const shared = JSON.parse(content.slice(5));
    check("a message starts with the format's name", content.startsWith("ecp1 {"));
    check("email, phone and copied user stay on this computer", !("email" in shared) && !("phone" in shared) && !("copiedUserId" in shared));
    check("the chosen creation date is shared", shared.createdAt === "2015-05-13");
    check("a picture from this computer goes along as an attachment the text names", files.length === 1 && files[0].name === "avatar.png" && shared.avatar === "att:avatar.png");
    check("a picture on another site isn't shared", !("banner" in shared));
    check("it fits", fits);

    const long = m.writeProfileMessage({ username: "x", bio: "b".repeat(5000) });
    check("a very long bio is shortened until the message fits", long.fits && long.content.length <= 2000 && JSON.parse(long.content.slice(5)).bio.length > 1000);
}

// ---- Reading one ----------------------------------------------------------------------------------------------
{
    const read = (content, attachments) => m.readProfileMessage(content, attachments);
    const ok = read('ecp1 {"username":"panda","avatar":"att:avatar.png","badgeFlags":4}', [{ filename: "avatar.png", url: "https://cdn.discordapp.com/attachments/1/2/avatar.png?ex=1" }]);
    check("a picture named in the text is the attachment's address", ok?.avatar === "https://cdn.discordapp.com/attachments/1/2/avatar.png?ex=1" && ok.username === "panda" && ok.badgeFlags === 4);
    check("a message without the format's name is ignored", read('{"username":"x"}') === null && read("hello") === null);
    check("broken JSON is ignored", read("ecp1 {nope") === null);

    const hostile = read(`${JSON.stringify("x").slice(0, 0)}ecp1 ${JSON.stringify({
        username: "u".repeat(100), avatar: "https://evil.example/ip-logger.png", banner: "javascript:alert(1)",
        email: "victim@x.y", phone: "1", createdAt: "2010-01-01", badgeFlags: -1, nitroLevel: "3", accentColor: 2 ** 40,
        customBadgeIds: ["quest", "<img src=x>", 5, "constructor", "__proto__", "hasOwnProperty", "staff", "1", "1"],
        tieredBadges: { account_age: 3, "../x": 1, game_time: 99, constructor: 1, __proto__: { polluted: true } },
        nameplate: { skuId: "123", asset: "../../etc/passwd" }, decorationAsset: "a_123/../../x", profileEffectId: "abc",
        __proto__: { polluted: true }, constructor: "x", globalName: "Real Name"
    })}`);
    check("names over Discord's length are refused", hostile && !("username" in hostile) && hostile.globalName === "Real Name");
    check("pictures from anywhere but Discord's servers are refused", !("avatar" in hostile) && !("banner" in hostile));
    check("email and phone never come from someone else", !("email" in hostile) && !("phone" in hostile));
    const created = date => read(`ecp1 {"username":"a","createdAt":${JSON.stringify(date)}}`)?.createdAt;
    check("a shared creation date is taken when it's a day that exists", hostile.createdAt === "2010-01-01" && created("2016-02-29") === "2016-02-29");
    check("a creation date that isn't a real day, or isn't written as one, is refused", [created("2015-02-30"), created("2015-13-01"), created("2015-5-13"), created("2015-05-13T00:00"), created(20150513)].every(date => date === undefined));
    check("numbers out of range or of the wrong type are refused", !("badgeFlags" in hostile) && !("nitroLevel" in hostile) && !("accentColor" in hostile));
    check("badge ids must be badges Endcord has, once each, and never Object.prototype's names", JSON.stringify(hostile.customBadgeIds) === '["quest","1"]');
    check("tiers must be Endcord's tiered badges with a level they have", JSON.stringify(hostile.tieredBadges) === '{"account_age":3}');
    check("paths can't climb out of Discord's asset folders", !("nameplate" in hostile) && !("decorationAsset" in hostile) && !("profileEffectId" in hostile));
    check("nothing lands on Object.prototype", ({}).polluted === undefined && !Object.hasOwn(hostile, "constructor"));

    // A shared picture link lands inside CSS url() in FullVCPFP, ThemeAttributes and themes
    const cssBreak = read(`ecp1 ${JSON.stringify({ username: "a", avatar: "https://cdn.discordapp.com/a.png),url(https://evil.example/x", banner: "https://cdn.discordapp.com/a.png'" })}`);
    check("a picture link that could end a CSS url() is refused", cssBreak?.username === "a" && !("avatar" in cssBreak) && !("banner" in cssBreak));
    const realLinks = read(`ecp1 ${JSON.stringify({ avatar: "https://cdn.discordapp.com/avatars/1/a_b.gif?size=1024", banner: "https://media.discordapp.net/attachments/1/2/x%20y.png?ex=1&is=2&hm=3&=&format=webp&width=1&height=1" })}`);
    check("Discord's own picture links pass", realLinks?.avatar?.endsWith("?size=1024") && realLinks.banner?.includes("format=webp"));

    // Discord reads other bits of publicFlags as system account, verified bot or spammer
    check("only badge bits come through in the flags", read(`ecp1 {"badgeFlags":${4 | (1 << 12) | (1 << 16) | (1 << 20)}}`)?.badgeFlags === 4);
    check("flags without a badge bit are dropped", read(`ecp1 {"username":"a","badgeFlags":${1 << 12}}`)?.badgeFlags === undefined);

    // Characters nobody sees: they'd hide text, flip its direction or break a line where none belongs
    const invisible = read(`ecp1 ${JSON.stringify({ username: "pa\u202Enda\n\u0000", pronouns: "\u200B\u200E\uFEFF", bio: "line 1\nline 2\u2028\u202E", oldName: "ok\u200D" })}`);
    check("invisible characters are removed from a name", invisible?.username === "panda");
    check("a field of only invisible characters is dropped", !("pronouns" in invisible));
    check("a bio keeps its line breaks and loses the rest", invisible.bio === "line 1\nline 2");
    check("the zero-width joiner stays, emoji need it", invisible.oldName === "ok\u200D");

    const plates = [
        read('ecp1 {"nameplate":{"skuId":"1","asset":"nameplates/nameplates/crimson/","label":"Crimson","palette":"crimson"}}'),
        read('ecp1 {"nameplate":{"skuId":"1","asset":"nameplates/nameplates/crimson/","label":"x\\u0000y","palette":"x;}"}}')
    ];
    check("a nameplate palette must look like one of Discord's", plates[0]?.nameplate?.palette === "crimson" && plates[1]?.nameplate && !("palette" in plates[1].nameplate) && plates[1].nameplate.label === "xy");
    check("a Nitro date comes through as a plain date", read('ecp1 {"nitroLevel":3,"nitroSince":"2019-03-14"}')?.nitroSince === "2019-03-14");
    const badDates = [read('ecp1 {"username":"a","nitroSince":"2019-03-14<script>"}'), read('ecp1 {"username":"a","nitroSince":20190314}')];
    check("anything else in the Nitro date is refused", badDates.every(p => p?.username === "a" && !("nitroSince" in p)), badDates);
    check("a message with nothing usable shares nothing", read('ecp1 {"email":"x@y.z"}') === null);
}

// ---- Hostile input, many times ---------------------------------------------------------------------------------
// Random profiles built from the characters that break CSS, HTML, JSON and Object lookups: whatever comes out must
// keep the promises above. ENDCORD_FUZZ_SEED=<seed> replays a failing run
{
    const SEED = Number(process.env.ENDCORD_FUZZ_SEED) || Date.now() % 2 ** 31;
    let state = SEED;
    const random = () => {
        state = state + 0x6D2B79F5 | 0;
        let t = Math.imul(state ^ state >>> 15, 1 | state);
        t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const pick = list => list[Math.floor(random() * list.length)];
    const PIECES = ["a", "Z", "0", "_", ".", "-", "/", "?", "=", "&", "%", "(", ")", ",", "'", "\"", "<", ">", ";", "{", "}", "\\", " ", "\n", "\u0000", "\u202E", "\u200B", "\u200D", "\uFEFF", "\u2028", "https://cdn.discordapp.com/", "https://media.discordapp.net/", "https://evil.example/", "javascript:", "..", "__proto__", "constructor", "quest", "oldname", "account_age", "crimson", "att:avatar.png", "2015-05-13", "2015-02-30", "2015"];
    const randomString = () => Array.from({ length: Math.floor(random() * 12) }, () => pick(PIECES)).join("");
    const randomValue = depth => {
        const kind = random();
        if (kind < .45) return randomString();
        if (kind < .6) return Math.floor(random() * 2 ** 33) - 2 ** 32;
        if (kind < .65) return pick([true, false, null, undefined, 1.5, NaN]);
        if (kind < .8 && depth < 2) return Array.from({ length: Math.floor(random() * 5) }, () => randomValue(depth + 1));
        if (depth < 2) return randomObject(depth + 1);
        return randomString();
    };
    const KEYS = ["username", "globalName", "bio", "pronouns", "oldName", "avatar", "banner", "accentColor", "accentColor2", "badgeFlags", "nitroLevel", "nitroSince", "boostMonths", "nitro", "decorationAsset", "profileEffectId", "profileFrameId", "customBadgeIds", "tieredBadges", "nameplate", "displayNameStyles", "skuId", "asset", "label", "palette", "fontId", "effectId", "colors", "email", "phone", "createdAt", "__proto__", "constructor", "toString"];
    const randomObject = depth => {
        const out = {};
        for (let i = Math.floor(random() * 8); i > 0; i--) Object.defineProperty(out, pick(KEYS), { value: randomValue(depth), enumerable: true, writable: true, configurable: true });
        return out;
    };

    const LINK = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/[\w\-./?=&%]{1,600}$/;
    const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u200B\u200C\u200E\u200F\u2028-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/;
    const INVISIBLE_IN_BIO = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B\u200C\u200E\u200F\u2028-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/;
    const BADGE_BITS = 1 | 2 | 4 | 8 | 64 | 128 | 256 | 512 | 16384 | 131072 | 262144 | 4194304;
    const BADGE_ID = /^(?:oldname|quest|meadow|orbs|gift_(?:patron|champion|luminary|icon|hero|legendary)|\d+)$/;
    const TIER_KEY = /^(?:account_age|streaming|game_time|game_variety)$/;
    const failures = [];
    const expect = (ok, what, input) => { if (!ok && failures.length < 8) failures.push(`${what}: ${JSON.stringify(input)}`); };

    for (let round = 0; round < 20_000; round++) {
        const input = randomObject(0);
        const out = m.readProfileMessage(`ecp1 ${JSON.stringify(input)}`, [{ filename: "avatar.png", url: pick(["https://cdn.discordapp.com/attachments/1/2/avatar.png", "https://evil.example/avatar.png", "https://cdn.discordapp.com/a),url(https://evil.example/x"]) }]);
        if (out === null) continue;
        for (const key of ["avatar", "banner"]) if (key in out) expect(LINK.test(out[key]), `${key} isn't a plain Discord link`, input);
        for (const key of ["username", "globalName", "pronouns", "oldName"]) if (key in out) expect(typeof out[key] === "string" && !INVISIBLE.test(out[key]) && out[key].length <= 40, `${key} kept an invisible character`, input);
        if ("bio" in out) expect(!INVISIBLE_IN_BIO.test(out.bio) && out.bio.length <= 400, "bio kept an invisible character", input);
        if ("badgeFlags" in out) expect((out.badgeFlags & ~BADGE_BITS) === 0 && out.badgeFlags > 0, "badgeFlags carry a bit that isn't a badge", input);
        if ("customBadgeIds" in out) expect(out.customBadgeIds.every(id => BADGE_ID.test(id)) && new Set(out.customBadgeIds).size === out.customBadgeIds.length, "an unknown badge id got through", input);
        if ("tieredBadges" in out) expect(Object.keys(out.tieredBadges).every(key => TIER_KEY.test(key) && Number.isInteger(out.tieredBadges[key]) && out.tieredBadges[key] >= 0 && out.tieredBadges[key] <= 9), "an unknown tier got through", input);
        if ("nameplate" in out) expect(/^\d+$/.test(out.nameplate.skuId) && /^(?!.*\.\.)[\w\-./]+$/.test(out.nameplate.asset) && (out.nameplate.palette === undefined || /^[a-z_]+$/.test(out.nameplate.palette)) && (out.nameplate.label === undefined || !INVISIBLE.test(out.nameplate.label)), "a nameplate field got through unchecked", input);
        if ("createdAt" in out) expect(/^\d{4}-\d{2}-\d{2}$/.test(out.createdAt) && new Date(`${out.createdAt}T12:00:00Z`).toISOString().startsWith(out.createdAt), "a creation date that isn't a day got through", input);
        for (const key of ["email", "phone", "copiedUserId", "__proto__", "constructor", "toString"]) expect(!Object.hasOwn(out, key), `${key} came from someone else`, input);
        expect(Object.getPrototypeOf(out) === Object.prototype, "the output's prototype was replaced", input);
    }
    expect(({}).polluted === undefined && !("polluted" in {}), "Object.prototype was polluted", SEED);
    check(`20000 hostile profiles kept every promise (seed ${SEED})`, failures.length === 0);
    for (const failure of failures) console.log(`      ${failure}`);
}

// ---- Reading the channel ---------------------------------------------------------------------------------------
{
    const changes = [];
    const msg = (id, author, data, attachments = []) => ({ id, author: { id: author }, content: `ecp1 ${JSON.stringify(data)}`, attachments });
    __rest.pages = [[
        msg("905", "A", { username: "a-new" }),
        msg("904", "B", { username: "b" }),
        { id: "903", author: { id: "C" }, content: "hi everyone", attachments: [] },
        msg("902", "A", { username: "a-old" })
    ]];
    // A cache file someone edited by hand is checked again when it's read
    const Z = "700000000000000001";
    __store.set("CustomProfile_shared_v1", {
        channel: CHANNEL, newest: "800", fullAt: Date.now(), profiles: {
            [Z]: { m: "800", d: { username: "z", avatar: "https://evil.example/x.png" } },
            __proto__: { m: "801", d: { username: "proto" } },
            "not-an-id": { m: "802", d: { username: "odd" } },
            "700000000000000002": { m: "x", d: { username: "odd-message" } }
        }
    });

    await m.startSharing(ids => changes.push(...ids), { read: true, mine: () => null });
    check("a cached profile is checked again when it's loaded", m.getSharedProfile(Z)?.username === "z" && !("avatar" in m.getSharedProfile(Z)));
    check("cached profiles need a Discord id and message id", m.sharedProfileIds().join() === Z && m.getSharedProfile("not-an-id") === null);

    // The first sync waits 15 s after start; the test calls the live path and a manual sync through the timer-free route
    __dispatch("MESSAGE_CREATE", { channelId: CHANNEL, message: msg("906", "B", { username: "b-live" }) });
    check("a new message in the channel shows at once", m.getSharedProfile("B")?.username === "b-live");
    __dispatch("MESSAGE_CREATE", { channelId: "123", message: msg("907", "D", { username: "elsewhere" }) });
    check("messages in other channels are ignored", m.getSharedProfile("D") === null);
    __dispatch("MESSAGE_CREATE", { channelId: CHANNEL, message: msg("850", "B", { username: "b-older" }) });
    check("an older message doesn't replace a newer one", m.getSharedProfile("B")?.username === "b-live");
    __dispatch("MESSAGE_DELETE", { channelId: CHANNEL, id: "906" });
    check("a deleted profile message takes the profile away", m.getSharedProfile("B") === null);

    // A big server only says the channel has a newer message; that's read at once, from where the last read ended
    const realSetTimeout = globalThis.setTimeout;
    const passive = async (event, lastId) => {
        __lastId = lastId;
        globalThis.setTimeout = (f, ms, ...a) => realSetTimeout(f, 0, ...a);
        __dispatch("PASSIVE_UPDATE_V2", event);
        globalThis.setTimeout = realSetTimeout;
        await new Promise(resolve => realSetTimeout(resolve, 50));
    };
    __rest.gets = 0;
    __rest.pages = [[msg("910", "E", { username: "e" })]];
    await passive({ guildId: "1", channels: [] }, "910");
    check("a newer message seen only as the channel's newest id is read right away", m.getSharedProfile("E")?.username === "e" && __rest.gets === 1 && __rest.lastQuery.after === "906");
    await passive({ guildId: "1", channels: [] }, "910");
    check("the same newest id doesn't start another read", __rest.gets === 1);
    await passive({ guildId: "1", channels: [{ id: "123", lastMessageId: "999" }] }, null);
    check("other channels' newest ids are ignored", __rest.gets === 1);
    __rest.pages = [[msg("912", "F", { username: "f" })]];
    await passive({ guildId: "1", channels: [{ id: CHANNEL, lastMessageId: "912" }] }, null);
    check("the newest id can also come with the update itself", m.getSharedProfile("F")?.username === "f" && __rest.gets === 2);
    // A deleted newest message leaves its id behind: it's read once, not on every update that repeats it
    __rest.pages = [[]];
    await passive({ guildId: "1", channels: [] }, "915");
    await passive({ guildId: "1", channels: [] }, "915");
    await passive({ guildId: "1", channels: [] }, "915");
    check("an id that leads to nothing is read once, not again and again", __rest.gets === 3);
    m.stopSharing();
    check("stopping shows nobody's shared profile", m.getSharedProfile(Z) === null && changes.includes(Z));
}

// ---- A full read of the channel --------------------------------------------------------------------------------
{
    __store.clear();
    __rest.pages = [
        Array.from({ length: 100 }, (_, i) => ({ id: String(2000 - i), author: { id: `U${i}` }, content: `ecp1 {"username":"n${i}"}`, attachments: [] })),
        [{ id: "1000", author: { id: "U0" }, content: 'ecp1 {"username":"old"}', attachments: [] }, { id: "999", author: { id: "LAST" }, content: 'ecp1 {"username":"last"}', attachments: [] }]
    ];
    __rest.gets = 0;
    const realSetTimeout = globalThis.setTimeout;
    // Run the delayed first sync and the pauses between pages at once
    globalThis.setTimeout = (f, ms, ...a) => realSetTimeout(f, 0, ...a);
    await m.startSharing(() => { }, { read: true, mine: () => null });
    await new Promise(resolve => realSetTimeout(resolve, 200));
    globalThis.setTimeout = realSetTimeout;
    check("a full read pages back to the channel's start", __rest.gets === 2 && __rest.lastQuery.before === "1901");
    check("each person's newest message wins, wherever it is in the history", m.getSharedProfile("U0")?.username === "n0" && m.getSharedProfile("LAST")?.username === "last");
    check("what was read is cached for the next start", Object.keys(__store.get("CustomProfile_shared_v1")?.profiles ?? {}).length === 101);
    m.stopSharing();
}

// ---- Publishing -----------------------------------------------------------------------------------------------
{
    __store.clear();
    await m.startSharing(() => { }, { read: false, mine: () => null });
    __member = false;
    check("someone outside the Endcord server isn't published", await m.publishProfile("1", { username: "me" }) === "not-member" && __rest.posts.length === 0);
    __member = true;

    __rest.posts = []; __rest.deletes = []; globalThis.__uploads = [];
    check("a profile is published", await m.publishProfile("1", { username: "me", avatar: PNG, email: "me@x.y" }) === "published");
    const post = __rest.posts[0];
    check("the message goes to the profiles channel, quietly and without pings", post.url.endsWith(`/${CHANNEL}/messages`) && post.body.flags === ((1 << 2) | (1 << 12)) && post.body.allowed_mentions.parse.length === 0);
    check("its picture is uploaded and attached", __uploads.length === 1 && post.body.attachments[0].uploaded_filename === "up/avatar.png");
    check("its email isn't in it", !post.body.content.includes("me@x.y"));
    check("this account's own profile is known right away", m.getSharedProfile("1")?.username === "me");

    const first = __rest.next;
    __rest.posts = [];
    await m.publishProfile("1", { username: "me2" });
    check("saving again deletes the message it replaces, after the new one is up", __rest.deletes.length === 1 && __rest.deletes[0].endsWith(`/${first}`) && m.getSharedProfile("1")?.username === "me2");

    __rest.fail = { status: 429, body: { retry_after: 0.01 } };
    check("slow mode turns a save away for now", await m.publishProfile("1", { username: "me3" }) === "later");
    check("and says when it goes out", m.sharingRetryAt() > Date.now() && m.sharingRetryAt() < Date.now() + 3000);
    await sleep(2200);
    check("and it's sent again once it may be", __rest.posts.some(p => p.body.content.includes("me3")) && m.sharingRetryAt() === 0);

    // Posted while the channel wasn't being read: the next save still deletes it, from what this computer remembers
    m.stopSharing();
    __store.delete("CustomProfile_shared_v1");
    await m.startSharing(() => { }, { read: false, mine: () => null });
    const unseen = __rest.next;
    __rest.deletes = [];
    await m.publishProfile("1", { username: "me4" });
    check("a message the cache never saw is still replaced", __rest.deletes.length === 1 && __rest.deletes[0].endsWith(`/${unseen}`));

    __rest.deletes = [];
    check("taking the profile back deletes its message", await m.publishProfile("1", null) === "published" && __rest.deletes.length === 1 && m.getSharedProfile("1") === null);
    check("a profile too long to fit isn't sent", await m.publishProfile("1", { username: "x", globalName: "y", customBadgeIds: Array(40).fill("b".repeat(80)) }) === "too-long");

    // A profile saved while it couldn't be shared goes out once Discord is connected, and only once
    m.stopSharing();
    __rest.posts = [];
    let mine = { id: "1", data: { username: "saved-earlier" } };
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (f, ms, ...a) => realSetTimeout(f, 0, ...a);
    await m.startSharing(() => { }, { read: false, mine: () => mine });
    await new Promise(resolve => realSetTimeout(resolve, 100));
    check("a profile saved before it could be shared is shared once Discord connects", __rest.posts.length === 1 && __rest.posts[0].body.content.includes("saved-earlier"));
    __dispatch("CONNECTION_OPEN", {});
    await new Promise(resolve => realSetTimeout(resolve, 100));
    check("an unchanged profile isn't shared again on the next start", __rest.posts.length === 1);
    mine = { id: "1", data: null };
    __rest.deletes = [];
    __dispatch("CONNECTION_OPEN", {});
    await new Promise(resolve => realSetTimeout(resolve, 100));
    check("a profile turned off while sharing was impossible is taken back later", __rest.deletes.length === 1 && m.getSharedProfile("1") === null);
    mine = { id: "2", data: null };
    __rest.posts = []; __rest.deletes = [];
    __dispatch("CONNECTION_OPEN", {});
    await new Promise(resolve => realSetTimeout(resolve, 100));
    check("an account that never shared anything sends nothing", __rest.posts.length === 0 && __rest.deletes.length === 0);

    // The profiles channel was replaced: a profile shared to the old one goes to the new one, though it hasn't changed
    mine = { id: "3", data: { username: "moved" } };
    __rest.posts = [];
    await m.startSharing(() => { }, { read: false, mine: () => mine });
    await new Promise(resolve => realSetTimeout(resolve, 100));
    const sharedOnce = __rest.posts.length === 1;
    m.stopSharing();
    const published = __store.get("CustomProfile_published_v1");
    __store.set("CustomProfile_published_v1", { ...published, "3": { ...published["3"], c: "900000000000000000" } });
    __rest.posts = [];
    await m.startSharing(() => { }, { read: false, mine: () => mine });
    await new Promise(resolve => realSetTimeout(resolve, 100));
    check("a profile is shared again once the profiles channel has changed", sharedOnce && __rest.posts.length === 1 && __rest.posts[0].body.content.includes("moved"));
    globalThis.setTimeout = realSetTimeout;
    m.stopSharing();
}

if (failed) {
    console.log(`\n${failed} FAILED`);
    process.exit(1);
}
console.log("\nALL PASSED");
