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

    // "copy-link" must not be targeted here. It is the message menu's copy group
    // (reverseImageSearch uses it for "message-context") and it is only present in the
    // image menu at all when Developer Mode is on. That is the one case where it resolves:
    // the item then lands inside Discord's own dev-mode copy group, where it renders but its
    // action is never invoked, so the click did nothing. The item showed up either way,
    // which is what made it look like a clipboard problem - copyWithToast always toasts, so
    // no toast at all means the handler never ran. "copy-native-link" is the group the image
    // menu actually has, and what every other image-context patch targets.
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
