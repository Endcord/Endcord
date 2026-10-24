/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./SpecialCard.css";

import { classNameFactory } from "@utils/css";
import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

const cl = classNameFactory("ec-card-");

export type SpecialCardAccent = "ice" | "bamboo" | "honey";

interface SpecialCardProps {
    title: string;
    subtitle?: string;
    description: string;
    /** Artwork shown on the right, usually a <PixelArt /> */
    art?: ReactNode;
    accent?: SpecialCardAccent;
    /** Buttons shown under the text */
    actions?: ReactNode;
}

export function SpecialCard({ title, subtitle, description, art, accent = "ice", actions, children }: PropsWithChildren<SpecialCardProps>) {
    return (
        <section className={cl("root", `accent-${accent}`)}>
            <div className={cl("body")}>
                <div className={cl("text")}>
                    <h2 className={cl("title")}>{title}</h2>
                    {subtitle && <p className={cl("subtitle")}>{subtitle}</p>}
                    <p className={cl("description")}>{description}</p>
                    {children}
                    {actions && <div className={cl("actions")}>{actions}</div>}
                </div>
                {art && <div className={cl("art")} aria-hidden="true">{art}</div>}
            </div>
        </section>
    );
}

/**
 * Crisp pixel art drawn from rows of characters, matching the pixel style of the Endcord logo.
 * Every character maps to a colour in `palette`; "." is transparent.
 */
export function PixelArt({ rows, palette, pixel = 5, style }: { rows: string[]; palette: Record<string, string>; pixel?: number; style?: CSSProperties; }) {
    const width = Math.max(...rows.map(r => r.length));
    const rects: ReactNode[] = [];
    rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            const fill = palette[row[x]];
            if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
        }
    });
    return (
        <svg
            className={cl("pixel-art")}
            width={width * pixel}
            height={rows.length * pixel}
            viewBox={`0 0 ${width} ${rows.length}`}
            shapeRendering="crispEdges"
            style={style}
        >
            {rects}
        </svg>
    );
}

// The sleeping panda from the Endcord logo
export const PANDA_ROWS = [
    "..kkk.......kkk..",
    ".kKKKk.....kKKKk.",
    ".KKKKKWWWWWKKKKK.",
    "..KKKWWWWWWWKKK..",
    "..WWWWWWWWWWWWW..",
    ".WWWWWWWWWWWWWWw.",
    ".WWKKKWWWWWKKKWw.",
    "WWKKEKKWWWKKEKKWw",
    "WWKKKKKWWWKKKKKWw",
    "WWWKKKWWWWWKKKWWw",
    "WWPPWWWKKKWWWPPWw",
    "WWPPWWWWKWWWWPPWw",
    ".WWWWWWKWKWWWWWw.",
    "..WWWWWWWWWWWWw..",
    "...wWWWWWWWWWw...",
    ".....wwwwwww.....",
];
// The fur is a shade lighter than the card and the ears have a rim light, so the silhouette reads on dark blue
export const PANDA_PALETTE = { K: "#232C40", k: "#4A5A80", W: "#F3F6FB", w: "#C9D3E4", E: "#FFFFFF", P: "#F4A6B8" };

export const HEART_ROWS = [
    ".HH...HH.",
    "HLHH.HHHH",
    "HLHHHHHHH",
    "HHHHHHHHH",
    ".HHHHHHH.",
    "..HHHHH..",
    "...HHH...",
    "....H....",
];
export const HEART_PALETTE = { H: "#F0776B", L: "#F8B4AC" };
