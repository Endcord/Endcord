/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Divider } from "@components/Divider";
import { ErrorCard } from "@components/ErrorCard";
import { Link } from "@components/Link";
import { CspBlockedUrls, useCspErrors } from "@utils/cspViolations";
import { useI18n } from "@utils/i18n";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { relaunch } from "@utils/native";
import { useForceUpdater } from "@utils/react";
import { Button, ConfirmModal, Forms, openModal } from "@webpack/common";

export function CspErrorCard() {
    const { t } = useI18n();
    if (IS_WEB) return null;

    const errors = useCspErrors();
    const forceUpdate = useForceUpdater();

    if (!errors.length) return null;

    const isImgurHtmlDomain = (url: string) => url.startsWith("https://imgur.com/");

    const allowUrl = async (url: string) => {
        const { origin: baseUrl, host } = new URL(url);

        const result = await EndcordNative.csp.requestAddOverride(baseUrl, ["connect-src", "img-src", "style-src", "font-src"], "Endcord Themes");
        if (result !== "ok") return;

        CspBlockedUrls.forEach(url => {
            if (new URL(url).host === host) {
                CspBlockedUrls.delete(url);
            }
        });

        forceUpdate();

        openModal(props => (
            <ConfirmModal
                {...props}
                title={t("Restart Required")}
                subtitle={t("A restart is required to apply this change")}
                confirmText={t("Restart now")}
                cancelText={t("Later")}
                variant="primary"
                onConfirm={relaunch}
            />
        ));
    };

    const hasImgurHtmlDomain = errors.some(isImgurHtmlDomain);

    return (
        <ErrorCard>
            <Forms.FormTitle tag="h5">{t("Blocked Resources")}</Forms.FormTitle>
            <Forms.FormText>{t("Some images, styles, or fonts were blocked because they come from disallowed domains.")}</Forms.FormText>
            <Forms.FormText>{t("It is highly recommended to move them to GitHub or Imgur. But you may also allow domains if you fully trust them.")}</Forms.FormText>
            <Forms.FormText>
                {t("After allowing a domain, you have to fully close (from tray / task manager) and restart {app} to apply the change.", { app: IS_DISCORD_DESKTOP ? "Discord" : "Vesktop" })}
            </Forms.FormText>

            <Forms.FormTitle tag="h5" className={classes(Margins.top16, Margins.bottom8)}>{t("Blocked URLs")}</Forms.FormTitle>
            <div className="vc-settings-csp-list">
                {errors.map((url, i) => (
                    <div key={url}>
                        {i !== 0 && <Divider className={Margins.bottom8} />}
                        <div className="vc-settings-csp-row">
                            <Link href={url}>{url}</Link>
                            <Button color={Button.Colors.PRIMARY} onClick={() => allowUrl(url)} disabled={isImgurHtmlDomain(url)}>
                                {t("Allow")}
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {hasImgurHtmlDomain && (
                <>
                    <Divider className={classes(Margins.top8, Margins.bottom16)} />
                    <Forms.FormText>
                        {t("Imgur links should be direct links in the form of https://i.imgur.com/...")}
                    </Forms.FormText>
                    <Forms.FormText>{t("To obtain a direct link, right-click the image and select \"Copy image address\".")}</Forms.FormText>
                </>
            )}
        </ErrorCard>
    );
}
