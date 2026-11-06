/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated, Nuckyz, and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { traceFunctionWithResults } from "@debug/Tracer";
import { WebpackRequire } from "@endcord/discord-types/webpack";
import { makeLazy } from "@utils/lazy";
import { Logger } from "@utils/Logger";
import { interpolateIfDefined } from "@utils/misc";
import { Patch, PatchReplacement } from "@utils/types";

import { defineExports } from "./defineExports";
import { cachedPatchesFor, ensurePatchCache, recordMatch, recordScanned } from "./patchCache";
import { AnyModuleFactory, AnyWebpackRequire, MaybePatchedModuleFactory, PatchedModuleFactory } from "./types";
import { _blacklistBadModules, _initWebpack, _notifyStoreSubscriptions, factoryListeners, findModuleFactory, moduleListeners, storeSubscriptions, waitForSubscriptions, wreq } from "./webpack";

export const patches = [] as Patch[];

export const SYM_ORIGINAL_MODULE_FACTORIES = Symbol("WebpackPatcher.originalModuleFactories");
export const SYM_IS_PROXIED_FACTORY = Symbol("WebpackPatcher.isProxiedFactory");
export const SYM_ORIGINAL_FACTORY = Symbol("WebpackPatcher.originalFactory");
export const SYM_PATCHED_SOURCE = Symbol("WebpackPatcher.patchedSource");
export const SYM_PATCHED_BY = Symbol("WebpackPatcher.patchedBy");
export const allWebpackInstances = new Set<AnyWebpackRequire>();
/**
 * Each instance's own module factories object, behind the proxy on wreq.m. Reading and defining factories here skips
 * a proxy round trip for every one of the thousands of factories Discord defines
 */
const originalModulesOf = new WeakMap<AnyWebpackRequire, AnyWebpackRequire["m"]>();

export const patchTimings = [] as Array<[plugin: string, moduleId: PropertyKey, match: PatchReplacement["match"], totalTime: number]>;
/** Milliseconds each plugin has spent rewriting Discord's code so far, for the Diagnostics page */
export const patchTimeByPlugin = new Map<string, number>();
/**
 * The patches of each plugin that found their module but changed nothing or broke it, which happens when Discord
 * changes the code they look for. Shown on the plugin's card and in Diagnostics
 */
export const patchProblems = new Map<string, Set<string>>();
/** Which plugins changed each module, so a crash inside one can be traced back to them */
export const pluginsByModule = new Map<string, string[]>();

function notePatchProblem(plugin: string, match: PatchReplacement["match"]) {
    let problems = patchProblems.get(plugin);
    if (!problems) patchProblems.set(plugin, problems = new Set());
    problems.add(String(match));
}

export const getBuildNumber = makeLazy(() => {
    try {
        function matchBuildNumber(factoryStr: string) {
            const buildNumberMatch = factoryStr.match(/"Trying to open a changelog for an invalid build number (\d+?)"\)/);
            if (buildNumberMatch == null) {
                return -1;
            }

            return Number(buildNumberMatch[1]);
        }

        const hardcodedFactoryStr = String(wreq.m[927815]);
        if (hardcodedFactoryStr.includes("Trying to open a changelog for an invalid build number")) {
            const hardcodedBuildNumber = matchBuildNumber(hardcodedFactoryStr);

            if (hardcodedBuildNumber !== -1) {
                return hardcodedBuildNumber;
            }
        } else if (IS_DEV || IS_REPORTER) {
            logger.error("Hardcoded build number module id is invalid");
        }

        const moduleFactory = findModuleFactory("Trying to open a changelog for an invalid build number");
        return matchBuildNumber(String(moduleFactory));
    } catch {
        return -1;
    }
});

export function getFactoryPatchedSource(moduleId: PropertyKey, webpackRequire = wreq as AnyWebpackRequire) {
    return webpackRequire.m[moduleId]?.[SYM_PATCHED_SOURCE];
}

export function getFactoryPatchedBy(moduleId: PropertyKey, webpackRequire = wreq as AnyWebpackRequire) {
    return webpackRequire.m[moduleId]?.[SYM_PATCHED_BY];
}

