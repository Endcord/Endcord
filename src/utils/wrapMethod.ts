/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

type AnyFunction = (this: any, ...args: any[]) => any;

/** A method's wrapper: it gets what it wraps first, and calls it as original.call(this, ...) */
export type MethodWrapper<T, F extends AnyFunction> = (this: T, original: (this: T, ...args: Parameters<F>) => ReturnType<F>, ...args: Parameters<F>) => ReturnType<F>;

export interface Unwrap<F extends AnyFunction> {
    /** Takes this wrapper off again. Calling it twice does nothing */
    (): void;
    /** Calls what this wrapper wraps, so a plugin can still ask the method what it would say without the plugin */
    original(...args: Parameters<F>): ReturnType<F>;
}

interface Chain {
    original: AnyFunction;
    hadOwn: boolean;
    wrappers: AnyFunction[];
    /** What each wrapper gets as its original */
    inner: Map<AnyFunction, AnyFunction>;
    entry: AnyFunction;
    trampoline: AnyFunction;
}

const chains = new WeakMap<object, Map<PropertyKey, Chain>>();

function rebuild(chain: Chain) {
    chain.inner.clear();
    let next = chain.original;
    for (const wrapper of chain.wrappers) {
        const inner = next;
        chain.inner.set(wrapper, inner);
        next = function (this: any, ...args: any[]) { return wrapper.call(this, inner, ...args); };
    }
    chain.entry = next;
}

type IsAny<T> = 0 extends 1 & T ? true : false;
// Lazily found stores are typed any; their methods take any wrapper
type WrapperOf<T, F> = IsAny<F> extends true ? (this: any, original: any, ...args: any[]) => any : F extends AnyFunction ? MethodWrapper<T, F> : never;
type UnwrapOf<F> = IsAny<F> extends true ? Unwrap<AnyFunction> : F extends AnyFunction ? Unwrap<F> : never;

/**
 * Wraps obj[key], usually a method of one of Discord's stores, so that several plugins can wrap the same method and stop
 * in any order.
 *
 * Setting obj[key] and putting the old value back on stop breaks once two plugins do it to one method: the second one's
 * old value is the first one's wrapper, so stopping them in the wrong order brings back a wrapper whose plugin is gone,
 * and starting again wraps that wrapper, which then calls itself until the stack runs out. Here every wrapper is a link
 * in one chain that is rebuilt as links come and go, and the method is put back when the last link leaves, unless
 * something else replaced it since; then the chain stays and just passes calls through.
 */
export function wrapMethod<T extends object, K extends keyof T>(obj: T, key: K, wrapper: WrapperOf<T, T[K]>): UnwrapOf<T[K]> {
    let byKey = chains.get(obj);
    if (!byKey) chains.set(obj, byKey = new Map());

    let chain = byKey.get(key);
    // A new chain for the first wrapper, and on top of anything that replaced the method since the last one
    if (!chain || obj[key] as unknown !== chain.trampoline) {
        const original = obj[key] as unknown;
        if (typeof original !== "function") throw new TypeError(`Can't wrap ${String(key)}: it isn't a function`);

        const created: Chain = {
            original: original as AnyFunction,
            hadOwn: Object.prototype.hasOwnProperty.call(obj, key),
            wrappers: [],
            inner: new Map(),
            entry: original as AnyFunction,
            trampoline: null!
        };
        created.trampoline = function (this: any, ...args: any[]) { return created.entry.apply(this, args); };
        obj[key] = created.trampoline as T[K];
        byKey.set(key, created);
        chain = created;
    }

    const own = chain;
    const link = wrapper as AnyFunction;
    own.wrappers.push(link);
    rebuild(own);

    const unwrap = () => {
        const i = own.wrappers.indexOf(link);
        if (i < 0) return;
        own.wrappers.splice(i, 1);
        rebuild(own);

        if (own.wrappers.length || obj[key] as unknown !== own.trampoline) return;
        // A method that came from the store's class goes back to coming from there
        if (own.hadOwn) obj[key] = own.original as T[K];
        else delete obj[key];
        if (byKey.get(key) === own) byKey.delete(key);
    };
    unwrap.original = (...args: any[]) => (own.inner.get(link) ?? own.original).apply(obj, args);

    return unwrap as UnwrapOf<T[K]>;
}
