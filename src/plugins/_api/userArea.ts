/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findCssClassesLazy } from "@webpack";

const accountClasses = findCssClassesLazy("iconForeground", "accountPopoutButtonWrapper");

export default definePlugin({
    name: "UserAreaAPI",
    description: "API to add buttons to the user area panel.",
    authors: [Devs.Ven],

    patches: [
        {
            find: "#{intl::USER_PROFILE_ACCOUNT_POPOUT_BUTTON_A11Y_LABEL}",
            replacement: [
                {
                    // The optional call allows GameActivityToggle, which inserts its button at the same spot
                    match: /children:\[(?=(?:[^,]{0,120}\(arguments\[0\]\),)?.{0,50}accountContainerRef:\i)/,
                    replace: "children:[...$self.renderButtons(arguments[0]),"
                },
                // fix discord weird shrink with extra buttons
                {
                    match: /(?<=\{ref:\i,)style:(\i)/,
                    replace: "style:{...$1,minWidth:0}"
                }
            ]
        }
    ],

    renderButtons(props: { nameplate?: any; }) {
        return Endcord.Api.UserArea._renderButtons({
            nameplate: !this.shouldHideNameplate() ? props.nameplate : null,
            iconForeground: accountClasses.iconForeground,
            hideTooltips: this.shouldHideTooltips()
        });
    },

    shouldHideTooltips() {
        return false;
    },

    shouldHideNameplate() {
        return false;
    }
});
