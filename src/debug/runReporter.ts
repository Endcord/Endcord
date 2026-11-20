/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addPatch } from "@api/PluginManager";
import { Logger } from "@utils/Logger";
import type { Patch, PatchReplacement } from "@utils/types";
import * as Webpack from "@webpack";
import { getBuildNumber, patches, patchTimings } from "@webpack/patcher";

import { loadLazyChunks } from "./loadLazyChunks";

const testMatch = (match: string | RegExp, code: string) => typeof match === "string" ? code.includes(match) : (match.lastIndex = 0, match.test(code));

/**
 * Replacements marked noWarn that changed nothing in any module their patch's find matches. noWarn keeps them out of
 * the "had no effect" warnings, so a dead one would never show. Tested on Discord's original module sources (String()
 * of a factory), each replacement after the earlier ones of its patch
 */
function deadSilencedReplacements(silenced: Patch[]) {
    const buildNumber = getBuildNumber();
    const outOfBuild = (r: PatchReplacement) => buildNumber !== -1 && (r.fromBuild != null && buildNumber < r.fromBuild || r.toBuild != null && buildNumber > r.toBuild);
    const sources = Object.values(Webpack.wreq.m).map(String);
    const dead: string[] = [];

    for (const patch of silenced) {
        const matching = sources.filter(code => testMatch(patch.find, code));
        // A find that matches nothing is reported as "found no module" already
        if (!matching.length) continue;

        const replacements = patch.replacement as PatchReplacement[];
        const worked = replacements.map(() => false);
        for (let code of matching) {
            replacements.forEach((r, i) => {
                if (outOfBuild(r)) return;
                if (typeof r.match !== "string") r.match.lastIndex = 0;
                // A throwing replacement must not end the whole run: it just didn't work
                let next = code;
                try {
                    next = code.replace(r.match, r.replace as string);
                } catch { }
                if (next !== code) {
                    worked[i] = true;
                    code = next;
                }
            });
        }

        replacements.forEach((r, i) => {
            if ((patch.noWarn || r.noWarn) && !outOfBuild(r) && !worked[i]) dead.push(`${patch.plugin}: ${String(r.match)} (find ${String(patch.find)}, ${matching.length} modules)`);
        });
    }

    return dead;
}

async function runReporter() {
    const ReporterLogger = new Logger("Reporter");

    try {
        ReporterLogger.log("Starting test...");

        // Taken before Discord's modules load: a patch that matched is gone from the list afterwards
        const silenced = patches.filter(p => p.noWarn || (p.replacement as PatchReplacement[]).some(r => r.noWarn));

        const { promise: loadLazyChunksDone, resolve: loadLazyChunksResolve } = Promise.withResolvers<void>();

        // The main patch for starting the reporter chunk loading
        addPatch({
            find: '"Could not find app-mount"',
            replacement: {
                match: /"Could not find app-mount"/,
                replace: "(Endcord.Webpack._initReporter(),$&)"
            }
        }, "Endcord Reporter");

        // @ts-expect-error
        Endcord.Webpack._initReporter = function () {
            // initReporter is called in the patched entry point of Discord
            // setImmediate to only start searching for lazy chunks after Discord initialized the app
            setTimeout(() => loadLazyChunks().then(loadLazyChunksResolve), 0);
        };

        await loadLazyChunksDone;

        // Manually require all modules to make sure all lazily required modules are patched
        for (const moduleId of Object.keys(Webpack.wreq.m)) {
            try {
                Webpack.wreq(moduleId);
            } catch { }
        }

        if (IS_REPORTER && IS_WEB && !IS_ENDCORD_DESKTOP) {
            console.debug("[REPORTER_META]", {
                buildNumber: getBuildNumber(),
                buildHash: window.GLOBAL_ENV.SENTRY_TAGS.buildId
            });
        }

        for (const patch of patches) {
            if (!patch.all) {
                new Logger("WebpackPatcher").warn(`Patch by ${patch.plugin} found no module (Module id is -): ${patch.find}`);
            }
        }

        for (const [plugin, moduleId, match, totalTime] of patchTimings) {
            if (totalTime > 10) {
                new Logger("WebpackPatcher").warn(`Patch by ${plugin} took ${Math.round(totalTime * 100) / 100}ms (Module id is ${String(moduleId)}): ${match}`);
            }
        }

        // Its own section, not a failure: some noWarn replacements only apply to some builds or modules on purpose
        const deadSilenced = deadSilencedReplacements(silenced);
        if (deadSilenced.length) ReporterLogger.log(`noWarn replacements with no effect (${deadSilenced.length}):\n${deadSilenced.join("\n")}`);

        for (const [searchType, args] of Webpack.lazyWebpackSearchHistory) {
            let method = searchType;

            if (searchType === "findComponent") method = "find";
            if (searchType === "findExportedComponent") method = "findByProps";
            if (searchType === "waitFor" || searchType === "waitForComponent") {
                if (typeof args[0] === "string") method = "findByProps";
                else method = "find";
            }
            if (searchType === "waitForStore") method = "findStore";

            let result: any;
            try {
                if (method === "proxyLazyWebpack" || method === "LazyComponentWebpack") {
                    const [factory] = args;
                    result = factory();
                } else if (method === "extractAndLoadChunks") {
                    const [code, matcher] = args;

                    result = await Webpack.extractAndLoadChunks(code, matcher);
                    if (result === false) result = null;
                } else if (method === "mapMangledModule") {
                    const [code, mapper, includeBlacklistedExports] = args;

                    result = Webpack.mapMangledModule(code, mapper, includeBlacklistedExports);
                    if (Object.keys(result).length !== Object.keys(mapper).length) throw new Error("Webpack Find Fail");
                } else {
                    result = Webpack[method](...args);
                }

                if (result == null || (result.$$endcordGetWrappedComponent != null && result.$$endcordGetWrappedComponent() == null)) throw new Error("Webpack Find Fail");
            } catch (e) {
                let logMessage = searchType;
                if (method === "find" || method === "proxyLazyWebpack" || method === "LazyComponentWebpack") {
                    if (args[0].$$endcordProps != null) {
                        logMessage += `(${args[0].$$endcordProps.map(arg => `"${arg}"`).join(", ")})`;
                    } else {
                        logMessage += `(${args[0].toString().slice(0, 147)}...)`;
                    }
                } else if (method === "extractAndLoadChunks") {
                    logMessage += `([${args[0].map(arg => `"${arg}"`).join(", ")}], ${args[1].toString()})`;
                } else if (method === "mapMangledModule") {
                    const failedMappings = Object.keys(args[1]).filter(key => result?.[key] == null);

                    logMessage += `("${args[0]}", {\n${failedMappings.map(mapping => `\t${mapping}: ${args[1][mapping].toString().slice(0, 147)}...`).join(",\n")}\n})`;
                } else {
                    logMessage += `(${args.map(arg => `"${arg}"`).join(", ")})`;
                }

                ReporterLogger.log("Webpack Find Fail:", logMessage);
            }
        }

        ReporterLogger.log("Finished test");
    } catch (e) {
        ReporterLogger.log("A fatal error occurred:", e);
    }
}

// Run after the Endcord object has been created.
// We need to add extra properties to it, and it is only created after all of Endcord code has ran
setTimeout(runReporter, 0);
