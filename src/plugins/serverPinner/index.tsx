/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { definePluginSettings, migratePluginSettings } from "@api/Settings";
import { Guild } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { t } from "@utils/i18n";
import definePlugin, { OptionType } from "@utils/types";
import { GuildStore, IconUtils, Menu, NavigationRouter, React, SelectedGuildStore, showToast, Toasts, Tooltip, useStateFromStores } from "@webpack/common";

const cl = classNameFactory("ec-pinned-");

const settings = definePluginSettings({
    pinnedServers: {
        type: OptionType.STRING,
        description: "List of pinned servers (JSON format)",
        default: "[]",
        hidden: true,
    },
});

function getPinned(): string[] {
    try {
        const list = JSON.parse(settings.store.pinnedServers);
        return Array.isArray(list) ? list.filter(id => typeof id === "string") : [];
    } catch {
        return [];
    }
}

function setPinned(ids: string[]) {
    settings.store.pinnedServers = JSON.stringify(ids);
}

function togglePin(guild: Guild) {
    const pinned = getPinned();
    if (pinned.includes(guild.id)) {
        setPinned(pinned.filter(id => id !== guild.id));
        showToast(t("Unpinned {server}", { server: guild.name }), Toasts.Type.SUCCESS);
    } else {
        setPinned([...pinned, guild.id]);
        showToast(t("Pinned {server} to the top of your server list", { server: guild.name }), Toasts.Type.SUCCESS);
    }
}

function PinnedServer({ guild, selected }: { guild: Guild; selected: boolean; }) {
    const icon = IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, size: 96, canAnimate: false });
    const initials = guild.name.split(/\s+/).map(w => w[0]).join("").slice(0, 3);
    return (
        <Tooltip text={guild.name} position="right">
            {props => (
                <div {...props} className={cl("item", selected && "selected")}>
                    <span className={cl("pill")} aria-hidden="true" />
                    <button
                        className={cl("icon")}
                        aria-label={guild.name}
                        onClick={() => NavigationRouter.transitionToGuild(guild.id)}
                    >
                        {icon ? <img src={icon} alt="" /> : <span className={cl("initials")}>{initials}</span>}
                    </button>
                </div>
            )}
        </Tooltip>
    );
}

function PinnedServers() {
    const { pinnedServers } = settings.use(["pinnedServers"]);
    const pinnedIds = React.useMemo(getPinned, [pinnedServers]);
    const selectedId = useStateFromStores([SelectedGuildStore], () => SelectedGuildStore.getGuildId());
    const guilds = useStateFromStores([GuildStore], () => pinnedIds.map(id => GuildStore.getGuild(id)).filter(Boolean) as Guild[], [pinnedIds]);
    if (!guilds.length) return null;

    return (
        <div className={cl("list")} aria-label={t("Pinned servers")}>
            {guilds.map(g => <PinnedServer key={g.id} guild={g} selected={g.id === selectedId} />)}
            <div className={cl("separator")} />
        </div>
    );
}

const GuildContext: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild) return;
    const group = findGroupChildrenByChildId("privacy", children) ?? children;
    group.push(
        <Menu.MenuItem
            id="ec-toggle-server-pin"
            label={getPinned().includes(guild.id) ? t("Unpin server") : t("Pin server to top")}
            action={() => togglePin(guild)}
        />
    );
};

migratePluginSettings("ServerPinner", "Server Pinner");
export default definePlugin({
    name: "ServerPinner",
    description: "Pin servers to the top of your server list from their right-click menu, without changing your folders.",
    tags: ["Servers", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    dependencies: ["ContextMenuAPI", "ServerListAPI"],
    settings,

    contextMenus: {
        "guild-context": GuildContext,
    },

    start() {
        addServerListElement(ServerListRenderPosition.Above, PinnedServers);
    },

    stop() {
        removeServerListElement(ServerListRenderPosition.Above, PinnedServers);
    },
});
