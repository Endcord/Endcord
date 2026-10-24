/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { downloadSettingsBackup, uploadSettingsBackup } from "@api/SettingsSync/offline";
import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { useI18n } from "@utils/i18n";
import { Margins } from "@utils/margins";
import { Button, Text } from "@webpack/common";

function BackupAndRestoreTab() {
    const { t } = useI18n();
    return (
        <SettingsTab>
            <Flex flexDirection="column" gap="0.5em">
                <Card variant="warning">
                    <Heading tag="h4">{t("Warning")}</Heading>
                    <Paragraph>{t("Importing a settings file will overwrite your current settings.")}</Paragraph>
                </Card>

                <Text variant="text-md/normal" className={Margins.bottom8}>
                    {t("You can import and export your Endcord settings as a JSON file. This allows you to easily transfer your settings to another device, or recover your settings after reinstalling Endcord or Discord.")}
                </Text>

                <Heading tag="h4">{t("Settings Export contains:")}</Heading>
                <Text variant="text-md/normal" className={Margins.bottom8}>
                    <ul>
                        <li>&mdash; {t("Custom QuickCSS")}</li>
                        <li>&mdash; {t("Theme Links")}</li>
                        <li>&mdash; {t("Plugin Settings")}</li>
                    </ul>
                </Text>

                <Flex>
                    <Button onClick={() => uploadSettingsBackup()}>
                        {t("Import Settings")}
                    </Button>
                    <Button onClick={downloadSettingsBackup}>
                        {t("Export Settings")}
                    </Button>
                </Flex>
            </Flex>
        </SettingsTab >
    );
}

export default wrapTab(BackupAndRestoreTab, "Backup & Restore");
