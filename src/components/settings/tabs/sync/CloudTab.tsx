/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useSettings } from "@api/Settings";
import { authorizeCloud, deauthorizeCloud } from "@api/SettingsSync/cloudSetup";
import { deleteCloudSettings, eraseAllCloudData, getCloudSettings, getCloudSyncDirection, putCloudSettings, setCloudSyncDirection } from "@api/SettingsSync/cloudSync";
import { isSecureCloudUrl } from "@api/SettingsSync/cloudUrl";
import { BaseText } from "@components/BaseText";
import { Button, ButtonProps } from "@components/Button";
import { CheckedTextInput } from "@components/CheckedTextInput";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { CloudDownloadIcon, CloudUploadIcon, DeleteIcon, RestartIcon } from "@components/Icons";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { t } from "@utils/i18n";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { IconComponent } from "@utils/types";
import { ConfirmModal,openModal, Select, Tooltip, useState } from "@webpack/common";
function validateUrl(url: string) {
    return isSecureCloudUrl(url) || t("The address has to start with https://");
}

const SectionHeading = ({ text }: { text: string; }) => (
    <BaseText
        tag="h5"
        size="lg"
        weight="semibold"
        className={Margins.bottom16}
    >
        {text}
    </BaseText>
);

function ButtonWithIcon({ children, Icon, className, ...buttonProps }: ButtonProps & { Icon: IconComponent; }) {
    return (
        <Button {...buttonProps} className={classes("vc-cloud-icon-with-button", className)}>
            <Icon className={"vc-cloud-button-icon"} />
            {children}
        </Button>
    );
}

function CloudSetupSection() {
    const { cloud } = useSettings(["cloud.authenticated", "cloud.url"]);

    return (
        <section>
            <SectionHeading text={t("Cloud Integrations")} />

            <Paragraph size="md" className={Margins.bottom20}>
                {t("Endcord comes with a cloud integration that adds goodies like settings sync across devices. It")}{" "}<Link href="https://endcord.com/cloud/privacy">{t("respects your privacy")}</Link>{t(", and the")}{" "}<Link href="https://github.com/Endcord/Endcord">{t("source code")}</Link>{" "}{t("is AGPL 3.0 licensed so you can host it yourself.")}
            </Paragraph>
            <FormSwitch
                key="backend"
                title={t("Enable Cloud Integrations")}
                description={t("This will request authorization if you have not yet set up cloud integrations.")}
                value={cloud.authenticated}
                onChange={v => {
                    if (v)
                        authorizeCloud();
                    else
                        cloud.authenticated = v;
                }}
            />
            <Heading tag="h5" className={Margins.top16}>{t("Backend URL")}</Heading>
            <Paragraph className={Margins.bottom8}>
                {t("Which backend to use when using cloud integrations.")}
            </Paragraph>
            <CheckedTextInput
                key="backendUrl"
                initialValue={cloud.url}
                onChange={async v => {
                    cloud.url = v;
                    cloud.authenticated = false;
                    deauthorizeCloud();
                }}
                validate={validateUrl}
            />

            <Flex gap="0.5em" className={Margins.top8}>
                <ButtonWithIcon
                    variant="secondary"
                    disabled={!cloud.authenticated}
                    onClick={async () => {
                        await deauthorizeCloud();
                        cloud.authenticated = false;
                        await authorizeCloud();
                    }}
                    Icon={RestartIcon}
                >
                    {t("Reauthorise")}
                </ButtonWithIcon>
            </Flex>
        </section>
    );
}

