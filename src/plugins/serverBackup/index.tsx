/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import definePlugin from "@utils/types";
import type { Guild } from "@vencord/discord-types";
import { Menu } from "@webpack/common";

import { openExportModal } from "./components/ExportModal";
import { openRestoreModal } from "./components/RestoreModal";
import { settings } from "./settings";

const Patch: NavContextMenuPatchCallback = (children, props?: { guild?: Guild; }) => {
    const guild = props?.guild;
    if (!guild) return;

    const group = findGroupChildrenByChildId("privacy", children);
    if (!group) return;

    group.push(
        <Menu.MenuItem
            id="server-backup-export"
            label={t("Export Server Backup")}
            action={() => openExportModal(guild)}
        />,
        <Menu.MenuItem
            id="server-backup-restore"
            label={t("Restore Server Backup")}
            action={() => openRestoreModal(guild)}
        />
    );
};

export default definePlugin({
    name: "ServerBackup",
    description: "Export a server's channels, roles and permissions to a backup file, and restore it to another server.",
    tags: ["Servers", "Utility"],
    authors: [Devs.vpg],
    settings,
    contextMenus: {
        "guild-context": Patch,
        "guild-header-popout": Patch
    }
});
