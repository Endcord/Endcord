/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "ProfileCollectionsAPI",
    description: "API to add collections to the user profile panel like discords game collection.",
    authors: [Devs.Ven],
    patches: [
        // message and member list popouts
        {
            find: '"UserProfilePopout");',
            replacement: {
                match: /user:\i,widgets:.{0,100}?\}\),/,
                replace: "$&Endcord.Api.ProfileCollections.renderProfileCollections(arguments[0]),",
            }
        },
        // user panel popout
        {
            find: '"UserProfileAccountPopout"',
            replacement: {
                match: /user:\i,widgets:.{0,100}}\),/,
                replace: "$&Endcord.Api.ProfileCollections.renderProfileCollections(arguments[0]),",
            },
        },
        // dm sidebar
        {
            find: ".SIDEBAR,disableToolbar:",
            replacement: [
                {
                    match: /user:\i,widgets:.{0,100}?\}\),(?=.{0,100}user:\i,currentUser:\i)/,
                    replace: "$&arguments[0]?.isRedesignEnabled&&Endcord.Api.ProfileCollections.renderProfileCollections({...arguments[0],isSideBar:true}),"
                },
                {
                    match: /user:\i,widgets:.{0,100}?\}\),(?=.{0,100}unownedWishlistItems:\i,wishlistId:\i)/,
                    replace: "$&!arguments[0]?.isRedesignEnabled&&Endcord.Api.ProfileCollections.renderProfileCollections({...arguments[0],isSideBar:true}),"
                }
            ]
        }
    ]
});