function SettingsSyncSection() {
    const { cloud } = useSettings(["cloud.authenticated", "cloud.settingsSync"]);
    const [syncDirection, setSyncDirection] = useState(getCloudSyncDirection);
    const sectionEnabled = cloud.authenticated && cloud.settingsSync;

    return (
        <section>
            <SectionHeading text={t("Settings Sync")} />
            <Flex flexDirection="column" gap="1em">
                <FormSwitch
                    key="cloud-sync"
                    title={t("Enable Settings Sync")}
                    description={t("Save your Endcord settings to the cloud so you can easily keep them the same on all your devices")}
                    value={cloud.settingsSync}
                    onChange={v => { cloud.settingsSync = v; }}
                    disabled={!cloud.authenticated}
                    hideBorder
                />

                <div>
                    <Heading tag="h5">
                        {t("Sync Rules for This Device")}
                    </Heading>
                    <Paragraph className={Margins.bottom8}>
                        {t("This setting controls how settings move between")}{" "}<strong>{t("this device")}</strong>{" "}{t("and the cloud. You can let changes flow both ways, or choose one place to be the main source of truth.")}
                    </Paragraph>
                    <Select
                        options={[
                            {
                                label: t("Two-way sync (changes go both directions)"),
                                value: "both",
                                default: true,
                            },
                            {
                                label: t("This device is the source (upload only)"),
                                value: "push",
                            },
                            {
                                label: t("The cloud is the source (download only)"),
                                value: "pull",
                            },
                            {
                                label: t("Do not sync automatically (manual sync via buttons below only)"),
                                value: "manual",
                            }
                        ]}
                        isSelected={v => v === syncDirection}
                        serialize={v => String(v)}
                        select={v => {
                            setCloudSyncDirection(v);
                            setSyncDirection(v);
                        }}
                        closeOnSelect={true}
                    />
                </div>

                <Flex gap="0.5em">
                    <ButtonWithIcon
                        variant="secondary"
                        disabled={!sectionEnabled}
                        onClick={() => putCloudSettings(true)}
                        Icon={CloudUploadIcon}
                    >
                        {t("Upload Settings")}
                    </ButtonWithIcon>
                    <Tooltip text={t("This will replace your current settings with the ones saved in the cloud. Be careful!")}>
                        {({ onMouseLeave, onMouseEnter }) => (
                            <ButtonWithIcon
                                variant="dangerSecondary"
                                onMouseLeave={onMouseLeave}
                                onMouseEnter={onMouseEnter}
                                disabled={!sectionEnabled}
                                onClick={() => getCloudSettings(true, true)}
                                Icon={CloudDownloadIcon}
                            >
                                {t("Download Settings")}
                            </ButtonWithIcon>
                        )}
                    </Tooltip>
                </Flex>
            </Flex>
        </section>
    );
}

function ResetSection() {
    const { authenticated, settingsSync } = useSettings(["cloud.authenticated", "cloud.settingsSync"]).cloud;

    return (
        <section>
            <SectionHeading text={t("Reset Cloud Data")} />

            <Flex gap="0.5em">
                <ButtonWithIcon
                    variant="dangerSecondary"
                    disabled={!authenticated || !settingsSync}
                    onClick={() => deleteCloudSettings()}
                    Icon={DeleteIcon}
                >
                    {t("Delete Settings from Cloud")}
                </ButtonWithIcon>
                <ButtonWithIcon
                    variant="dangerPrimary"
                    disabled={!authenticated}
                    onClick={() => openModal(props => (
                        <ConfirmModal
                            {...props}
                            title={t("Are you sure?")}
                            subtitle={t("Once your data is erased, we cannot recover it. There's no going back!")}
                            onConfirm={eraseAllCloudData}
                            confirmText={t("Erase")}
                            cancelText={t("Nevermind")}
                        />
                    ))}
                    Icon={DeleteIcon}
                >
                    {t("Delete your Cloud Account")}
                </ButtonWithIcon>
            </Flex>
        </section>
    );
}

function CloudTab() {
    return (
        <SettingsTab>
            <Flex flexDirection="column" gap="1em">
                <CloudSetupSection />
                <Divider />
                <SettingsSyncSection />
                <Divider />
                <ResetSection />
            </Flex>
        </SettingsTab>
    );
}

export default wrapTab(CloudTab, "Cloud");

