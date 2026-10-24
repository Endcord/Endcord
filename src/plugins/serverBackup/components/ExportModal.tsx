/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { getErrorMessage } from "@plugins/serverBackup/api";
import { createBackup, saveBackupFile, serializeBackup } from "@plugins/serverBackup/backup";
import { ChannelTypes, GuildBackup } from "@plugins/serverBackup/types";
import { copyWithToast } from "@utils/discord";
import { t } from "@utils/i18n";
import type { Guild, RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, useEffect, useState } from "@webpack/common";

export function openExportModal(guild: Guild) {
    openModal(props => <ExportModal props={props} guild={guild} />);
}

function ExportModal({ props, guild }: { props: RenderModalProps; guild: Guild; }) {
    const [backup, setBackup] = useState<GuildBackup | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setBackup(null);
        setError(null);

        createBackup(guild)
            .then(result => !cancelled && setBackup(result))
            .catch(e => !cancelled && setError(getErrorMessage(e)));

        return () => { cancelled = true; };
    }, [guild.id]);

    const onSave = async () => {
        if (!backup) return;

        setBusy(true);
        try {
            await saveBackupFile(backup);
            showToast({ text: "Backup saved.", variant: "success" });
        } catch (e) {
            showToast({ text: `Could not save the backup: ${getErrorMessage(e)}`, variant: "critical" });
        } finally {
            setBusy(false);
        }
    };

    const onCopy = async () => {
        if (!backup) return;

        try {
            await copyWithToast(serializeBackup(backup), "Backup copied to your clipboard.");
        } catch (e) {
            showToast({ text: `Could not copy the backup: ${getErrorMessage(e)}`, variant: "critical" });
        }
    };

    return (
        <Modal
            {...props}
            size="sm"
            title={t("Export Server Backup")}
            subtitle={guild.name}
            actions={[
                { text: "Close", variant: "secondary", onClick: props.onClose },
                { text: "Copy JSON", variant: "secondary", onClick: onCopy, disabled: !backup || busy },
                { text: "Save to File", variant: "primary", onClick: onSave, disabled: !backup || busy, loading: busy }
            ]}
        >
            <Flex flexDirection="column" gap="12px">
                {error
                    ? <Paragraph color="text-danger">{error}</Paragraph>
                    : backup
                        ? <BackupSummary backup={backup} />
                        : <Paragraph color="text-muted">{t("Reading the server data…")}</Paragraph>}
            </Flex>
        </Modal>
    );
}

function BackupSummary({ backup }: { backup: GuildBackup; }) {
    const categories = backup.channels.filter(channel => channel.type === ChannelTypes.GUILD_CATEGORY).length;
    const channels = backup.channels.length - categories;
    const hidden = backup.channels.filter(channel => channel.hidden).length;
    // The @everyone role is included in the backup and is not re-created on restore.
    const roles = Math.max(0, backup.roles.length - 1);

    return (
        <Flex flexDirection="column" gap="8px">
            <Heading tag="h5">{backup.guild.name}</Heading>
            <Paragraph>
                {roles} role{roles === 1 ? "" : "s"}, {categories} categor{categories === 1 ? "y" : "ies"},{" "}
                {channels} channel{channels === 1 ? "" : "s"}
                {hidden > 0 ? ` (${hidden} hidden)` : ""}
            </Paragraph>
            <Paragraph color="text-muted">
                {t("Exported on")}{" "}{new Date(backup.createdAt).toLocaleString()}
            </Paragraph>
            <Paragraph color="text-muted">
                {t("Save this backup to a file, or copy it as JSON and paste it into the restore window on another server.")}</Paragraph>
        </Flex>
    );
}
