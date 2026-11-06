/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { getIsEndcordHidden, onHiddenChange } from "@api/EndcordVisibility";
import { definePluginSettings } from "@api/Settings";
import { EndcordMark } from "@components/EndcordIcons";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { ContextMenuApi, Popout, useEffect, useRef, useState } from "@webpack/common";
import type { MouseEvent, PropsWithChildren } from "react";

import { ControlCenter } from "./ControlCenter";
import { getAvailableUpdate, openUpdater, startUpdateChecker, stopUpdateChecker, ToolboxMenu } from "./menu";

const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"');

export const settings = definePluginSettings({
    showPluginMenu: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Show the plugins menu in the toolbox",
    }
});

function EndcordPopoutButton() {
    const buttonRef = useRef(null);
    const [show, setShow] = useState(false);
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        return onHiddenChange(() => forceUpdate(n => n + 1));
    }, []);

    if (getIsEndcordHidden()) return null;

    const openFullMenu = (event: MouseEvent) => {
        setShow(false);
        ContextMenuApi.openContextMenu(event, () => <ToolboxMenu onClose={ContextMenuApi.closeContextMenu} />);
    };

    return (
        <Popout
            position="bottom"
            align="right"
            animation={Popout.Animation.NONE}
            shouldShow={show}
            onRequestClose={() => setShow(false)}
            targetElementRef={buttonRef}
            renderPopout={() => (
                <ErrorBoundary noop>
                    <ControlCenter
                        onClose={() => setShow(false)}
                        onMoreActions={openFullMenu}
                        availableUpdate={getAvailableUpdate()}
                        onUpdate={() => {
                            setShow(false);
                            openUpdater();
                        }}
                    />
                </ErrorBoundary>
            )}
        >
            {(_, { isShown }) => (
                <HeaderBarIcon
                    ref={buttonRef}
                    className="vc-toolbox-btn"
                    onClick={() => setShow(v => !v)}
                    onContextMenu={openFullMenu}
                    tooltip={isShown ? null : "Endcord"}
                    icon={() => <EndcordMark className="vc-toolbox-icon" asleep={!isShown} />}
                    selected={isShown}
                />
            )}
        </Popout>
    );
}

export default definePlugin({
    name: "EndcordToolbox",
    description: "Adds the Endcord Control Center to the title bar",
    tags: ["Utility", "Developers"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    enabledByDefault: true,

    settings,

    ControlCenter,

    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(trailing:.{0,50}?)\i\.Fragment,(?=\{children:\[)/,
                replace: "$1$self.TrailingWrapper,"
            }
        }
    ],

    TrailingWrapper({ children }: PropsWithChildren) {
        return (
            <>
                {children}
                <ErrorBoundary key="vc-toolbox" noop>
                    <EndcordPopoutButton />
                </ErrorBoundary>
            </>
        );
    },

    start() {
        startUpdateChecker();
    },

    stop() {
        stopUpdateChecker();
    },
});
