/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { DeleteIcon } from "@components/Icons";
import { Margins } from "@components/margins";
import { Paragraph } from "@components/Paragraph";
import { t } from "@utils/i18n";
import { classes } from "@utils/misc";
import { useForceUpdater } from "@utils/react";
import { TextInput, useState } from "@webpack/common";

import { addKeywordEntry, cl, KEYWORD_ENTRIES_KEY, keywordEntries, ListType, removeKeywordEntry } from "..";
import { Collapsible } from "./Collapsible";
import { FormGenericLabel } from "./FormGenericLabel";
import { ListedIds } from "./ListedIds";
import { ListPrioritySelector } from "./ListPrioritySelector";

export function KeywordEntries() {
    const update = useForceUpdater();
    const [values] = useState(keywordEntries);

    async function updateStoreAndRender() {
        await DataStore.set(KEYWORD_ENTRIES_KEY, keywordEntries);
        update();
    }

    async function setRegex(index: number, value: string) {
        keywordEntries[index].regex = value;
        updateStoreAndRender();
    }

    async function setListPriority(index: number, value: ListType) {
        keywordEntries[index].listPriority = value;
        updateStoreAndRender();
    }

    async function setWhitelist(index: number, value: string[]) {
        keywordEntries[index].whitelist = value;
        updateStoreAndRender();
    }

    async function setBlacklist(index: number, value: string[]) {
        keywordEntries[index].blacklist = value;
        updateStoreAndRender();
    }

    async function setIgnoreCase(index: number, value: boolean) {
        keywordEntries[index].ignoreCase = value;
        updateStoreAndRender();
    }

    async function setIgnoreBots(index: number, value: boolean) {
        keywordEntries[index].ignoreBots = value,
            updateStoreAndRender();
    }

    const elements = keywordEntries.map((entry, i) => {
        return (
            <>
                <Collapsible title={`Keyword Entry ${i + 1}`}>
                    <Flex flexDirection="row">
                        <div style={{ flexGrow: 1 }}>
                            <TextInput
                                placeholder={t("example|regex")}
                                spellCheck={false}
                                value={values[i].regex}
                                onChange={e => setRegex(i, e)} />
                        </div>
                        <Button
                            onClick={() => removeKeywordEntry(i, update)}
                            variant="none"
                            size="iconOnly"
                            className={cl("delete")}>
                            <DeleteIcon />
                        </Button>
                    </Flex>
                    <FormSwitch
                        value={values[i].ignoreCase}
                        onChange={() => {
                            setIgnoreCase(i, !values[i].ignoreCase);
                        }}
                        title={t("Ignore Case")}
                        className={cl("ignoreCaseSwitch")} />
                    <FormSwitch
                        value={values[i].ignoreBots ?? false}
                        onChange={() => {
                            setIgnoreBots(i, !values[i].ignoreBots);
                        }}
                        title={t("Ignore Bots")}
                        description={t("Ignore messages from bots")}
                        className={cl("ignoreCaseSwitch")} />
                    <Flex flexDirection="row">
                        <div style={{ flexGrow: 1 }}>
                            <Heading tag="h5">{t("Whitelist")}</Heading>
                        </div>
                        <Button onClick={() => {
                            values[i].whitelist.push("");
                            update();
                        }}>{t("Add ID")}</Button>
                    </Flex>
                    {!!values[i].whitelist.length && <>
                        <div className={classes(Margins.top8, Margins.bottom8)} />
                        <Flex flexDirection="row">
                            <div style={{ flexGrow: 1 }}>
                                <ListedIds listIds={values[i].whitelist} setListIds={e => setWhitelist(i, e)} />
                            </div>
                        </Flex>
                    </>}
                    <div className={classes(Margins.top8, Margins.bottom8)} />
                    <Flex flexDirection="row">
                        <div style={{ flexGrow: 1 }}>
                            <Heading tag="h5">{t("Blacklist")}</Heading>
                        </div>
                        <Button onClick={() => {
                            values[i].blacklist.push("");
                            update();
                        }}>{t("Add ID")}</Button>
                    </Flex>
                    {!!values[i].blacklist.length && <>
                        <div className={classes(Margins.top8, Margins.bottom8)} />
                        <Flex flexDirection="row">
                            <div style={{ flexGrow: 1 }}>
                                <ListedIds listIds={values[i].blacklist} setListIds={e => setBlacklist(i, e)} />
                            </div>
                        </Flex>
                    </>}
                    <div className={classes(Margins.top8, Margins.bottom8)} />
                    <FormGenericLabel
                        title={t("List priority (Advanced)")}
                        description={<>
                            <Paragraph>
                                {t("Which list to prioritize in case a message triggers both lists")}</Paragraph>
                            <Paragraph>
                                {t("If you are not sure, in most common scenarios it is usually set to Blacklist")}</Paragraph>
                        </>}
                        hideBorder
                    >
                        <ListPrioritySelector listType={values[i].listPriority} setListPriority={e => setListPriority(i, e)} />
                    </FormGenericLabel>
                </Collapsible>
            </>
        );
    });

    return (
        <>
            {elements}
            <div><Button onClick={() => addKeywordEntry(update)}>{t("Add Keyword Entry")}</Button></div>
        </>
    );
}
