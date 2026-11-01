/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { sleep } from "@utils/misc";
import { showItemInFolder } from "@utils/native";
import definePlugin, { OptionType, type PluginNative } from "@utils/types";
import { MediaEngineStore, UserStore, VoiceStateStore } from "@webpack/common";

const logger = new Logger("CallRecorder");
const Native = EndcordNative.pluginHelpers.RecordUrMic as PluginNative<typeof import("./native")>;

const settings = definePluginSettings({
    autoStart: {
        type: OptionType.BOOLEAN,
        description: "Auto-start recording on VC join (captures your mic)",
        default: true,
    },
    outputFolder: {
        type: OptionType.STRING,
        description: "Output folder (full path). Leave empty for Downloads.",
        default: "",
    },
    lastSavedFile: {
        type: OptionType.STRING,
        description: "Last saved recording path.",
        default: "",
    },
});

let isRecording = false;
let isStopping = false;
let discordVoiceModule: any = null;

function getFileName() {
    const formatted = new Date().toISOString().replace(/:/g, "-").replace(/\..+$/, "");
    return `call-${formatted}.ogg`;
}

async function saveRecordingFile(sourcePath: string) {
    // Left empty, the main process saves to Downloads
    const folder = settings.store.outputFolder.trim();
    try {
        await sleep(300);
        const fileData = await Native.readRecording(sourcePath);
        if (!fileData || !fileData.length) {
            logger.error("Empty recording");
            showNotification({ title: "CallRecorder", body: "Empty recording." });
            return;
        }
        logger.info("Recording:", fileData.length, "bytes");
        const filePath = await Native.saveRecording(fileData.buffer, folder, getFileName());
        settings.store.lastSavedFile = filePath;
        logger.info("Saved:", filePath);
        showNotification({ title: "CallRecorder", body: `Saved to ${filePath}` });
        showItemInFolder(filePath);
    } catch (error) {
        logger.error("Save failed", error);
        showNotification({ title: "CallRecorder", body: "Failed to save." });
    }
}

async function startRecording() {
    if (isRecording || isStopping) return;
    logger.info("Starting recording...");

    isRecording = true;

    try {
        discordVoiceModule = (window as any).DiscordNative?.nativeModules?.requireModule?.("discord_voice");

        if (!discordVoiceModule) {
            throw new Error("Discord voice module not available. Join a voice channel first.");
        }

        const deviceId = MediaEngineStore.getInputDeviceId();
        logger.info("Starting native recording, device:", deviceId);

        await new Promise<void>(resolve => {
            discordVoiceModule.startLocalAudioRecording(
                {
                    echoCancellation: false,
                    noiseCancellation: false,
                    autoGainControl: false,
                    deviceId: deviceId || undefined,
                },
                success => {
                    logger.info("Native recording started:", success);
                    resolve();
                }
            );
        });

        logger.info("Recording started");
        showNotification({ title: "CallRecorder", body: "Recording your microphone" });
    } catch (error: any) {
        logger.error("Start failed:", error);
        showNotification({ title: "CallRecorder", body: error.message || "Failed to start" });
        isRecording = false;
    }
}

function stopRecording() {
    if (!isRecording && !isStopping) return;
    if (isStopping) return;

    logger.info("Stopping recording...");
    isStopping = true;

    if (discordVoiceModule) {
        discordVoiceModule.stopLocalAudioRecording(filePath => {
            logger.info("Native stopped, file:", filePath);
            void saveRecordingFile(filePath);
            isRecording = false;
            isStopping = false;
        });
    } else {
        isRecording = false;
        isStopping = false;
    }
}

export default definePlugin({
    name: "RecordUrMic",
    description: "Records your microphone in voice channels, i coudnt make it record others' voices too, so im leaving it for whoever wants to hear what they were saying in vc.",
    tags: ["Voice", "Utility"],
    authors: [Devs.rootpoi, Devs.kraethis, Devs.ewlle],
    native: true,
    settings,
    flux: {
        VOICE_STATE_UPDATES() {
            const user = UserStore.getCurrentUser();
            if (!user) return;
            const state = VoiceStateStore.getVoiceStateForUser(user.id);
            const inVoice = !!state?.channelId;

            if (inVoice && !isRecording && settings.store.autoStart) {
                void startRecording();
            }
            if (!inVoice && (isRecording || isStopping)) {
                stopRecording();
            }
        },
    },
    start() { },
    stop() { stopRecording(); },
});
