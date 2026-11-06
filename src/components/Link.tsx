/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isSafeLink } from "@shared/externalLinks";
import { React } from "@webpack/common";

interface Props extends React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement> {
    disabled?: boolean;
}

export function Link(props: React.PropsWithChildren<Props>) {
    if (props.disabled) {
        props.style ??= {};
        props.style.pointerEvents = "none";
        props["aria-disabled"] = true;
    }

    props.rel ??= "noreferrer";
    if (!isSafeLink(props.href)) props.href = undefined;

    return (
        <a role="link" target="_blank" {...props}>
            {props.children}
        </a>
    );
}
