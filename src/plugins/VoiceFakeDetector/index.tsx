/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { useForceUpdater } from "@utils/react";
import definePlugin, { OptionType } from "@utils/types";
import { User } from "@vencord/discord-types";
import { FluxDispatcher, React, SelectedChannelStore, Tooltip, UserStore, VoiceStateStore } from "@webpack/common";

interface FakeState {
    mute: boolean;
    deaf: boolean;
    video?: boolean;
}

const caught = new Map<string, FakeState>();
const updaters = new Set<() => void>();

function rerender() {
    updaters.forEach(update => update());
}

function label({ mute, deaf, video }: FakeState) {
    if (mute && deaf) return "Faking mute & deafen";
    if (deaf) return "Faking deafen";
    if (mute) return "Faking mute";
    return video ? "Faking camera" : "Faking voice state";
}

function announce(userId: string, state: FakeState) {
    if (!settings.store.notify) return;
    const user = UserStore.getUser(userId);
    const name = user?.globalName ?? user?.username ?? "Someone";
    showNotification({
        title: "FakeVoice caught",
        body: `${name} is ${label(state).toLowerCase()} but still talking.`,
        icon: user?.getAvatarURL?.(),
        color: "#ff5fa6"
    });
}

function mark(userId: string, state: FakeState) {
    const prev = caught.get(userId);
    if (prev && prev.mute === state.mute && prev.deaf === state.deaf && prev.video === state.video) return;
    caught.set(userId, state);
    if (!prev) announce(userId, state);
    rerender();
}

function clear(userId: string) {
    if (caught.delete(userId)) rerender();
}

const SPEAKING_VOICE = 1 << 0;
// fresh mute/deafen state can race with the last audio packets, so ignore speaking right after a change
const GRACE_MS = 1500;
const lastChange = new Map<string, number>();

// Detection works for any fake voice tool, not just ours: they all only lie in the voice state
// they send to Discord and keep the real audio stream open, so the audio gives them away.
function onSpeaking({ userId, speakingFlags }: { userId: string; speakingFlags: number; }) {
    if (!(speakingFlags & SPEAKING_VOICE) || userId === UserStore.getCurrentUser()?.id) return;
    if (Date.now() - (lastChange.get(userId) ?? 0) < GRACE_MS) return;

    const voiceState = VoiceStateStore.getVoiceStateForUser(userId);
    // server mute/deafen is enforced by Discord itself, so only self states can be faked
    if (!voiceState?.channelId || voiceState.mute || voiceState.suppress) return;

    if (voiceState.selfMute || voiceState.selfDeaf)
        mark(userId, { mute: !!voiceState.selfMute, deaf: !!voiceState.selfDeaf, video: caught.get(userId)?.video });
}

// A fake camera shows the camera icon without ever sending a video stream. The media connection
// reports every real incoming stream, and it only does that while we're in the same channel.
const realVideo = new Set<string>();
const videoTimers = new Map<string, ReturnType<typeof setTimeout>>();

function onVideo({ userId, streamId, context }: { userId: string; streamId?: string | null; context?: string; }) {
    if (context !== "default") return;
    if (streamId) realVideo.add(userId);
    else realVideo.delete(userId);
    if (streamId && caught.get(userId)?.video) clear(userId);
}

function checkFakeVideo(userId: string) {
    const voiceState = VoiceStateStore.getVoiceStateForUser(userId);
    const myChannel = SelectedChannelStore.getVoiceChannelId();
    if (!voiceState?.selfVideo || voiceState.channelId !== myChannel || realVideo.has(userId)) return;
    const prev = caught.get(userId);
    mark(userId, { mute: !!prev?.mute, deaf: !!prev?.deaf, video: true });
}

function onVoiceStateUpdates({ voiceStates }: { voiceStates: Array<{ userId: string; channelId?: string | null; selfMute?: boolean; selfDeaf?: boolean; selfVideo?: boolean; }>; }) {
    const meId = UserStore.getCurrentUser()?.id;
    for (const voiceState of voiceStates) {
        const { userId } = voiceState;
        if (userId === meId) continue;
        lastChange.set(userId, Date.now());

        clearTimeout(videoTimers.get(userId));
        if (settings.store.fakeCamera && voiceState.channelId && voiceState.selfVideo)
            videoTimers.set(userId, setTimeout(() => checkFakeVideo(userId), 10_000));

        const prev = caught.get(userId);
        if (!prev) continue;

        const state = {
            mute: prev.mute && !!voiceState.selfMute,
            deaf: prev.deaf && !!voiceState.selfDeaf,
            video: prev.video && !!voiceState.selfVideo
        };
        if (!voiceState.channelId || (!state.mute && !state.deaf && !state.video)) clear(userId);
        else mark(userId, state);
    }
}

