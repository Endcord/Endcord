
// Appended to the generated ~plugins module of the desktop build, where the code of lazy plugins is kept outside the
// script (see scripts/build/pluginChunks.mjs). Each piece of that code is a chunk: a function the preload defines on
// window.EndcordChunks, taking (require, module, exports). The preload defines the chunks of the plugins that are on
// before this script runs, and EndcordNative.pluginChunks.load defines any other one when something needs it.
// Chunk ids are "c<n>"; "k<n>" is the n-th core module a chunk imports, from $coreModules.

// esbuild's CommonJS module helpers, which every chunk would otherwise declare itself. Passed to each chunk after
// (require, module, exports), in the order of CHUNK_HELPERS in scripts/build/pluginChunks.mjs
const $defProp = Object.defineProperty;
const $copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
        for (const key of Object.getOwnPropertyNames(from))
            if (!Object.prototype.hasOwnProperty.call(to, key) && key !== except)
                $defProp(to, key, { get: () => from[key], enumerable: !(desc = Object.getOwnPropertyDescriptor(from, key)) || desc.enumerable });
    }
    return to;
};
const $helpers = [
    Object.create,
    $defProp,
    Object.getOwnPropertyDescriptor,
    Object.getOwnPropertyNames,
    Object.getPrototypeOf,
    Object.prototype.hasOwnProperty,
    (target, all) => {
        for (const name in all) $defProp(target, name, { get: all[name], enumerable: true });
    },
    $copyProps,
    (mod, isNodeMode, target) => (target = mod != null ? Object.create(Object.getPrototypeOf(mod)) : {}, $copyProps(
        isNodeMode || !mod || !mod.__esModule ? $defProp(target, "default", { value: mod, enumerable: true }) : target,
        mod
    )),
    mod => $copyProps($defProp({}, "__esModule", { value: true }), mod)
];

const $chunkFactories = window.EndcordChunks ??= {};
const $chunkModules = {};
const $coreExports = [];
const $entryChunkOf = {};
const $meta = {};
let $burst = 0;

function $selfModule() {
    return { __esModule: true, default: plugins, PluginMeta, ExcludedPlugins, isPluginLoaded, getPluginFlag, setPluginLoadHook, preloadPluginCode, getPluginListInfo, getScreenStyle };
}

/**
 * Registers lazy plugins from records of "name|chunk|folder|flags|migratesFrom|loadsWith", separated by ";". Trailing
 * empty fields are left out, an empty folder is the name with a lowercase first letter, flags add up 1 (on by
 * default), 2 (required) and 4 (user plugin), and the lists are separated by ",".
 */
function $lazyTable(table) {
    for (const record of table.split(";")) {
        const [name, chunk, folder, flags = 0, migratesFrom, loadsWith] = record.split("|");
        const meta = $meta[name] = {
            folderName: folder || name[0].toLowerCase() + name.slice(1),
            userPlugin: (flags & 4) !== 0,
            required: (flags & 2) !== 0,
            enabledByDefault: (flags & 1) !== 0
        };
        if (migratesFrom) meta.migratesFrom = migratesFrom.split(",");
        if (loadsWith) meta.loadsWith = loadsWith.split(",");

        const id = $entryChunkOf[name] = `c${chunk}`;
        $lazy(name, () => $chunk(id));
    }
}

function $fetchChunks(ids) {
    // Listing every plugin (the plugins tab, search) reads them one after another; after several in a row, get the
    // rest in the same round trip instead of one each
    if ($burst++ === 0) setTimeout(() => $burst = 0);
    EndcordNative.pluginChunks.load($burst >= 8 ? ids.concat(Object.values($entryChunkOf)) : ids);
}

function $chunkRequire(id) {
    if (id[0] === "k") {
        const n = +id.slice(1);
        return $coreExports[n] ??= $coreModules[n]();
    }

    const loaded = $chunkModules[id];
    if (loaded) return loaded.exports;

    if (!$chunkFactories[id]) $fetchChunks([id]);
    const factory = $chunkFactories[id];
    if (!factory) throw new Error(`Endcord couldn't load plugin code ${id}. Restart Discord to finish updating Endcord.`);
    delete $chunkFactories[id];

    // Registered first so an import cycle gets the exports object, as it would between ES modules
    const module = $chunkModules[id] = { exports: {} };
    factory($chunkRequire, module, module.exports, ...$helpers);
    return module.exports;
}

function $chunk(id) {
    return $chunkRequire(id).default;
}

/**
 * What the plugin list shows of a lazy plugin whose code isn't loaded, read from its source at build time, so listing
 * every plugin doesn't load them all. undefined for a loaded plugin, or one whose details couldn't be read
 */
export function getPluginListInfo(name) {
    if (isPluginLoaded(name) || !$manifestChunk) return undefined;
    const info = $chunkRequire($manifestChunk)[name];
    return info && !info.x ? info : undefined;
}

/** One of the core's own screen styles, kept with the plugin chunks until a screen draws (see enableScreenStyles) */
export function getScreenStyle(key) {
    return ($screenChunk && $chunkRequire($screenChunk)[key]) || "";
}

/** Defines the code of these lazy plugins in one round trip, before they're read one by one */
export function preloadPluginCode(names) {
    const ids = [];
    for (const name of names) {
        const id = $entryChunkOf[name];
        if (id && !$chunkModules[id] && !$chunkFactories[id]) ids.push(id);
    }
    if (ids.length) EndcordNative.pluginChunks.load(ids);
}
