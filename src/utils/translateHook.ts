/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Translation for modules that @utils/i18n depends on indirectly, like ErrorBoundary: importing i18n there
 * creates an import cycle that leaves them undefined at startup. @utils/i18n fills `translate` in once it loads.
 */
export const translateHook = {
    translate: (text: string, _vars?: Record<string, string | number>) => text
};
