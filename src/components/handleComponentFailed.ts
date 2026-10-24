/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@utils/i18n";
import { maybePromptToUpdate } from "@utils/updater";

export function handleComponentFailed() {
    maybePromptToUpdate(t("This page tripped over itself (｡•́︿•̀｡) A fresh Endcord update might fix it. Want to update and restart now?"));
}
