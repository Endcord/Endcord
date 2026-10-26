/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./PluginModal.css";

import { generateId } from "@api/Commands";
import { hasAnyVisibleSettings, isSettingHidden } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import { RenderModalProps, User } from "@endcord/discord-types";
import { debounce } from "@shared/debounce";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { useI18n } from "@utils/i18n";
import { proxyLazy } from "@utils/lazy";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { OptionType, Plugin, PluginTag } from "@utils/types";
import { findCssClassesLazy } from "@webpack";
import { Clickable, FluxDispatcher, Forms, Modal, openModal, React, Text, Tooltip, useEffect, useMemo, UserStore, UserSummaryItem, UserUtils, useState } from "@webpack/common";
import { Constructor } from "type-fest";

import { PluginMeta } from "~plugins";

import { OptionComponentMap } from "./components";
import { openContributorModal } from "./ContributorModal";
import { WebsiteButton } from "./LinkIconButton";

const cl = classNameFactory("vc-plugin-modal-");

const AvatarStyles = findCssClassesLazy("moreUsers", "avatar", "clickableAvatar");
const UserRecord: Constructor<Partial<User>> = proxyLazy(() => UserStore.getCurrentUser().constructor) as any;

interface PluginModalProps extends RenderModalProps {
    plugin: Plugin;
    onRestartNeeded(key: string): void;
}

function makeDummyUser(user: { username: string; id?: string; avatar?: string; }) {
    const newUser = new UserRecord({
        username: user.username,
        id: user.id ?? generateId(),
        avatar: user.avatar,
        /** To stop discord making unwanted requests... */
        bot: true,
    });

    FluxDispatcher.dispatch({
        type: "USER_UPDATE",
        user: newUser,
    });

    return newUser;
}

function PluginTags({ tags }: { tags: PluginTag[]; }) {
    const { t } = useI18n();
    return (
        <div className={cl("tags")}>
            {tags.map(tag => (
                <div key={tag} className={cl("tag")}>{t(tag)}</div>
            ))}
        </div>
    );
}

