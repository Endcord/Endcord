/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { EndcordDevs } from "@utils/constants";
import definePlugin, { IconComponent } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { MediaEngineStore, React, useState } from "@webpack/common";

const VoiceActions = findByPropsLazy("toggleSelfMute");

let fakeMuteActive = false;

function getConnections(engine: any): any[] {
    if (!engine?.connections) return [];
    if (Array.isArray(engine.connections)) return engine.connections;
    if (engine.connections instanceof Set) return Array.from(engine.connections);
    if (engine.connections instanceof Map) return Array.from(engine.connections.values());
    if (typeof engine.connections === "object") return Object.values(engine.connections);
    return [];
}

function patchConnection(conn: any) {
    if (!conn) return;
    try {
        const proto = Object.getPrototypeOf(conn);
        if (proto && typeof proto.setSelfMute === "function" && !proto.__fakeMuteHooked) {
            proto.__fakeMuteHooked = true;
            const origSetSelfMute = proto.setSelfMute;
            proto.setSelfMute = function (mute: boolean, ...args: any[]) {
                if (fakeMuteActive && mute) return;
                return origSetSelfMute.call(this, mute, ...args);
            };
        }
        if (typeof conn.setSelfMute === "function" && !conn.__fakeMuteOriginal) {
            conn.__fakeMuteOriginal = conn.setSelfMute;
            conn.setSelfMute = function (mute: boolean, ...args: any[]) {
                if (fakeMuteActive && mute) return;
                return conn.__fakeMuteOriginal.call(this, mute, ...args);
            };
        }
    } catch { }
}

function hookEngine(engine: any) {
    if (!engine || engine.__fakeMuteEngineHooked) return;
    engine.__fakeMuteEngineHooked = true;
    if (typeof engine.connect === "function") {
        const origConnect = engine.connect.bind(engine);
        engine.connect = function (...args: any[]) {
            const conn = origConnect(...args);
            if (conn) patchConnection(conn);
            return conn;
        };
    }
}

function ensurePatched() {
    try {
        const engine = (MediaEngineStore as any).getMediaEngine?.();
        if (!engine) return;
        hookEngine(engine);
        for (const conn of getConnections(engine)) {
            patchConnection(conn);
        }
    } catch { }
}

function setFakeMute(value: boolean) {
    fakeMuteActive = value;
    ensurePatched();

    const isMuted = (MediaEngineStore as any).isSelfMute?.() ?? false;
    if (value && !isMuted) {
        VoiceActions.toggleSelfMute();
    } else if (!value && isMuted) {
        VoiceActions.toggleSelfMute();
    }
}

const MuteIcon: IconComponent = ({ height = 20, width = 20, className, style }) => (
    <svg width={width} height={height} className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
        <path d="M6.7 11H5C5 15.08 7.96 18.44 12 18.93V21H9V23H15V21H13V18.93C17.04 18.44 20 15.09 20 11H18.3C18.3 14.48 15.74 17.3 12 17.3C8.26 17.3 5.7 14.48 5.7 11H6.7ZM12 1C9.24 1 7 3.24 7 6V11C7 13.76 9.24 16 12 16C14.76 16 17 13.76 17 11V6C17 3.24 14.76 1 12 1Z" />
        <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
);

function FakeMuteUserAreaButton({ iconForeground, hideTooltips, nameplate }: UserAreaRenderProps) {
    const [active, setActive] = useState(fakeMuteActive);

    return (
        <UserAreaButton
            tooltipText={hideTooltips ? void 0 : active ? "Disable Fake Mute" : "Enable Fake Mute (appear muted)"}
            icon={<MuteIcon className={iconForeground} style={{ color: active ? "var(--status-danger)" : "currentColor" }} />}
            role="switch"
            aria-checked={active}
            redGlow={active}
            plated={nameplate != null}
            onClick={() => {
                const next = !active;
                setActive(next);
                setFakeMute(next);
            }}
        />
    );
}

const FakeMuteButton: ChatBarButtonFactory = () => {
    const [active, setActive] = useState(fakeMuteActive);

    return (
        <ChatBarButton
            tooltip={active ? "Fake Mute: ON (click to disable)" : "Fake Mute: OFF (appear muted without muting)"}
            onClick={() => {
                const next = !active;
                setActive(next);
                setFakeMute(next);
            }}
        >
            <MuteIcon style={{ color: active ? "var(--status-danger)" : "currentColor" }} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "FakeMute",
    description: "Appear muted to others in voice channels while keeping your microphone active. Toggle from user panel or chat bar.",
    authors: [EndcordDevs.ewlle, EndcordDevs.rootpoi, EndcordDevs.kraethis],
    tags: ["Voice", "Utility", "Popular"],
    dependencies: ["ChatInputButtonAPI", "UserAreaAPI"],

    userAreaButton: {
        icon: (props: { className?: string; }) => <MuteIcon {...props} />,
        render: FakeMuteUserAreaButton
    },

    chatBarButton: {
        icon: () => <MuteIcon /> as any,
        render: FakeMuteButton as any,
    },

    stop() {
        if (fakeMuteActive) setFakeMute(false);
    },
});
