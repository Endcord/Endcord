/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { getErrorMessage } from "@plugins/serverBackup/api";
import { parseBackup, readBackupFile } from "@plugins/serverBackup/backup";
import { restoreBackup } from "@plugins/serverBackup/restore";
import { settings } from "@plugins/serverBackup/settings";
import { ChannelTypes, GuildBackup, RestoreProgress, RestoreReport } from "@plugins/serverBackup/types";
import { readClipboard } from "@utils/clipboard";
import { t } from "@utils/i18n";
import type { Guild, RenderModalProps } from "@vencord/discord-types";
import { Button, Modal, openModal, showToast, TextArea, useMemo, useState } from "@webpack/common";

const MAX_LOGS = 100;
const MAX_SHOWN_ERRORS = 15;

export function openRestoreModal(guild: Guild) {
    openModal(props => <RestoreModal props={props} guild={guild} />);
}

function RestoreModal({ props, guild }: { props: RenderModalProps; guild: Guild; }) {
    const [text, setText] = useState("");
    const [restoring, setRestoring] = useState(false);
    const [progress, setProgress] = useState<RestoreProgress | null>(null);
    const [report, setReport] = useState<RestoreReport | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    const [options, setOptions] = useState({
        restoreGuildSettings: settings.store.restoreGuildSettings,
        restoreName: settings.store.restoreName,
        includeMemberOverwrites: settings.store.includeMemberOverwrites,
        deleteExisting: settings.store.deleteExisting
    });

    const { backup, parseError } = useMemo(() => {
        if (!text.trim()) return { backup: null, parseError: null };

        try {
            return { backup: parseBackup(text), parseError: null };
        } catch (e) {
            return { backup: null, parseError: getErrorMessage(e) };
        }
    }, [text]);

    const setOption = (key: keyof typeof options, value: boolean) => {
        setOptions(prev => ({ ...prev, [key]: value }));
        settings.store[key] = value;
    };

    const loadFile = async () => {
        try {
            const content = await readBackupFile();
            if (content != null) setText(content);
        } catch (e) {
            showToast({ text: `Could not read the file: ${getErrorMessage(e)}`, variant: "critical" });
        }
    };

    const pasteClipboard = async () => {
        try {
            setText(await readClipboard());
        } catch {
            showToast({ text: "Could not read your clipboard.", variant: "critical" });
        }
    };

    const run = async () => {
        if (!backup) return;

        setRestoring(true);
        setReport(null);
        setProgress(null);
        setLogs([]);

        try {
            const result = await restoreBackup(guild.id, backup, {
                ...options,
                requestDelay: settings.store.requestDelay,
                onProgress: p => {
                    setProgress(p);
                    setLogs(prev => {
                        const line = p.detail ? `${p.stage}: ${p.detail}` : p.stage;
                        const next = [...prev, line];
                        return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
                    });
                }
            });

            setReport(result);
            showToast({
                text: `Restore finished: ${result.rolesCreated} roles and ${result.channelsCreated} channels created.`,
                variant: result.errors.length ? "critical" : "success"
            });
        } catch (e) {
            showToast({ text: `Restore failed: ${getErrorMessage(e)}`, variant: "critical" });
        } finally {
            setRestoring(false);
        }
    };

    const percent = progress && progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0;

    return (
        <Modal
            {...props}
            size="md"
            title={t("Restore Server Backup")}
            subtitle={`Target server: ${guild.name}`}
            notice={options.deleteExisting
                ? { message: "Existing channels and roles will be deleted before restoring. This cannot be undone.", type: "critical" }
                : undefined}
            actions={[
                { text: "Close", variant: "secondary", onClick: props.onClose, disabled: restoring },
                {
                    text: restoring ? "Restoring…" : "Restore",
                    variant: "primary",
                    onClick: run,
                    disabled: !backup || restoring,
                    loading: restoring
                }
            ]}
        >
            <Flex flexDirection="column" gap="12px">
                <Flex gap="8px" flexWrap="wrap">
                    <Button onClick={loadFile} disabled={restoring}>{t("Choose File")}</Button>
                    <Button onClick={pasteClipboard} disabled={restoring}>{t("Paste from Clipboard")}</Button>
                </Flex>

                <TextArea
                    value={text}
                    onChange={setText}
                    disabled={restoring}
                    autosize
                    placeholder={t("Paste the contents of a backup file here, or use the buttons above.")}
                    style={{ minHeight: 120 }}
                />

                {parseError ? <Paragraph color="text-danger">{parseError}</Paragraph> : null}

                {backup ? <BackupPreview backup={backup} /> : null}

                <section>
                    <Heading tag="h5">{t("Options")}</Heading>
                    <FormSwitch
                        title={t("Restore server settings")}
                        description={t("Verification level, system channel, locale and similar settings.")}
                        value={options.restoreGuildSettings}
                        onChange={v => setOption("restoreGuildSettings", v)}
                        disabled={restoring}
                    />
                    <FormSwitch
                        title={t("Restore server name")}
                        description={t("Rename the target server to the name stored in the backup.")}
                        value={options.restoreName}
                        onChange={v => setOption("restoreName", v)}
                        disabled={restoring}
                    />
                    <FormSwitch
                        title={t("Include member overwrites")}
                        description={t("Also copy channel permissions that target individual members.")}
                        value={options.includeMemberOverwrites}
                        onChange={v => setOption("includeMemberOverwrites", v)}
                        disabled={restoring}
                    />
                    <FormSwitch
                        title={t("Delete existing content")}
                        description={t("Delete the target server's channels and roles before restoring.")}
                        value={options.deleteExisting}
                        onChange={v => setOption("deleteExisting", v)}
                        disabled={restoring}
                    />
                </section>

                {(restoring || progress) ? (
                    <section>
                        <ProgressBar value={percent} />
                        <Paragraph color="text-muted">
                            {progress ? `${progress.stage} (${progress.current}/${progress.total})` : "Starting…"}
                        </Paragraph>
                        {logs.length > 0 ? (
                            <div style={{ maxHeight: 140, overflowY: "auto", marginTop: 4 }}>
                                {logs.map((line, i) => (
                                    <Paragraph key={i} color="text-subtle">{line}</Paragraph>
                                ))}
                            </div>
                        ) : null}
                    </section>
                ) : null}

                {report ? <RestoreResult report={report} /> : null}
            </Flex>
        </Modal>
    );
}

