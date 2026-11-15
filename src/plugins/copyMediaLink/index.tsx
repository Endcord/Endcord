/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { LinkIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";

// Discord reuses one menu for both media and plain links, so pick whichever URL
// this invocation is actually about. The prop names come from the same menu.
const imageContextMenuPatch: NavContextMenuPatchCallback = (children, props: { src?: string; href?: string; itemSrc?: string; itemHref?: string; }) => {
    const media = props?.src ?? props?.itemSrc;
    const url = media ?? props?.href ?? props?.itemHref;
    if (!url) return;

    // Not "copy-link": that's the message menu's copy group, and the image menu only has it with Developer Mode on,
    // where the item renders but its action never runs. "copy-native-link" is the group the image menu really has,
    // and what the other image context menu patches use.
    const group = findGroupChildrenByChildId("copy-native-link", children)
        ?? findGroupChildrenByChildId("open-native-link", children)
        ?? children;

    group.push(
        <Menu.MenuItem
            id="vc-copy-media-link"
            label={media ? "Copy Media Link" : "Copy Link"}
            leadingAccessory={{ type: "icon", icon: LinkIcon }}
            action={() => copyWithToast(url, media ? "Media link copied!" : "Link copied!")}
        />
    );
};

export default definePlugin({
    name: "CopyMediaLink",
    description: "Adds working Copy Media Link and Copy Link actions to the image context menu, copying through the clipboard fallback chain instead of Discord's own handler.",
    tags: ["Media", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],

    contextMenus: {
        "image-context": imageContextMenuPatch
    }
});
