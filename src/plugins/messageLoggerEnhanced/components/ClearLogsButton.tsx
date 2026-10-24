/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { clearMessagesIDB } from "@plugins/messageLoggerEnhanced/db";
import { Flogger } from "@plugins/messageLoggerEnhanced/index";
import { t } from "@utils/i18n";
import { Alerts, Toasts, useState } from "@webpack/common";

interface ClearLogsButtonProps {
    label?: string;
    onCleared?: () => void;
}

export function ClearLogsButton({ label = "Clear Logs", onCleared }: ClearLogsButtonProps) {
    const [loading, setLoading] = useState(false);
    return (
        <Button
            disabled={loading}
            variant="dangerPrimary"
            onClick={() => Alerts.show({
                title: t("Clear Logs"),
                body: t("Are you sure you want to clear all logs?"),
                // @ts-ignore
                confirmVariant: "critical-primary",
                confirmText: t("Clear"),
                cancelText: t("Cancel"),
                onConfirm: async () => {
                    setLoading(true);
                    try {
                        await clearMessagesIDB();
                        onCleared?.();
                        Toasts.show({
                            id: Toasts.genId(),
                            message: "Cleared Logs",
                            type: Toasts.Type.SUCCESS
                        });
                    } catch (err) {
                        Flogger.error("Failed to clear logs", err);
                        Toasts.show({
                            id: Toasts.genId(),
                            message: "Failed to clear logs",
                            type: Toasts.Type.FAILURE
                        });
                    } finally {
                        setLoading(false);
                    }
                },
            })}
        >
            {loading ? "Clearing Logs..." : label}
        </Button>
    );
}
