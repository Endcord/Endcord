/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./LookPreview.css?screen";

import { classNameFactory } from "@utils/css";

import { DISCORD_ACCENT, DISCORD_BACKGROUND, ThemeDesign } from "./design";

const cl = classNameFactory("ec-look-");

/** A tiny Discord window in a look's own colors, so people can see what they're picking before they pick it */
export function LookPreview({ design }: { design: ThemeDesign; }) {
    const background = design.background || DISCORD_BACKGROUND;
    const accent = design.accent || DISCORD_ACCENT;

    return (
        <span className={cl("window")} style={{ background, borderRadius: 6 * Math.min(design.radius, 1.2) }}>
            <span className={cl("rail")}>
                <span className={cl("server")} style={{ background: accent }} />
                <span className={cl("server")} />
            </span>
            <span className={cl("channels")} />
            <span className={cl("chat")}>
                <span className={cl("line")} />
                <span className={cl("line", "short")} />
                <span className={cl("button")} style={{ background: accent }} />
            </span>
        </span>
    );
}