export default function PluginModal({ plugin, onRestartNeeded, onClose, transitionState }: PluginModalProps) {
    const { t, tPluginDesc } = useI18n();
    const pluginSettings = useSettings([`plugins.${plugin.name}.*`]).plugins[plugin.name];
    const hasSettings = hasAnyVisibleSettings(plugin);

    const customAuthors = useMemo(() => {
        const list = plugin.authors?.length ? plugin.authors : [Devs.rootpoi, Devs.kraethis, Devs.ewlle];
        // Several author names can point at the same account; show each person once
        return list.filter((a, i) => list.findIndex(b => String(b.id) === String(a.id)) === i);
    }, [plugin.authors]);

    // avoid layout shift by showing dummy users while loading users
    const fallbackAuthors = useMemo(() => [makeDummyUser({ username: t("Loading..."), id: "-1465912127305809920" })], []);
    const [authors, setAuthors] = useState<Partial<User>[]>([]);

    useEffect(() => {
        let active = true;
        (async () => {
            const list: Partial<User>[] = [];
            for (const user of customAuthors.slice(0, 6)) {
                try {
                    const idStr = user.id ? String(user.id) : undefined;
                    const cached = idStr ? UserStore.getUser(idStr) : null;
                    if (cached) {
                        list.push(cached);
                        continue;
                    }
                    const author = idStr
                        ? await UserUtils.getUser(idStr).catch(() => makeDummyUser({ username: user.name, id: idStr }))
                        : makeDummyUser({ username: user.name });
                    list.push(author);
                } catch {
                    list.push(makeDummyUser({ username: user.name, id: user.id ? String(user.id) : undefined }));
                }
            }
            if (active) setAuthors(list);
        })();
        return () => { active = false; };
    }, [customAuthors]);

    function renderSettings() {
        const { settings } = plugin;
        if (!hasSettings || !settings)
            return <Forms.FormText>{t("There are no settings for this plugin.")}</Forms.FormText>;

        const options = Object.entries(settings.def).map(([key, setting]) => {
            if (setting.type === OptionType.CUSTOM) return null;

            if (isSettingHidden(settings, setting)) return null;

            function onChange(newValue: any) {
                const option = plugin.settings!.def[key];
                if (!option || option.type === OptionType.CUSTOM) return;

                pluginSettings[key] = newValue;

                if (option.restartNeeded) onRestartNeeded(key);
            }

            const Component = OptionComponentMap[setting.type];
            return (
                <ErrorBoundary noop key={key}>
                    <Component
                        id={key}
                        setting={setting}
                        onChange={debounce(onChange)}
                        pluginSettings={pluginSettings}
                        definedSettings={settings}
                        closePluginSettings={onClose}
                    />
                </ErrorBoundary>
            );
        });

        return (
            <div className="vc-plugins-settings">
                {options}
            </div>
        );
    }

    function renderMoreUsers(_label: string, count: number) {
        const sliceCount = customAuthors.length - count;
        const sliceStart = customAuthors.length - sliceCount;
        const sliceEnd = sliceStart + customAuthors.length - count;

        return (
            <Tooltip text={customAuthors.slice(sliceStart, sliceEnd).map(u => u.name).join(", ")}>
                {({ onMouseEnter, onMouseLeave }) => (
                    <div
                        className={AvatarStyles.moreUsers}
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                    >
                        +{sliceCount}
                    </div>
                )}
            </Tooltip>
        );
    }

    const pluginMeta = PluginMeta[plugin.name];

    return (
        <Modal
            transitionState={transitionState}
            onClose={onClose}
            size="lg"
            title={
                <div className={cl("header")}>
                    <BaseText tag="h1" weight="semibold" size="lg">{plugin.name}</BaseText>
                    {!pluginMeta.userPlugin && (
                        <div className="vc-settings-modal-links">
                            <WebsiteButton
                                text={t("View more info")}
                                href={`https://endcord.com/plugins/${plugin.name}`}
                            />
                        </div>
                    )}
                </div>
            }
            subtitle={
                <div className={cl("info")}>
                    <div>
                        <Forms.FormText>{tPluginDesc(plugin.name, plugin.description)}</Forms.FormText>
                        {!!plugin.tags?.length && <PluginTags tags={plugin.tags} />}
                    </div>
                </div>
            }
        >
            <div className={"vc-settings-modal-content"}>
                <section>
                    <Text variant="heading-lg/semibold" className={classes(Margins.top8, Margins.bottom8)}>{t("Authors")}</Text>
                    <div style={{ width: "fit-content" }}>
                        <ErrorBoundary noop>
                            <UserSummaryItem
                                users={authors.length ? authors : fallbackAuthors}
                                guildId={undefined}
                                renderIcon={false}
                                max={6}
                                showDefaultAvatarsForNullUsers
                                renderMoreUsers={renderMoreUsers}
                                renderUser={(user: User) => (
                                    <Clickable
                                        className={AvatarStyles.clickableAvatar}
                                        onClick={() => openContributorModal(user)}
                                    >
                                        <img
                                            className={AvatarStyles.avatar}
                                            src={user.getAvatarURL(void 0, 80, true)}
                                            alt={user.username}
                                            title={user.username}
                                        />
                                    </Clickable>
                                )}
                            />
                        </ErrorBoundary>
                    </div>
                </section>

                {!!plugin.settingsAboutComponent && (
                    <div className={Margins.top16}>
                        <section>
                            <ErrorBoundary message={t("This plugin's info panel tripped over itself, but its settings still work.")}>
                                <plugin.settingsAboutComponent />
                            </ErrorBoundary>
                        </section>
                    </div>
                )}

                <section>
                    <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>{t("Settings")}</Text>
                    {renderSettings()}
                </section>
            </div>
        </Modal>
    );
}

export function openPluginModal(plugin: Plugin, onRestartNeeded?: (pluginName: string, key: string) => void) {
    openModal(modalProps => (
        <PluginModal
            {...modalProps}
            plugin={plugin}
            onRestartNeeded={(key: string) => onRestartNeeded?.(plugin.name, key)}
        />
    ));
}

