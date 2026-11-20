/*
 * Endcord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, MediaEngineStore, showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";

import type { VoiceRecorder } from ".";
import { settings } from "./settings";

const OGG_OPUS = "audio/ogg; codecs=opus";

function stopStream(stream: MediaStream | null | undefined) {
    stream?.getTracks().forEach(track => track.stop());
}

export const VoiceRecorderWeb: VoiceRecorder = ({ setAudioBlob, onRecordingChange }) => {
    const [recording, setRecording] = useState(false);
    const [paused, setPaused] = useState(false);
    const [recorder, setRecorder] = useState<MediaRecorder>();
    const [chunks, setChunks] = useState<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const mountedRef = useRef(true);

    // Closing the modal mid-recording would otherwise leave the microphone open
    useEffect(() => () => {
        mountedRef.current = false;
        if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
        stopStream(streamRef.current);
        streamRef.current = recorderRef.current = null;
    }, []);

    const changeRecording = (recording: boolean) => {
        setRecording(recording);
        onRecordingChange?.(recording);
    };

    function toggleRecording() {
        const nowRecording = !recording;

        if (nowRecording) {
            if (streamRef.current) return;
            navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: settings.store.echoCancellation,
                    noiseSuppression: settings.store.noiseSuppression,
                    deviceId: MediaEngineStore.getInputDeviceId()
                }
            }).then(stream => {
                if (!mountedRef.current || streamRef.current) {
                    stopStream(stream);
                    return;
                }
                streamRef.current = stream;

                const chunks = [] as Blob[];
                setChunks(chunks);

                // Where OggOpus can't be recorded the browser's default (WebM) is used, and the blob says so
                const recorder = MediaRecorder.isTypeSupported(OGG_OPUS)
                    ? new MediaRecorder(stream, { mimeType: OGG_OPUS })
                    : new MediaRecorder(stream);
                setRecorder(recorder);
                recorderRef.current = recorder;
                recorder.addEventListener("dataavailable", e => {
                    chunks.push(e.data);
                });
                recorder.start();

                changeRecording(true);
            }).catch(err => {
                showToast(`Couldn't use the microphone: ${err?.message || err}`, Toasts.Type.FAILURE);
            });
        } else if (recorder) {
            recorder.addEventListener("stop", () => {
                stopStream(streamRef.current);
                streamRef.current = recorderRef.current = null;
                if (!mountedRef.current) return;
                setAudioBlob(new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || OGG_OPUS }));
                changeRecording(false);
            });
            recorder.stop();
        }
    }

    return (
        <>
            <Button onClick={toggleRecording}>
                {recording ? "Stop" : "Start"} recording
            </Button>

            <Button
                disabled={!recording}
                onClick={() => {
                    setPaused(!paused);
                    if (paused) recorder?.resume();
                    else recorder?.pause();
                }}
            >
                {paused ? "Resume" : "Pause"} recording
            </Button>
        </>
    );
};
