/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
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
            replacement: {
                // The sidebar no longer gets isRedesignEnabled; its only layout is the redesigned cards column
                match: /user:\i,widgets:.{0,100}?\}\),(?=.{0,100}user:\i,currentUser:\i)/,
                replace: "$&Endcord.Api.ProfileCollections.renderProfileCollections({...arguments[0],isSideBar:true,isRedesignEnabled:true}),"
            }
        }
    ]
});
