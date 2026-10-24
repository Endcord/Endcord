/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { Margins } from "@components/margins";
import { Paragraph } from "@components/Paragraph";
import { IS_WINDOWS } from "@utils/constants";
import { useI18n } from "@utils/i18n";
import { Select } from "@webpack/common";

export function WindowsMaterialSettings() {
    const { t } = useI18n();
    const settings = useSettings(["windowsMaterial"]);

    if (!IS_WINDOWS || IS_WEB || !EndcordNative.native.supportsWindowsMaterial()) return null;

    return (
        <ErrorBoundary noop>
            <Heading tag="h5">{t("Background Material")}</Heading>
            <Paragraph className={Margins.bottom8}>
                {t("Windows transparent background effects. You need a theme that supports transparency or this will do nothing. A restart is required after changing this setting.")}
            </Paragraph>

            <Select
                placeholder={t("None")}
                options={[
                    {
                        label: t("None"),
                        value: "none",
                        default: true
                    },
                    {
                        label: t("Mica (incorporates system theme + desktop wallpaper to paint the background)"),
                        value: "mica"
                    },
                    {
                        label: t("Tabbed (variant of Mica with stronger background tinting)"),
                        value: "tabbed"
                    },
                    {
                        label: t("Acrylic (blurs the window behind Vesktop for a translucent background)"),
                        value: "acrylic"
                    }
                ]}
                closeOnSelect={true}
                select={v => (settings.windowsMaterial = v)}
                isSelected={v => v === settings.windowsMaterial}
                serialize={s => s}
            />
        </ErrorBoundary>
    );
}
