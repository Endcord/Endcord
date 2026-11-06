/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css?screen";

import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { useI18n } from "@utils/i18n";
import { getStylusWebStoreUrl } from "@utils/web";
import { Forms, React, TabBar, useState } from "@webpack/common";

import { CspErrorCard } from "./CspErrorCard";
import { LocalThemesTab } from "./LocalThemesTab";
import { OnlineThemesTab } from "./OnlineThemesTab";

const enum ThemeTab {
    LOCAL,
    ONLINE
}

function ThemesTab() {
    const { t } = useI18n();
    const [currentTab, setCurrentTab] = useState(ThemeTab.LOCAL);

    return (
        <SettingsTab>
            <TabBar
                type="top"
                look="brand"
                className="vc-settings-tab-bar"
                selectedItem={currentTab}
                onItemSelect={setCurrentTab}
            >
                <TabBar.Item
                    className="vc-settings-tab-bar-item"
                    id={ThemeTab.LOCAL}
                >
                    {t("Local Themes")}
                </TabBar.Item>
                <TabBar.Item
                    className="vc-settings-tab-bar-item"
                    id={ThemeTab.ONLINE}
                >
                    {t("Online Themes")}
                </TabBar.Item>
            </TabBar>

            <Flex flexDirection="column" gap="1em">
                <CspErrorCard />

                {currentTab === ThemeTab.LOCAL && <LocalThemesTab />}
                {currentTab === ThemeTab.ONLINE && <OnlineThemesTab />}

                <Paragraph className="ec-themes-note">
                    {t("If Discord feels slow, try turning your themes and custom CSS off. The :has() selector is the most common cause.")}
                </Paragraph>
            </Flex>
        </SettingsTab>
    );
}

function UserscriptThemesTab() {
    const { t } = useI18n();
    return (
        <SettingsTab>
            <Card variant="danger">
                <Forms.FormTitle tag="h5">{t("Themes are not supported in the userscript.")}</Forms.FormTitle>

                <Forms.FormText>
                    {t("You can instead install themes with the")} <Link href={getStylusWebStoreUrl()}>{t("Stylus extension")}</Link>!
                </Forms.FormText>
            </Card>
        </SettingsTab>
    );
}

export default IS_USERSCRIPT
    ? wrapTab(UserscriptThemesTab, "Themes")
    : wrapTab(ThemesTab, "Themes");
