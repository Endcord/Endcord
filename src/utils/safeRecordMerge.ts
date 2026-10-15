// Copy a Discord record without wrapping it in a Proxy.
// Discord freezes methods like isStaff. A proxy that returns anything else
// throws and the gateway reconnects forever.

export function safeRecordMerge<T extends object>(base: T, overlay: Record<string, any> | null | undefined): T {
    if (!base || typeof base !== "object") return base;
    const clone = Object.create(Object.getPrototypeOf(base));
    for (const key of Reflect.ownKeys(base)) {
        const desc = Object.getOwnPropertyDescriptor(base, key);
        if (!desc) continue;
        try {
            if ("value" in desc && typeof desc.value === "function") {
                const fn = desc.value;
                Object.defineProperty(clone, key, {
                    configurable: true,
                    enumerable: !!desc.enumerable,
                    get: () => fn
                });
            } else {
                Object.defineProperty(clone, key, desc);
            }
        } catch { }
    }
    if (overlay) {
        for (const key of Object.keys(overlay)) {
            if (overlay[key] === undefined) continue;
            try {
                Object.defineProperty(clone, key, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: overlay[key]
                });
            } catch { }
        }
    }
    return clone;
}
