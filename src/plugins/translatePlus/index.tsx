/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import definePlugin from "@utils/types";
import { ChannelStore, Menu } from "@webpack/common";

import { settings } from "./settings";
import { Accessory, handleTranslate } from "./utils/accessory";
import { Icon } from "./utils/icon";

const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }) => {
    if (!message.content) return;

    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;

    group.splice(group.findIndex(c => c?.props?.id === "copy-text") + 1, 0, (
        <Menu.MenuItem
            id="ec-trans"
            label={t("Translate")}
            icon={Icon}
            action={() => handleTranslate(message)}
        />
    ));
};

export default definePlugin({
    name: "Translate+",
    description: "Endcord's translate plugin but with support for artistic languages!",
    dependencies: ["MessageAccessoriesAPI", "MessagePopoverAPI"],
    tags: ["Chat", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    settings,
    contextMenus: {
        "message": messageCtxPatch
    },
    renderMessageAccessory: props => <Accessory message={props.message} />,
    messagePopoverButton: {
        icon: Icon,
        render(message) {
            if (!message.content) return null;
            return {
                label: "Translate",
                icon: Icon,
                message: message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: () => handleTranslate(message),
            };
        }
    }
});
