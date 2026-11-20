/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";
import { Button, MediaEngineStore, showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";

import type { VoiceRecorder } from ".";
import { settings } from "./settings";

const Native = EndcordNative.pluginHelpers.VoiceMessages as PluginNative<typeof import("./native")>;

export const VoiceRecorderDesktop: VoiceRecorder = ({ setAudioBlob, onRecordingChange }) => {
    const [recording, setRecording] = useState(false);
    const recordingRef = useRef(false);

    // Closing the modal mid-recording would otherwise keep recording the microphone into Discord's folder
    useEffect(() => () => {
        if (!recordingRef.current) return;
        recordingRef.current = false;
        DiscordNative.nativeModules.requireModule("discord_voice").stopLocalAudioRecording((filePath: string) => {
            if (filePath) Native.discardRecording(filePath);
        });
    }, []);

    const changeRecording = (recording: boolean) => {
        recordingRef.current = recording;
        setRecording(recording);
        onRecordingChange?.(recording);
    };

    function toggleRecording() {
        const discordVoice = DiscordNative.nativeModules.requireModule("discord_voice");
        const nowRecording = !recording;

        if (nowRecording) {
            discordVoice.startLocalAudioRecording(
                {
                    echoCancellation: settings.store.echoCancellation,
                    noiseCancellation: settings.store.noiseSuppression,
                    deviceId: MediaEngineStore.getInputDeviceId(),
                },
                (success: boolean) => {
                    if (success)
                        changeRecording(true);
                    else
                        showToast("Failed to start recording", Toasts.Type.FAILURE);
                }
            );
        } else {
            recordingRef.current = false;
            discordVoice.stopLocalAudioRecording(async (filePath: string) => {
                if (filePath) {
                    const buf = await Native.readRecording(filePath);
                    if (buf)
                        setAudioBlob(new Blob([buf], { type: "audio/ogg; codecs=opus" }));
                    else
                        showToast("Failed to finish recording", Toasts.Type.FAILURE);
                }
                changeRecording(false);
            });
        }
    }

    return (
        <Button onClick={toggleRecording}>
            {recording ? "Stop" : "Start"} recording
        </Button>
    );
};
