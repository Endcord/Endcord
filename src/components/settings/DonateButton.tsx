/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Heart } from "@components/Heart";
import { ButtonProps } from "@endcord/discord-types";
import { t } from "@utils/i18n";
import { Button } from "@webpack/common";
export default function DonateButton({
    look = Button.Looks.LINK,
    color = Button.Colors.TRANSPARENT,
    ...props
}: Partial<ButtonProps>) {
    return (
        <Button
            {...props}
            look={look}
            color={color}
            onClick={() => EndcordNative.native.openExternal("https://github.com/rootpoii/Endcord")}
            className="vc-donate-button"
        >
            <Heart />
            {t("Donate")}
        </Button>
    );
}
