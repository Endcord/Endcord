/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { enableScreenStyles } from "@api/Styles";
import { ENDCORD_THEME } from "@utils/css";
import { Modal, useLayoutEffect, useRef } from "@webpack/common";
import type { ComponentProps } from "react";

/** Discord's Modal in Endcord's colors. It takes no class of its own, so the theme goes on the dialog it renders */
export function EndcordModal({ children, ...props }: ComponentProps<typeof Modal>) {
    enableScreenStyles();
    const marker = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        marker.current?.closest('[role="dialog"]')?.classList.add(...ENDCORD_THEME.split(" "));
    }, []);

    return (
        <Modal {...props}>
            <div ref={marker} hidden />
            {children}
        </Modal>
    );
}
