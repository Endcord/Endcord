/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./Snapshots.css?screen";

import { deleteSnapshot, listSnapshots, restoreSnapshot, SnapshotInfo, takeSnapshot } from "@api/SettingsSnapshots";
import { Button } from "@components/Button";
import { EndcordModal } from "@components/EndcordModal";
import { HeadingSecondary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { classNameFactory } from "@utils/css";
import { t, useI18n } from "@utils/i18n";
import { Margins } from "@utils/margins";
import { relaunch } from "@utils/native";
import { openModal, showToast, Toasts, useEffect, useState } from "@webpack/common";

const cl = classNameFactory("ec-snapshots-");

function describe({ kind, subject }: SnapshotInfo) {
    switch (kind) {
        case "daily": return t("Daily, after Discord started fine");
        case "manual": return t("Taken by you");
        case "profile": return t("Before switching to {name}", { name: subject ?? "" });
        case "pack": return t("Before adding {name}", { name: (subject ?? "").split(", ").map(name => t(name)).join(", ") });
        case "welcome": return t("Before the welcome setup");
        case "restore": return t("Before going back to a snapshot");
    }
}

const formatDate = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function confirmRestore(snapshot: SnapshotInfo) {
    openModal(props => (
        <EndcordModal
            {...props}
            size="sm"
            title={t("Go back to {date}?", { date: formatDate(snapshot.at) })}
            subtitle={t("Your plugins, their settings, themes and Custom CSS go back to how they were, and Discord restarts. What you have now is saved as a snapshot first.")}
            actions={[
                { text: t("Cancel"), variant: "secondary", onClick: props.onClose },
                {
                    text: t("Go back and restart"),
                    variant: "primary",
                    async onClick() {
                        try {
                            await restoreSnapshot(snapshot.id);
                            relaunch();
                        } catch (err) {
                            props.onClose();
                            showToast(t("Couldn't go back: {error}", { error: String(err) }), Toasts.Type.FAILURE);
                        }
                    }
                }
            ]}
        />
    ));
}

export function SnapshotsSection() {
    const { t } = useI18n();
    const [snapshots, setSnapshots] = useState<SnapshotInfo[]>();

    const refresh = () => listSnapshots().then(setSnapshots);
    useEffect(() => void refresh(), []);

    return (
        <section className={Margins.top20}>
            <div className={cl("head")}>
                <HeadingSecondary>{t("Snapshots")}</HeadingSecondary>
                <Button
                    size="small"
                    variant="secondary"
                    onClick={async () => {
                        await takeSnapshot("manual");
                        await refresh();
                        showToast(t("Snapshot saved"), Toasts.Type.SUCCESS);
                    }}
                >
                    {t("Take one now")}
                </Button>
            </div>
            <Paragraph className={Margins.bottom8}>
                {t("Endcord keeps a copy of your settings once a day while Discord runs fine, and before anything that changes many plugins at once. They stay on this device.")}
            </Paragraph>

            {snapshots?.length
                ? (
                    <ul className={cl("list")}>
                        {snapshots.map(snapshot => (
                            <li key={snapshot.id} className={cl("row")}>
                                <span className={cl("text")}>
                                    <span className={cl("date")}>{formatDate(snapshot.at)}</span>
                                    <span className={cl("why")}>
                                        {describe(snapshot)} · {t("{count} plugins on", { count: snapshot.pluginsOn })}
                                    </span>
                                </span>
                                <button className={cl("action")} onClick={() => confirmRestore(snapshot)}>{t("Go back")}</button>
                                <button
                                    className={cl("action", "delete")}
                                    aria-label={t("Delete")}
                                    title={t("Delete")}
                                    onClick={async () => {
                                        await deleteSnapshot(snapshot.id);
                                        refresh();
                                    }}
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                )
                : snapshots && <Paragraph className={cl("empty")}>{t("None yet. The first one is taken after Discord has been up for a moment.")}</Paragraph>
            }
        </section>
    );
}