function FakeIndicator({ userId, small }: { userId: string; small?: boolean; }) {
    const update = useForceUpdater();

    React.useEffect(() => {
        updaters.add(update);
        return () => void updaters.delete(update);
    }, [update]);

    const state = caught.get(userId);
    if (!state) return null;

    const size = small ? 16 : 18;

    return (
        <Tooltip text={label(state)}>
            {props => (
                <svg
                    {...props}
                    className="tc-fakevoice-indicator"
                    width={size}
                    height={size}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-label={label(state)}
                >
                    <path d="M12 2C7.58 2 4 5.58 4 10v10.4c0 .53.64.8 1.02.42l1.6-1.6a.6.6 0 0 1 .85 0l1.45 1.45c.23.24.62.24.85 0l1.45-1.45a.6.6 0 0 1 .85 0l1.45 1.45c.24.24.62.24.86 0l1.44-1.45a.6.6 0 0 1 .86 0l1.6 1.6c.37.38 1.01.11 1.01-.42V10c0-4.42-3.58-8-8-8Z" />
                    <circle cx="9" cy="10.5" r="1.4" fill="#1a0e14" />
                    <circle cx="15" cy="10.5" r="1.4" fill="#1a0e14" />
                </svg>
            )}
        </Tooltip>
    );
}

const settings = definePluginSettings({
    voiceRows: {
        type: OptionType.BOOLEAN,
        description: "Show the indicator in voice channel user lists",
        default: true,
        restartNeeded: true
    },
    memberList: {
        type: OptionType.BOOLEAN,
        description: "Show the indicator next to names in the member list",
        default: true
    },
    profiles: {
        type: OptionType.BOOLEAN,
        description: "Show the indicator in user profiles",
        default: true
    },
    fakeCamera: {
        type: OptionType.BOOLEAN,
        description: "Also flag people who show a camera icon but never send video. Can misfire if you have incoming video turned off or a very slow connection.",
        default: false
    },
    notify: {
        type: OptionType.BOOLEAN,
        description: "Send a notification the first time someone is caught faking",
        default: true
    }
});

export default definePlugin({
    name: "VoiceFakeDetector",
    description: "Flags people in your voice channel who fake their voice state with any client mod: shown as muted or deafened but still talking, or showing a camera icon without sending video. The mark clears when they leave or genuinely unmute.",
    authors: [Devs.ewlle, Devs.kraethis, Devs.Sharp],
    dependencies: ["MemberListDecoratorsAPI", "NicknameIconsAPI"],
    tags: ["Voice", "Utility"],
    settings,

    patches: [
        {
            find: "#{intl::GUEST_NAME_SUFFIX})]",
            predicate: () => settings.store.voiceRows,
            replacement: {
                match: /(getName\((\i)\).{0,140}?#{intl::GUEST_NAME_SUFFIX}\)\]\}\):"")\]/,
                replace: "$1,$self.renderVoiceRow($2?.id)]"
            }
        }
    ],

    renderVoiceRow: (userId?: string) =>
        userId ? <FakeIndicator userId={userId} small /> : null,

    renderMemberListDecorator: ({ user }: { user?: User; }) =>
        settings.store.memberList && user ? <FakeIndicator userId={user.id} small /> : null,

    renderNicknameIcon: ({ userId }: { userId: string; }) =>
        settings.store.profiles ? <FakeIndicator userId={userId} /> : null,

    start() {
        FluxDispatcher.subscribe("SPEAKING", onSpeaking);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoiceStateUpdates);
        FluxDispatcher.subscribe("RTC_CONNECTION_VIDEO", onVideo);
    },

    stop() {
        FluxDispatcher.unsubscribe("SPEAKING", onSpeaking);
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoiceStateUpdates);
        FluxDispatcher.unsubscribe("RTC_CONNECTION_VIDEO", onVideo);
        videoTimers.forEach(clearTimeout);
        videoTimers.clear();
        realVideo.clear();
        lastChange.clear();
        caught.clear();
        rerender();
    }
});
