/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./AddonCard.css?screen";

import { enableScreenStyles } from "@api/Styles";
import { AddonBadge } from "@components/settings/PluginBadge";
import { Switch } from "@components/Switch";
import { BAN_RISK_LEAD } from "@utils/banRisk";
import { classNameFactory } from "@utils/css";
import { useI18n } from "@utils/i18n";
import { Text, useRef } from "@webpack/common";
import type { MouseEventHandler, ReactNode } from "react";

const cl = classNameFactory("vc-addon-");

interface Props {
    name: ReactNode;
    description: ReactNode;
    enabled: boolean;
    setEnabled: (enabled: boolean) => void;
    disabled?: boolean;
    isNew?: boolean;
    isPopular?: boolean;
    /** Why Discord could suspend an account for using it */
    banRisk?: string;
    needsFix?: boolean;
    onMouseEnter?: MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: MouseEventHandler<HTMLDivElement>;

    infoButton?: ReactNode;
    footer?: ReactNode;
    author?: ReactNode;
}

export function AddonCard({ disabled, isNew, isPopular, banRisk, needsFix, name, infoButton, footer, author, enabled, setEnabled, description, onMouseEnter, onMouseLeave }: Props) {
    // Also shown outside the settings, in the new plugins dialog
    enableScreenStyles();
    const { t } = useI18n();
    const titleRef = useRef<HTMLDivElement>(null);
    const titleContainerRef = useRef<HTMLDivElement>(null);

    return (
        <div
            className={cl("card", { "card-disabled": disabled })}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className={cl("header")}>
                <div className={cl("name-author")}>
                    <Text variant="text-md/bold" className={cl("name")}>
                        <div ref={titleContainerRef} className={cl("title-container")}>
                            <div
                                ref={titleRef}
                                className={cl("title")}
                                onMouseOver={() => {
                                    const title = titleRef.current!;
                                    const titleContainer = titleContainerRef.current!;

                                    title.style.setProperty("--offset", `${titleContainer.clientWidth - title.scrollWidth}px`);
                                    title.style.setProperty("--duration", `${Math.max(0.5, (title.scrollWidth - titleContainer.clientWidth) / 7)}s`);
                                }}
                            >
                                {name}
                            </div>
                        </div>
                        {needsFix && <AddonBadge text={t("NEEDS FIX")} tone="fix" title={t("Discord changed code this plugin relies on, so part of it may not work until Endcord updates it")} />}
                        {banRisk && <AddonBadge text={t("BAN RISK")} tone="risk" title={`${t(BAN_RISK_LEAD)} ${t(banRisk)}`} />}
                        {isPopular && !needsFix && !banRisk && <AddonBadge text={t("POPULAR")} tone="popular" />}
                        {isNew && <AddonBadge text={t("NEW")} />}
                    </Text>

                    {!!author && (
                        <Text variant="text-md/normal" className={cl("author")}>
                            {author}
                        </Text>
                    )}
                </div>

                {infoButton}

                <Switch
                    checked={enabled}
                    onChange={setEnabled}
                    disabled={disabled}
                />
            </div>

            <Text className={cl("note")} variant="text-sm/normal">{description}</Text>

            {footer}
        </div>
    );
}
