/*
 * Endcord, a Discord client mod
 * Copyright (c) 2022 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { Link } from "@components/Link";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openWhatsNewModal } from "@components/whatsNew";
import { useI18n } from "@utils/i18n";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { useAwaiter } from "@utils/react";
import { getRepo, isNewer, UpdateLogger } from "@utils/updater";
import { Forms, React } from "@webpack/common";

import gitHash from "~git-hash";

import { CommonProps, HashLink, Newer, Updatable } from "./Components";

function Updater() {
    const { t } = useI18n();
    const settings = useSettings(["autoUpdate", "autoUpdateNotification"]);

    const [repo, err, repoPending] = useAwaiter(getRepo, {
        fallbackValue: t("Loading..."),
        onError: e => UpdateLogger.error("Failed to retrieve repo", err)
    });

    const commonProps: CommonProps = {
        repo,
        repoPending
    };

    return (
        <SettingsTab>
            <FormSwitch
                title={t("Automatically update")}
                description={t("Automatically update Endcord without confirmation prompt")}
                value={settings.autoUpdate}
                onChange={(v: boolean) => settings.autoUpdate = v}
            />
            <FormSwitch
                title={t("Get notified when an automatic update completes")}
                description={t("Show a notification when Endcord automatically updates")}
                value={settings.autoUpdateNotification}
                onChange={(v: boolean) => settings.autoUpdateNotification = v}
                disabled={!settings.autoUpdate}
            />

            <Forms.FormTitle tag="h5" className={Margins.top20}>{t("Repo")}</Forms.FormTitle>

            <Forms.FormText>
                {repoPending
                    ? repo
                    : err
                        ? t("Couldn't load this right now :(")
                        : (
                            <Link href={repo}>
                                {repo.split("/").slice(-2).join("/")}
                            </Link>
                        )
                }
                {" "}
                (<HashLink hash={gitHash} repo={repo} disabled={repoPending} />)
            </Forms.FormText>

            <Divider className={classes(Margins.top16, Margins.bottom16)} />

            <Forms.FormTitle tag="h5">{t("Updates")}</Forms.FormTitle>

            {isNewer
                ? <Newer {...commonProps} />
                : (
                    <Updatable {...commonProps}>
                        <Button variant="secondary" onClick={() => openWhatsNewModal()}>{t("What's New")}</Button>
                    </Updatable>
                )
            }
        </SettingsTab>
    );
}

export default IS_UPDATER_DISABLED
    ? null
    : wrapTab(Updater, "Updater");