const logger = new Logger("WebpackPatcher", "#8caaee");

/** Whether we tried to fallback to the WebpackRequire of the factory, or disabled patches */
let wreqFallbackApplied = false;

const define: typeof Reflect.defineProperty = (target, p, attributes) => {
    if (Object.hasOwn(attributes, "value")) {
        attributes.writable = true;
    }

    return Reflect.defineProperty(target, p, {
        configurable: true,
        enumerable: true,
        ...attributes
    });
};

// wreq.m is the Webpack object containing module factories. It is pre-populated with factories, and is also populated via webpackGlobal.push
// We use this setter to intercept when wreq.m is defined and setup our setters which decide whether we should patch these module factories
// and the Webpack instance where they are being defined.

// Factories can be patched in two ways. Eagerly or lazily.
// If we are patching eagerly, pre-populated factories are patched immediately and new factories are patched when set.
// Else, we only patch them when called.

// Factories are always wrapped in a proxy, which allows us to intercept the call to them, patch if they werent eagerly patched,
// and call them with our wrapper which notifies our listeners.

// wreq.m is also wrapped in a proxy to intercept when new factories are set, patch them eargely, if enabled, and wrap them in the factory proxy.

// If this is the main Webpack, we also set up the internal references to WebpackRequire.
define(Function.prototype, "m", {
    enumerable: false,

    set(this: AnyWebpackRequire, originalModules: AnyWebpackRequire["m"]) {
        define(this, "m", { value: originalModules });

        // Ensure this is likely one of Discord main Webpack instances.
        // We may catch Discord bundled libs, React Devtools or other extensions Webpack instances here.
        const { stack } = new Error();
        if (!stack?.includes("http") || stack.match(/at \d+? \(/) || !String(this).includes("exports:{}")) {
            return;
        }

        const fileName = stack.match(/\/assets\/(.+?\.js)/)?.[1];

        // Currently, sentry and libdiscore Webpack instances are not meant to be patched.
        // As an extra measure, take advatange of the fact their files include the names and return early if it's one of them.
        // Later down we also include other measures to avoid patching them.
        if (["sentry", "libdiscore", "fast-connect"].some(name => fileName?.toLowerCase()?.includes(name))) {
            return;
        }

        // Define a setter for the bundlePath property of WebpackRequire. Only Webpack instances which include chunk loading functionality,
        // like the main Discord Webpack, have this property.
        // So if the setter is called with the Discord bundlePath, this means we should patch this instance and initialize the internal references to WebpackRequire.
        define(this, "p", {
            enumerable: false,

            set(this: AnyWebpackRequire, bundlePath: NonNullable<AnyWebpackRequire["p"]>) {
                define(this, "p", { value: bundlePath });
                clearTimeout(bundlePathTimeout);

                // libdiscore init Webpack instance always returns a constant string for the js filename of a chunk.
                // In that case, avoid patching this instance,
                // as it runs before the main Webpack instance and will make the WebpackRequire fallback not work properly, or init an wrongful main WebpackRequire.
                if (bundlePath !== "/assets/" || /(?:=>|{return)"[^"]+?"[^=]/.exec(String(this.u))) {
                    return;
                }

                if (wreq == null && this.c != null) {
                    logger.info(`Main WebpackInstance found${interpolateIfDefined` in ${fileName}`}, initializing internal references to WebpackRequire`);
                    _initWebpack(this as WebpackRequire);
                }

                patchThisInstance();
            }
        });

        // In the past, the sentry Webpack instance which we also wanted to patch used to rely on chunks being loaded before initing sentry.
        // This Webpack instance did not include actual chunk loading, and only awaited for them to be loaded, which means it did not include the bundlePath property.
        // To keep backwards compability, if this is ever the case again, and keep patching this type of instance, we explicity patch instances which include wreq.O and not wreq.p.
        // Since we cannot check what is the bundlePath of the instance to filter for the Discord bundlePath, we only patch it if wreq.p is not included,
        // which means the instance relies on another instance which does chunk loading, and that makes it very likely to only target Discord Webpack instances like the old sentry.

        // Instead of patching when wreq.O is defined, wait for when wreq.O.j is defined, since that will be one of the last things to happen,
        // which can assure wreq.p could have already been defined before.
        define(this, "O", {
            enumerable: false,

            set(this: AnyWebpackRequire, onChunksLoaded: NonNullable<AnyWebpackRequire["O"]>) {
                define(this, "O", { value: onChunksLoaded });
                clearTimeout(onChunksLoadedTimeout);

                const wreq = this;
                define(onChunksLoaded, "j", {
                    enumerable: false,

                    set(this: NonNullable<AnyWebpackRequire["O"]>, j: NonNullable<AnyWebpackRequire["O"]>["j"]) {
                        define(this, "j", { value: j });

                        if (wreq.p == null) {
                            patchThisInstance();
                        }
                    }
                });
            }
        });

        // If neither of these properties setters were triggered, delete them as they are not needed anymore.
        const bundlePathTimeout = setTimeout(() => Reflect.deleteProperty(this, "p"), 0);
        const onChunksLoadedTimeout = setTimeout(() => Reflect.deleteProperty(this, "O"), 0);

        /**
         * Patch the current Webpack instance assigned to `this` context.
         * This should only be called if this instance was later found to be one we need to patch.
         */
        const patchThisInstance = () => {
            logger.info(`Found Webpack module factories${interpolateIfDefined` in ${fileName}`}`);
            allWebpackInstances.add(this);
            originalModulesOf.set(this, originalModules);

            // Proxy (and maybe patch) pre-populated factories
            for (const moduleId in originalModules) {
                proxyFactoryAndUpdateExisting(originalModules, moduleId, originalModules[moduleId], originalModules, true);
            }

            define(originalModules, Symbol.toStringTag, {
                value: "ModuleFactories",
                enumerable: false
            });

            const proxiedModuleFactories = new Proxy(originalModules, moduleFactoriesHandler);
            /*
            If Webpack ever decides to set module factories using the variable of the modules object directly, instead of wreq.m, switch the proxy to the prototype
            Reflect.setPrototypeOf(originalModules, new Proxy(originalModules, moduleFactoriesHandler));
            */

            define(this, "m", { value: proxiedModuleFactories });

            // Overwrite Webpack's defineExports function to define the export descriptors configurable.
            // This is needed so we can later blacklist specific exports from Webpack search by making them non-enumerable
            this.d = defineExports;
        };
    }
});

// The proxy for patching eagerly and/or wrapping factories in their proxy.
const moduleFactoriesHandler: ProxyHandler<AnyWebpackRequire["m"]> = {
    /*
    If Webpack ever decides to set module factories using the variable of the modules object directly instead of wreq.m, we need to switch the proxy to the prototype
    and that requires defining additional traps for keeping the object working

    // Proxies on the prototype don't intercept "get" when the property is in the object itself. But in case it isn't we need to return undefined,
    // to avoid Reflect.get having no effect and causing a stack overflow
    get(target, p, receiver) {
        return undefined;
    },
    // Same thing as get
    has(target, p) {
        return false;
    },
    */

    get(target, p, receiver) {
        if (p === SYM_ORIGINAL_MODULE_FACTORIES) {
            return target;
        }

        return Reflect.get(target, p, receiver);
    },

    set: proxyFactoryAndUpdateExisting
};

// The proxy for patching lazily and/or running factories with our wrapper.
const moduleFactoryHandler: ProxyHandler<MaybePatchedModuleFactory> = {
    apply(target, thisArg: unknown, argArray: Parameters<AnyModuleFactory>) {
        // If SYM_ORIGINAL_FACTORY exists in the proxy target, it means the proxy target is already a patched factory.
        // In that case, just run it.
        if (target[SYM_ORIGINAL_FACTORY] != null) {
            return runFactoryWithWrap(target as PatchedModuleFactory, thisArg, argArray);
        }

        // SAFETY: Factories have `name` as their key in the module factories object, and that is always their module id.
        const moduleId: string = target.name;

        // Patch the proxy target, which is the original factory.
        const patchedFactory = patchFactory(moduleId, target);
        return runFactoryWithWrap(patchedFactory, thisArg, argArray);
    },

    get(target, p, receiver) {
        if (p === SYM_IS_PROXIED_FACTORY) {
            return true;
        }

        // If the proxy target is a patched factory, SYM_ORIGINAL_FACTORY will have the original factory. Otherwise the target itself will be it.
        const originalFactory: AnyModuleFactory = target[SYM_ORIGINAL_FACTORY] ?? target;

        // Redirect getting these properties from the original factory, including making `toString` return the original factory `toString`
        if (p === "toString" || p === SYM_PATCHED_SOURCE || p === SYM_PATCHED_BY) {
            const v = Reflect.get(originalFactory, p, originalFactory);
            return p === "toString" ? v.bind(originalFactory) : v;
        }

        return Reflect.get(target, p, receiver);
    }
};

/** Read once: this runs for each of the thousands of factories Discord defines, and a change needs a restart anyway */
let eagerPatches: boolean | undefined;

function proxyFactoryAndUpdateExisting(moduleFactories: AnyWebpackRequire["m"], moduleId: PropertyKey, newFactory: AnyModuleFactory, receiver: any, ignoreExistingInTarget = false) {
    notifyFactoryListeners(moduleId, newFactory);
    eagerPatches ??= Settings.eagerPatches;
    const proxiedFactory = new Proxy(eagerPatches ? patchFactory(moduleId, newFactory) : newFactory, moduleFactoryHandler);

    if (updateExistingFactory(moduleFactories, moduleId, newFactory, proxiedFactory, ignoreExistingInTarget)) {
        return true;
    }

    return Reflect.set(moduleFactories, moduleId, proxiedFactory, receiver);
}

/**
 * Update a duplicated factory that exists in any of the Webpack instances we track with a new original and proxied factory.
 *
 * @param moduleFactories The module factories where this new original factory is being set
 * @param moduleId The id of the module
 * @param newFactory The new original factory
 * @param newProxiedFactory The new original and proxied factory
 * @param receiver The receiver of the factory
 * @param ignoreExistingInTarget Whether to ignore checking if the factory already exists in the moduleFactories where it is being set
 * @returns Whether the original factory was updated, or false if it doesn't exist in any of the tracked Webpack instances
 */
function updateExistingFactory(moduleFactories: AnyWebpackRequire["m"], moduleId: PropertyKey, newFactory: AnyModuleFactory, newProxiedFactory: AnyModuleFactory, ignoreExistingInTarget: boolean) {
    let existingFactory: AnyModuleFactory | undefined;
    for (const wreq of allWebpackInstances) {
        const instanceModuleFactories = originalModulesOf.get(wreq) ?? wreq.m[SYM_ORIGINAL_MODULE_FACTORIES] ?? wreq.m;

        if (ignoreExistingInTarget && instanceModuleFactories === moduleFactories) {
            continue;
        }

        // The proxy on wreq.m only intercepts setting, so its target holds the same (proxied) factories
        if (Object.hasOwn(instanceModuleFactories, moduleId)) {
            existingFactory = instanceModuleFactories[moduleId];
            break;
        }
    }

    if (existingFactory != null) {
        // SYM_ORIGINAL_FACTORY means the factory has already been patched. In this case, only update existingFactory original factory to the new one.
        if (existingFactory[SYM_ORIGINAL_FACTORY] != null) {
            existingFactory[SYM_ORIGINAL_FACTORY] = newFactory;

            // Persist patched source and patched by in the new original factory
            if (IS_DEV) {
                newFactory[SYM_PATCHED_SOURCE] = existingFactory[SYM_PATCHED_SOURCE];
                newFactory[SYM_PATCHED_BY] = existingFactory[SYM_PATCHED_BY];
            }
        } else {
            defineInWebpackInstances(moduleId, newProxiedFactory);
        }

        return true;
    }

    return false;
}

/**
 * Define a module factory in all the Webpack instances we track.
 *
 * @param moduleId The id of the module
 * @param factory The factory
 */
function defineInWebpackInstances(moduleId: PropertyKey, factory: AnyModuleFactory) {
    for (const wreq of allWebpackInstances) {
        define(originalModulesOf.get(wreq) ?? wreq.m, moduleId, { value: factory });
    }
}

/**
 * Notify all factory listeners.
 *
 * @param moduleId The id of the module
 * @param factory The original factory to notify for
 */
function notifyFactoryListeners(moduleId: PropertyKey, factory: AnyModuleFactory) {
    for (const factoryListener of factoryListeners) {
        try {
            factoryListener(factory, moduleId);
        } catch (err) {
            logger.error("Error in Webpack factory listener:\n", err, factoryListener);
        }
    }
}

/**
 * Webpack marks a module loaded once its factory has run, and Endcord's searches skip modules that aren't. Newer Webpack
 * (Discord's Canary since November 2026) no longer tracks it: its modules are just { id, exports }. Then every search
 * came up empty and plugins broke, so mark them here. Where Webpack does track it, it's false until the factory returns
 * and Webpack sets it right after, so this leaves those alone
 */
function markLoaded(module: { loaded?: boolean; }) {
    if (module.loaded === undefined) module.loaded = true;
}

/**
 * Run a (possibly) patched module factory with a wrapper which notifies our listeners.
 *
 * @param patchedFactory The (possibly) patched module factory
 * @param thisArg The `value` of the call to the factory
 * @param argArray The arguments of the call to the factory
 */
function runFactoryWithWrap(patchedFactory: PatchedModuleFactory, thisArg: unknown, argArray: Parameters<MaybePatchedModuleFactory>) {
    // A factory no patch changed is Discord's own and carries no SYM_ORIGINAL_FACTORY (see patchFactory)
    const originalFactory: AnyModuleFactory = patchedFactory[SYM_ORIGINAL_FACTORY] ?? patchedFactory;

    let [module, exports, require] = argArray;

    // Restore the original factory in all the module factories objects, discarding our proxy and allowing it to be garbage collected
    defineInWebpackInstances(module.id, originalFactory);

    if (wreq == null) {
        if (!wreqFallbackApplied) {
            wreqFallbackApplied = true;

            // Make sure the require argument is actually the WebpackRequire function
            if (typeof require === "function" && require.m != null && require.c != null) {
                const { stack } = new Error();
                const webpackInstanceFileName = stack?.match(/\/assets\/(.+?\.js)/)?.[1];

                logger.warn(
                    "WebpackRequire was not initialized, falling back to WebpackRequire passed to the first called wrapped module factory (" +
                    `id: ${String(module.id)}${interpolateIfDefined`, WebpackInstance origin: ${webpackInstanceFileName}`
                    })`
                );

                // Could technically be wrong, but it's better than nothing
                _initWebpack(require as WebpackRequire);
            } else if (IS_DEV) {
                logger.error("WebpackRequire was not initialized, running modules without patches instead.");
                return originalFactory.apply(thisArg, argArray);
            }
        } else if (IS_DEV) {
            return originalFactory.apply(thisArg, argArray);
        }
    }

    let factoryReturn: unknown;
    try {
        factoryReturn = patchedFactory.apply(thisArg, argArray);
    } catch (err) {
        // Just re-throw Discord errors
        if (patchedFactory === originalFactory) {
            throw err;
        }

        logger.error("Error in patched module factory:\n", err);
        factoryReturn = originalFactory.apply(thisArg, argArray);
        markLoaded(module);
        return factoryReturn;
    }

    markLoaded(module);
    exports = module.exports;

    if (typeof require === "function" && require.c) {
        if (_blacklistBadModules(require.c, exports, module.id)) {
            return factoryReturn;
        }
    }

    if (exports == null) {
        return factoryReturn;
    }

    for (const callback of moduleListeners) {
        try {
            callback(exports, module.id);
        } catch (err) {
            logger.error("Error in Webpack module listener:\n", err, callback);
        }
    }

    for (const [filter, callback] of waitForSubscriptions) {
        try {
            if (filter(exports)) {
                waitForSubscriptions.delete(filter);
                callback(exports, module.id);
            }
        } catch (err) {
            logger.error(
                "Error while filtering or firing callback for Webpack waitFor subscription:\n", err,
                "\n\nModule exports:", exports,
                "\n\nFilter:", filter,
                "\n\nCallback:", callback
            );
        }
    }

    if (storeSubscriptions.size) {
        _notifyStoreSubscriptions(exports, module.id);
    }

    if (typeof exports !== "object" || (!waitForSubscriptions.size && !storeSubscriptions.size)) {
        return factoryReturn;
    }

    // Read each export once and test it against every subscription. Discord's exports are getters,
    // so walking the exports once per subscription called each getter dozens of times per module.
    for (const exportKey in exports) {
        // Some exports might have not been initialized yet due to circular imports, so try catch it.
        try {
            var exportValue = exports[exportKey];
        } catch {
            continue;
        }

        if (exportValue == null) continue;

        if (storeSubscriptions.size) {
            _notifyStoreSubscriptions(exportValue, module.id);
        }

        for (const [filter, callback] of waitForSubscriptions) {
            try {
                if (filter(exportValue)) {
                    waitForSubscriptions.delete(filter);
                    callback(exportValue, module.id);
                }
            } catch (err) {
                logger.error(
                    "Error while filtering or firing callback for Webpack waitFor subscription:\n", err,
                    "\n\nExport value:", exports,
                    "\n\nFilter:", filter,
                    "\n\nCallback:", callback
                );
            }
        }

        if (!waitForSubscriptions.size && !storeSubscriptions.size) break;
    }

    return factoryReturn;
}

/**
 * Patches a module factory.
 *
 * @param moduleId The id of the module
 * @param originalFactory The original module factory
 * @returns The patched module factory
 */
function patchFactory(moduleId: PropertyKey, originalFactory: AnyModuleFactory): PatchedModuleFactory {
    ensurePatchCache(patches);

    // A module that matched no patch on earlier starts of this Discord build is left alone without reading its code
    const cached = cachedPatchesFor(moduleId);
    if (cached?.length === 0) {
        return originalFactory as PatchedModuleFactory;
    }

    // A known module only tries the patches that matched it before and haven't been used up since
    const candidates = cached?.filter(patch => patches.includes(patch)) ?? patches;
    /** Removes a used up patch, and returns the index the loop goes on from */
    const consume = (index: number) => {
        if (candidates === patches) {
            patches.splice(index, 1);
            return index - 1;
        }

        const at = patches.indexOf(candidates[index]);
        if (at !== -1) patches.splice(at, 1);
        return index;
    };

    const originalFactoryCode = String(originalFactory);
    const isArrowFunction = originalFactoryCode.startsWith("(");

    // 0, prefix to turn it into an expression: 0,function(){} would be invalid syntax without the 0,
    let code = `0,${!isArrowFunction ? "function" : ""}${originalFactoryCode.slice(originalFactoryCode.indexOf("("))}`;
    const unpatchedCode = code;
    let patchedSource = code;
    let patchedFactory = originalFactory;

    const patchedBy = new Set<string>();

    const buildNumber = getBuildNumber();
    const shouldCheckBuildNumber = buildNumber !== -1;

    /**
     * Applies a patch as plain string work and leaves compiling to the end, so a module several plugins patch is
     * compiled once instead of once per plugin. Returns false if a replacement threw.
     */
    const applyAsText = (patch: Patch) => {
        let newCode = code;

        try {
            for (const replacement of patch.replacement as PatchReplacement[]) {
                if (
                    shouldCheckBuildNumber &&
                    (replacement.fromBuild != null && buildNumber < replacement.fromBuild) ||
                    (replacement.toBuild != null && buildNumber > replacement.toBuild)
                ) {
                    continue;
                }

                const { match } = replacement;
                if (typeof match !== "string" && match.global) {
                    match.lastIndex = 0;
                }

                const replaced = newCode.replace(match, replacement.replace as string);
                if (replaced === newCode) {
                    if (!(patch.noWarn || replacement.noWarn)) {
                        logger.warn(`Patch by ${patch.plugin} had no effect (Module id is ${String(moduleId)}): ${replacement.match}`);
                        notePatchProblem(patch.plugin, replacement.match);
                    }

                    if (patch.group) {
                        logger.warn(`Undoing patch group ${patch.find} by ${patch.plugin} because replacement ${replacement.match} had no effect`);
                        return true;
                    }

                    continue;
                }

                newCode = replaced;
            }
        } catch {
            return false;
        }

        if (newCode !== code) {
            code = newCode;
            patchedBy.add(patch.plugin);
        }
        return true;
    };

    /** Applies a patch one replacement at a time, compiling after each, to find and skip a broken one */
    const applyOneByOne = (patch: Patch) => {
        const executePatch = traceFunctionWithResults(`patch by ${patch.plugin}`, (match: string | RegExp, replace: string) => {
            if (typeof match !== "string" && match.global) {
                match.lastIndex = 0;
            }

            return code.replace(match, replace);
        });

        const previousCode = code;
        const previousFactory = patchedFactory;
        let markedAsPatched = false;

        // We change all patch.replacement to array in PluginManager
        for (const replacement of patch.replacement as PatchReplacement[]) {
            if (
                shouldCheckBuildNumber &&
                (replacement.fromBuild != null && buildNumber < replacement.fromBuild) ||
                (replacement.toBuild != null && buildNumber > replacement.toBuild)
            ) {
                continue;
            }

            const lastCode = code;
            const lastFactory = patchedFactory;

            try {
                const startedAt = performance.now();
                const [newCode, totalTime] = executePatch(replacement.match, replacement.replace as string);
                patchTimeByPlugin.set(patch.plugin, (patchTimeByPlugin.get(patch.plugin) ?? 0) + performance.now() - startedAt);

                if (IS_REPORTER) {
                    patchTimings.push([patch.plugin, moduleId, replacement.match, totalTime]);
                }

                if (newCode === code) {
                    if (!(patch.noWarn || replacement.noWarn)) {
                        logger.warn(`Patch by ${patch.plugin} had no effect (Module id is ${String(moduleId)}): ${replacement.match}`);
                        notePatchProblem(patch.plugin, replacement.match);
                        if (IS_DEV) {
                            logger.debug("Function Source:\n", code);
                        }
                    }

                    if (patch.group) {
                        logger.warn(`Undoing patch group ${patch.find} by ${patch.plugin} because replacement ${replacement.match} had no effect`);
                        code = previousCode;
                        patchedFactory = previousFactory;

                        if (markedAsPatched) {
                            patchedBy.delete(patch.plugin);
                        }

                        break;
                    }

                    continue;
                }

                const pluginsList = [...patchedBy];
                if (!patchedBy.has(patch.plugin)) {
                    pluginsList.push(patch.plugin);
                }

                code = newCode;
                patchedSource = `// Webpack Module ${String(moduleId)} - Patched by ${pluginsList.join(", ")}\n${code}\n//# sourceURL=file:///WebpackModule${String(moduleId)}`;
                patchedFactory = (0, eval)(patchedSource);

                if (!patchedBy.has(patch.plugin)) {
                    patchedBy.add(patch.plugin);
                    markedAsPatched = true;
                }
            } catch (err) {
                // FIXME: Maybe fix this properly
                const shouldSuppressError = patch.plugin === "ContextMenuAPI" && err instanceof SyntaxError && err.message.includes("arguments");
                if (!shouldSuppressError) {
                    logger.error(`Patch by ${patch.plugin} errored (Module id is ${String(moduleId)}): ${replacement.match}\n`, err);
                    notePatchProblem(patch.plugin, replacement.match);

                    if (IS_DEV) {
                        diffErroredPatch(code, lastCode, lastCode.match(replacement.match)!);
                    }
                }

                if (markedAsPatched) {
                    patchedBy.delete(patch.plugin);
                }

                if (patch.group) {
                    logger.warn(`Undoing patch group ${patch.find} by ${patch.plugin} because replacement ${replacement.match} errored`);
                    code = previousCode;
                    patchedFactory = previousFactory;
                    break;
                }

                code = lastCode;
                patchedFactory = lastFactory;
            }
        }
    };

    const batched: Patch[] = [];
    let batchFailed = false;

    for (let i = 0; i < candidates.length; i++) {
        const patch = candidates[i];

        if (
            shouldCheckBuildNumber &&
            (patch.fromBuild != null && buildNumber < patch.fromBuild) ||
            (patch.toBuild != null && buildNumber > patch.toBuild)
        ) {
            i = consume(i);
            continue;
        }

        const moduleMatches = typeof patch.find === "string"
            ? code.includes(patch.find)
            : (patch.find.global && (patch.find.lastIndex = 0), patch.find.test(code));

        if (!moduleMatches) {
            continue;
        }

        recordMatch(moduleId, patch);

        if (IS_REPORTER) {
            applyOneByOne(patch);
        } else {
            batched.push(patch);
            if (!applyAsText(patch)) batchFailed = true;
        }

        if (!patch.all) {
            i = consume(i);
        }
    }

    // Everything matched was applied as text: compile it once. If that fails, start over one replacement at a time
    if (batched.length) {
        if (!batchFailed && code !== unpatchedCode) {
            try {
                patchedSource = `// Webpack Module ${String(moduleId)} - Patched by ${[...patchedBy].join(", ")}\n${code}\n//# sourceURL=file:///WebpackModule${String(moduleId)}`;
                patchedFactory = (0, eval)(patchedSource);
            } catch {
                batchFailed = true;
            }
        }

        if (batchFailed) {
            code = unpatchedCode;
            patchedSource = unpatchedCode;
            patchedFactory = originalFactory;
            patchedBy.clear();
            for (const patch of batched) applyOneByOne(patch);
        }
    }

    recordScanned(moduleId);
    if (patchedBy.size) pluginsByModule.set(String(moduleId), [...patchedBy]);

    // Only a patched factory, which is a new function, gets this. Adding it to Discord's own factory and deleting it
    // again after the first run turned thousands of them into slow dictionary-mode objects
    if (patchedFactory !== originalFactory) {
        patchedFactory[SYM_ORIGINAL_FACTORY] = originalFactory;
    }

    if (IS_DEV && patchedFactory !== originalFactory) {
        originalFactory[SYM_PATCHED_SOURCE] = patchedSource;
        originalFactory[SYM_PATCHED_BY] = patchedBy;
    }

    return patchedFactory as PatchedModuleFactory;
}

function diffErroredPatch(code: string, lastCode: string, match: RegExpMatchArray) {
    const changeSize = code.length - lastCode.length;

    // Use 200 surrounding characters of context
    const start = Math.max(0, match.index! - 200);
    const end = Math.min(lastCode.length, match.index! + match[0].length + 200);
    // (changeSize may be negative)
    const endPatched = end + changeSize;

    const context = lastCode.slice(start, end);
    const patchedContext = code.slice(start, endPatched);

    // Inline require to avoid including it in !IS_DEV builds
    const diff = (require("diff") as typeof import("diff")).diffWordsWithSpace(context, patchedContext);
    let fmt = "%c %s ";
    const elements: string[] = [];
    for (const d of diff) {
        const color = d.removed
            ? "red"
            : d.added
                ? "lime"
                : "grey";
        fmt += "%c%s";
        elements.push(`color:${color}`, d.value);
    }

    logger.errorCustomFmt(...Logger.makeTitle("white", "Before"), context);
    logger.errorCustomFmt(...Logger.makeTitle("white", "After"), patchedContext);
    const [titleFmt, ...titleElements] = Logger.makeTitle("white", "Diff");
    logger.errorCustomFmt(titleFmt + fmt, ...titleElements, ...elements);
}
