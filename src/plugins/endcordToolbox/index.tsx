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

// Same as the closing animation (--ec-motion-fast)
const CLOSE_TIME = 140;
const lessMotion = () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    // Stays mounted briefly after closing so the exit animation can play
    const [closing, setClosing] = useState(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const stopWatching = onHiddenChange(() => forceUpdate(n => n + 1));
        return () => {
            stopWatching();
            clearTimeout(closeTimer.current);
        };
    }, []);

    if (getIsEndcordHidden()) return null;

    const open = () => {
        clearTimeout(closeTimer.current);
        setClosing(false);
        setShow(true);
    };

    const close = (now = false) => {
        clearTimeout(closeTimer.current);
        if (now || lessMotion()) {
            setClosing(false);
            setShow(false);
            return;
        }

        setClosing(true);
        closeTimer.current = setTimeout(() => {
            setClosing(false);
            setShow(false);
        }, CLOSE_TIME);
    };

    const openFullMenu = (event: MouseEvent) => {
        close(true);
        ContextMenuApi.openContextMenu(event, () => <ToolboxMenu onClose={ContextMenuApi.closeContextMenu} />);
    };

    return (
        <Popout
            position="bottom"
            align="right"
            animation={Popout.Animation.NONE}
            shouldShow={show}
            onRequestClose={() => close()}
            targetElementRef={buttonRef}
            renderPopout={() => (
                <ErrorBoundary noop>
                    <ControlCenter
                        closing={closing}
                        onClose={() => close()}
                        onMoreActions={openFullMenu}
                        availableUpdate={getAvailableUpdate()}
                        onUpdate={() => {
                            close();
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
                    onClick={() => show && !closing ? close() : open()}
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
