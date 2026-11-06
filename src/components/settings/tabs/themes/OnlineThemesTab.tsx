/*
 * Endcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { HeadingSecondary } from "@components/Heading";
import { DeleteIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { classNameFactory } from "@utils/css";
import { useI18n } from "@utils/i18n";
import { SettingsRouter, TextInput, useState } from "@webpack/common";

const cl = classNameFactory("ec-theme-link-");

const THEME_MODES = ["@light", "@dark"];

function parseLink(link: string) {
    const [first, second] = link.split(/\s+/);
    const mode = THEME_MODES.includes(first) ? first : undefined;
    const url = mode ? second : first;

    let name = url;
    try {
        const { hostname, pathname } = new URL(url);
        name = decodeURIComponent(pathname.split("/").pop() || hostname);
    } catch { }

    return { mode, url, name };
}

function isValidLink(link: string) {
    try {
        return new URL(parseLink(link).url).protocol === "https:";
    } catch {
        return false;
    }
}

export function OnlineThemesTab() {
    const { t } = useI18n();
    const settings = useSettings(["themeLinks"]);
    const [link, setLink] = useState("");

    const isDuplicate = settings.themeLinks.includes(link.trim());
    const canAdd = isValidLink(link.trim()) && !isDuplicate;

    function add() {
        settings.themeLinks = [...settings.themeLinks, link.trim()];
        setLink("");
    }

    return (
        <Flex flexDirection="column" gap="1.5em">
            {isPluginEnabled("ThemeLibrary") && (
                <Card defaultPadding>
                    <HeadingSecondary>{t("Theme Library")}</HeadingSecondary>
                    <Paragraph>{t("Browse themes made by the community and apply one with a click.")}</Paragraph>
                    <Button className={cl("browse")} onClick={() => SettingsRouter.openUserSettings("endcord_theme_library_panel")}>
                        {t("Open Theme Library")}
                    </Button>
                </Card>
            )}

            <section>
                <HeadingSecondary>{t("Add a theme by link")}</HeadingSecondary>
                <Paragraph>{t("Use a direct https link to a CSS file. Start with @dark or @light to use it with only that Discord theme.")}</Paragraph>

                <form
                    className={cl("add")}
                    onSubmit={event => {
                        event.preventDefault();
                        if (canAdd) add();
                    }}
                >
                    <TextInput value={link} onChange={setLink} placeholder="https://example.com/theme.css" spellCheck={false} />
                    <Button type="submit" disabled={!canAdd}>{t("Add")}</Button>
                </form>
                {isDuplicate && <Paragraph className={cl("error")}>{t("This theme is already in your list")}</Paragraph>}
            </section>

            {settings.themeLinks.length > 0 && (
                <section>
                    <HeadingSecondary>{t("Your online themes")}</HeadingSecondary>
                    <ul className={cl("list")}>
                        {settings.themeLinks.map(themeLink => {
                            const { mode, url, name } = parseLink(themeLink);

                            return (
                                <li key={themeLink} className={cl("row")}>
                                    <div className={cl("text")}>
                                        <div className={cl("name")}>{name}</div>
                                        <div className={cl("url")} title={url}>{url}</div>
                                    </div>
                                    {mode && <span className={cl("mode")}>{mode === "@dark" ? t("Dark only") : t("Light only")}</span>}
                                    <button
                                        className={cl("remove")}
                                        aria-label={t("Remove {name}", { name })}
                                        onClick={() => settings.themeLinks = settings.themeLinks.filter(other => other !== themeLink)}
                                    >
                                        <DeleteIcon width={18} height={18} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
        </Flex>
    );
}
