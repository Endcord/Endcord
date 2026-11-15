/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// wrapMethod (src/utils/wrapMethod.ts), the way plugins wrap a store's methods. FakeFriends and SurfaceTranslate both
// wrapped ChannelStore.getChannel by setting it and putting the old one back on stop: turning them off and on in the
// wrong order made getChannel call a wrapper whose plugin was gone, or call itself until the stack ran out
import esbuild from "esbuild";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");

let failed = 0;
function check(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
    if (!ok) failed++;
}

const { outputFiles } = await esbuild.build({
    entryPoints: [join(ROOT, "src", "utils", "wrapMethod.ts")],
    bundle: true, platform: "neutral", format: "esm", write: false, logLevel: "error"
});
const { wrapMethod } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

class Store {
    constructor() { this.channels = { 1: "general" }; }
    getChannel(id) { return this.channels[id] ?? null; }
}
const fresh = () => new Store();
const native = Store.prototype.getChannel;

// Two plugins on one method
let store = fresh();
const fake = wrapMethod(store, "getChannel", function (original, id) { return id === 2 ? "fake dm" : original.call(this, id); });
const translate = wrapMethod(store, "getChannel", function (original, id) { const c = original.call(this, id); return c && c.toUpperCase(); });
check("both wrappers run, the later one outside", store.getChannel(1) === "GENERAL" && store.getChannel(2) === "FAKE DM", [store.getChannel(1), store.getChannel(2)]);
check("this is the store", store.getChannel(1) === "GENERAL");

// The order that broke Discord: the first plugin stops, then the second, then the first starts again
fake();
check("the other plugin keeps working when one stops", store.getChannel(1) === "GENERAL" && store.getChannel(2) === null);
translate();
check("with both off, the store's own method is back", store.getChannel(1) === "general" && !Object.hasOwn(store, "getChannel") && store.getChannel === native);
let again;
try {
    again = wrapMethod(store, "getChannel", function (original, id) { return id === 2 ? "fake dm" : original.call(this, id); });
    check("starting again doesn't wrap a dead wrapper", store.getChannel(1) === "general" && store.getChannel(2) === "fake dm");
} catch (e) {
    check("starting again doesn't wrap a dead wrapper", false, String(e));
}
again();

// Every order of stopping and starting two plugins, twice over
const orders = [["a", "b"], ["b", "a"]];
let allGood = true;
for (const stopOrder of orders) for (const startOrder of orders) {
    store = fresh();
    const make = name => wrapMethod(store, "getChannel", function (original, id) { return `${name}(${original.call(this, id)})`; });
    const on = { a: make("a"), b: make("b") };
    for (const n of stopOrder) on[n]();
    for (const n of startOrder) on[n] = make(n);
    const got = store.getChannel(1);
    const want = `${startOrder[1]}(${startOrder[0]}(general))`;
    for (const n of ["a", "b"]) on[n]();
    try {
        if (got !== want || store.getChannel(1) !== "general") { allGood = false; check(`stop ${stopOrder} then start ${startOrder}`, false, got); }
    } catch (e) { allGood = false; check(`stop ${stopOrder} then start ${startOrder}`, false, String(e)); }
}
check("any order of stopping and starting works", allGood);

// Something outside Endcord replaces the method on top of ours
store = fresh();
const ours = wrapMethod(store, "getChannel", function (original, id) { return `ours(${original.call(this, id)})`; });
const theirsInner = store.getChannel;
store.getChannel = function (id) { return `theirs(${theirsInner.call(this, id)})`; };
ours();
check("a method replaced on top isn't undone, ours just passes through", store.getChannel(1) === "theirs(general)");
const second = wrapMethod(store, "getChannel", function (original, id) { return `second(${original.call(this, id)})`; });
check("a wrapper added after that goes on top", store.getChannel(1) === "second(theirs(general))");
second();
check("and leaves theirs in place when it goes", store.getChannel(1) === "theirs(general)");

// The method as it would be without this plugin, for a plugin that wants the real answer
store = fresh();
const below = wrapMethod(store, "getChannel", function (original, id) { return `below(${original.call(this, id)})`; });
const above = wrapMethod(store, "getChannel", function (original, id) { return `above(${original.call(this, id)})`; });
check("original() skips this wrapper and the ones above it", above.original(1) === "below(general)" && below.original(1) === "general");
above(); above();
check("unwrapping twice does nothing", store.getChannel(1) === "below(general)");
below();

// An own property stays an own property
const plain = { get: id => `plain ${id}` };
const ownFn = plain.get;
const w = wrapMethod(plain, "get", function (original, id) { return `${original.call(this, id)}!`; });
check("an own method is wrapped", plain.get(1) === "plain 1!");
w();
check("and put back as it was", plain.get === ownFn);

let threw = false;
try { wrapMethod({ notAFunction: 1 }, "notAFunction", () => 0); } catch { threw = true; }
check("only functions can be wrapped", threw);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
