/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./ContributorModal.css?screen";

import { useSettings } from "@api/Settings";
import { EndcordModal } from "@components/EndcordModal";
import { Link } from "@components/Link";
import { RenderModalProps, User } from "@endcord/discord-types";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { fetchUserProfile } from "@utils/discord";
import { useI18n } from "@utils/i18n";
import { classes, pluralise } from "@utils/misc";
import { Forms, openModal, showToast, useEffect, useMemo, UserProfileStore, useStateFromStores } from "@webpack/common";

import Plugins, { getPluginListInfo } from "~plugins";

import { GithubButton, WebsiteButton } from "./LinkIconButton";
import { listItem } from "./listItems";
import { PluginCard } from "./PluginCard";

const cl = classNameFactory("vc-author-modal-");

export function openContributorModal(user: User) {
    openModal(modalProps => <ContributorModal user={user} modalProps={modalProps} />);
}

function ContributorModal({ user, modalProps }: { user: User; modalProps: RenderModalProps; }) {
    const { t } = useI18n();
    useSettings();

    const profile = useStateFromStores([UserProfileStore], () => UserProfileStore.getUserProfile(user.id));

    useEffect(() => {
        if (!profile && !user.bot && user.id)
            fetchUserProfile(user.id);
    }, [user.id, user.bot, profile]);

    const githubName = profile?.connectedAccounts?.find(a => a.type === "github")?.name;
    const website = profile?.connectedAccounts?.find(a => a.type === "domain")?.name;

    const plugins = useMemo(() => {
        // Authors come from what the build read where it could, so the code of every plugin isn't loaded to list them
        const authorsOf = (name: string) => getPluginListInfo(name)?.w?.map(key => Devs[key]) ?? Plugins[name].authors;
        return Object.keys(Plugins)
            .filter(name => !name.endsWith("API"))
            .filter(name => authorsOf(name)?.some(a => String(a.id) === String(user.id) || a.name?.toLowerCase() === user.username?.toLowerCase()))
            .map(listItem)
            .sort((a, b) => Number(a.required ?? false) - Number(b.required ?? false));
    }, [user.id, user.username]);

    const ContributedHyperLink = <Link href="https://endcord.com/source">{t("contributed")}</Link>;

    return (
        <EndcordModal
            {...modalProps}
            title={
                <div className="vc-plugin-modal-header">
                    <img
                        className={cl("avatar")}
                        src={user.getAvatarURL(void 0, 512, true)}
                        alt=""
                    />
                    <Forms.FormTitle tag="h2" className={cl("name")}>{user.username}</Forms.FormTitle>

                    <div className={classes("vc-settings-modal-links", cl("links"))}>
                        {website && (
                            <WebsiteButton
                                text={website}
                                href={`https://${website}`}
                            />
                        )}
                        {githubName && (
                            <GithubButton
                                text={githubName}
                                href={`https://github.com/${githubName}`}
                            />
                        )}
                    </div>
                </div>
            }
            subtitle={
                plugins.length
                    ? (
                        <Forms.FormText>
                            {t("This person has")} {ContributedHyperLink} ({pluralise(plugins.length, "plugin")})!
                        </Forms.FormText>
                    )
                    : (
                        <Forms.FormText>
                            {t("This person has not made any plugins. They likely")} {ContributedHyperLink} {t("to Endcord in other ways!")}
                        </Forms.FormText>
                    )
            }
        >
            {!!plugins.length && (
                <div className={cl("plugins")}>
                    {plugins.map(p =>
                        <PluginCard
                            key={p.name}
                            plugin={p}
                            disabled={p.required ?? false}
                            onRestartNeeded={() => showToast(t("Restart to apply changes"))}
                        />
                    )}
                </div>
            )}
        </EndcordModal>
    );
}

