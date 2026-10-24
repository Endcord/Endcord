/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { copyWithToast } from "@utils/discord";
import { t } from "@utils/i18n";
import { classes } from "@utils/misc";
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, React, RTCConnectionStore, useStateFromStores } from "@webpack/common";
import type { SVGProps } from "react";

export interface IPInfo {
    ip: string;
    city?: string;
    region?: string;
    countryCode?: string;
    countryName?: string;
    latitude?: number;
    longitude?: number;
    organization?: string;
    timezone?: string;
}

export interface VoiceServerInfo {
    hostname: string;
    addresses: string[];
    info: IPInfo;
    ping?: number;
}

interface VoiceServerModalProps {
    rootProps: RenderModalProps;
    loadInfo: () => Promise<VoiceServerInfo>;
}

export function getLocation(info: IPInfo) {
    const region = [info.city, info.region].filter(Boolean).join(", ");
    const country = info.countryName
        ? info.countryCode ? `${info.countryName} (${info.countryCode})` : info.countryName
        : undefined;

    return [region, country].filter(Boolean).join(", ") || "Unknown";
}

function getConnectionLabel(state: string) {
    return state
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^\w/, character => character.toUpperCase());
}

function InfoRow({ label, value }: { label: string; value: string; }) {
    return (
        <div className="vc-voice-server-info-row">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

export function VoiceServerModal({ rootProps, loadInfo }: VoiceServerModalProps) {
    const connectionState = useStateFromStores([RTCConnectionStore], () => RTCConnectionStore.getState());
    const livePing = useStateFromStores([RTCConnectionStore], () => RTCConnectionStore.getLastPing());
    const [server, setServer] = React.useState<VoiceServerInfo | null>(null);
    const [error, setError] = React.useState("");
    const [loading, setLoading] = React.useState(true);
    const mounted = React.useRef(true);

    const refresh = React.useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const nextServer = await loadInfo();
            if (mounted.current) setServer(nextServer);
        } catch (lookupError) {
            if (!mounted.current) return;

            setServer(null);
            setError(lookupError instanceof Error ? lookupError.message : "Could not inspect the current voice server.");
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [loadInfo]);

    React.useEffect(() => () => {
        mounted.current = false;
    }, []);

    React.useEffect(() => {
        void refresh();
    }, [connectionState, refresh]);

    const coordinates = server?.info.latitude != null && server.info.longitude != null
        ? `${server.info.latitude}, ${server.info.longitude}`
        : "Unknown";

    return (
        <Modal
            {...rootProps}
            size="md"
            title={t("Voice Server Info")}
            subtitle={t("Details about the Discord relay currently carrying your voice connection.")}
        >
            <div className="vc-voice-server-info-body">
                <div className="vc-voice-server-info-hero">
                    <div className="vc-voice-server-info-icon">
                        <VoiceServerIcon width={28} height={28} />
                    </div>
                    <div className="vc-voice-server-info-hero-copy">
                        <span>{t("Current relay")}</span>
                        <strong>{server?.hostname ?? RTCConnectionStore.getHostname() ?? "No voice server"}</strong>
                    </div>
                    <span className={classes(
                        "vc-voice-server-info-status",
                        connectionState === "RTC_CONNECTED" && "vc-voice-server-info-status-connected"
                    )}>
                        {getConnectionLabel(connectionState)}
                    </span>
                </div>

                {error && <div className="vc-voice-server-info-error">{error}</div>}

                {server && (
                    <div className="vc-voice-server-info-grid">
                        <div className="vc-voice-server-info-row">
                            <span>{t("IPv4")}</span>
                            <strong className="vc-voice-server-info-addresses">
                                {server.addresses.map(address => <span key={address}>{address}</span>)}
                            </strong>
                        </div>
                        <InfoRow label={t("Location")} value={getLocation(server.info)} />
                        <InfoRow label={t("Organization")} value={server.info.organization ?? "Unknown"} />
                        <InfoRow label={t("Timezone")} value={server.info.timezone ?? "Unknown"} />
                        <InfoRow label={t("Coordinates")} value={coordinates} />
                        <InfoRow label={t("Ping")} value={(livePing ?? server.ping) != null ? `${livePing ?? server.ping} ms` : "Unknown"} />
                    </div>
                )}

                {!server && loading && <div className="vc-voice-server-info-loading">{t("Looking up the voice relay...")}</div>}

                <div className="vc-voice-server-info-actions">
                    <Button size="small" variant="secondary" disabled={loading} onClick={() => void refresh()}>
                        {loading ? "Refreshing..." : "Refresh"}
                    </Button>
                    <Button
                        size="small"
                        variant="primary"
                        disabled={!server}
                        onClick={() => server && void copyWithToast(server.info.ip, "Voice server IP copied.")}
                    >
                        {t("Copy IP")}</Button>
                </div>
            </div>
        </Modal>
    );
}

export function VoiceServerIcon({ width = 20, height = 20, className }: SVGProps<SVGSVGElement>) {
    return (
        <svg className={className} width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
            <rect x="3" y="14" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}
