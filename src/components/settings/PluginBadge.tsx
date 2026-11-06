/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function AddonBadge({ text, tone, title }: { text: string; tone?: "popular" | "fix" | "risk"; title?: string; }) {
    return <div className={tone ? `vc-addon-badge vc-addon-badge-${tone}` : "vc-addon-badge"} title={title}>{text}</div>;
}