function BackupPreview({ backup }: { backup: GuildBackup; }) {
    const categories = backup.channels.filter(channel => channel.type === ChannelTypes.GUILD_CATEGORY).length;
    const channels = backup.channels.length - categories;
    const roles = Math.max(0, backup.roles.length - 1);

    return (
        <section>
            <Heading tag="h5">{backup.guild.name}</Heading>
            <Paragraph>
                {roles} role{roles === 1 ? "" : "s"}, {categories} categor{categories === 1 ? "y" : "ies"},{" "}
                {channels} channel{channels === 1 ? "" : "s"}
            </Paragraph>
        </section>
    );
}

function RestoreResult({ report }: { report: RestoreReport; }) {
    const shown = report.errors.slice(0, MAX_SHOWN_ERRORS);

    return (
        <section>
            <Heading tag="h5">{t("Result")}</Heading>
            <Paragraph>
                {t("Created")}{" "}{report.rolesCreated} role{report.rolesCreated === 1 ? "" : "s"} and{" "}
                {report.channelsCreated} channel{report.channelsCreated === 1 ? "" : "s"}.
            </Paragraph>
            {report.errors.length > 0 ? (
                <>
                    <Paragraph color="text-danger">
                        {report.errors.length} error{report.errors.length === 1 ? "" : "s"}:
                    </Paragraph>
                    <div style={{ maxHeight: 140, overflowY: "auto" }}>
                        {shown.map((error, i) => (
                            <Paragraph key={i} color="text-danger">{error}</Paragraph>
                        ))}
                        {report.errors.length > shown.length ? (
                            <Paragraph color="text-muted">
                                {t("…and")}{" "}{report.errors.length - shown.length} more.
                            </Paragraph>
                        ) : null}
                    </div>
                </>
            ) : null}
        </section>
    );
}

function ProgressBar({ value }: { value: number; }) {
    return (
        <div
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
                width: "100%",
                height: 8,
                borderRadius: 4,
                background: "var(--background-modifier-accent)",
                overflow: "hidden"
            }}
        >
            <div
                style={{
                    width: `${value}%`,
                    height: "100%",
                    background: "var(--brand-experiment)",
                    transition: "width 0.2s ease"
                }}
            />
        </div>
    );
}
