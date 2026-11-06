/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { downloadSettingsBackup, uploadSettingsBackup } from "@api/SettingsSync/offline";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { useI18n } from "@utils/i18n";
import { Margins } from "@utils/margins";
import { Text } from "@webpack/common";

import { SnapshotsSection } from "./Snapshots";

function BackupAndRestoreTab() {
    const { t } = useI18n();
    return (
        <SettingsTab>
            <Flex flexDirection="column" gap="0.5em">
                <Text variant="text-md/normal" className={Margins.bottom8}>
                    {t("You can import and export your Endcord settings as a JSON file. This allows you to easily transfer your settings to another device, or recover your settings after reinstalling Endcord or Discord.")}
                </Text>

                <Heading tag="h4">{t("Settings Export contains:")}</Heading>
                <Text variant="text-md/normal" className={Margins.bottom8}>
                    <ul style={{ listStyle: "square", paddingLeft: "1.25em" }}>
                        <li>{t("Custom QuickCSS")}</li>
                        <li>{t("Theme Links")}</li>
                        <li>{t("Plugin Settings")}</li>
                    </ul>
                </Text>

                <Flex gap="0.5em">
                    <Button onClick={downloadSettingsBackup}>
                        {t("Export Settings")}
                    </Button>
                    <Button variant="secondary" onClick={() => uploadSettingsBackup()}>
                        {t("Import Settings")}
                    </Button>
                </Flex>
                <Paragraph style={{ color: "var(--text-muted)" }}>{t("Importing a settings file will overwrite your current settings.")}</Paragraph>
            </Flex>

            <SnapshotsSection />
        </SettingsTab >
    );
}

export default wrapTab(BackupAndRestoreTab, "Backup & Restore");
