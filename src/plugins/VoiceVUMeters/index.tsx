/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Based on Kurtzon Audio's VoiceVUMeters as shipped in Kurtcord 2.7.5. Adds a level
 * source for Discord Desktop using participant PCM from the native stereo bridge,
 * and re-targets the voice list patch at the current client.
 */

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { makeRange, OptionType } from "@utils/types";
import { MediaEngineStore, React, SelectedChannelStore, UserStore, VoiceStateStore } from "@webpack/common";

import meterStyle from "./style.css?managed";

const logger = new Logger("VoiceVUMeters");

const POLL_MS = 100;
// Subscriber sync is structural only (meters created or dropped, source and
// mono flips). Level values ride the rAF loop and never touch React.
const NOTIFY_MS = 500;
const SCAN_MS = 500;
// Stats are the desktop fallback level source, polled only while a meter draws from them (see statsPollMs)
const STATS_MS = 250;
// Stats cadence when only the self-tap mismatch guard needs them
const SELF_STATS_MS = 1000;
// Stats cadence for stream meters alone. getStats runs on the renderer main
// thread and took 9ms to 8s per call here, so stream meters poll sparsely.
const STREAM_STATS_MS = 2000;
// A flagged speaker with no bridge level for this long falls back to stats.
// Shorter gaps are the speaking hangover or the first frames after a flip.
const NATIVE_GAP_MS = 500;
// Raw (unsmoothed, normalized) level that counts a participant as audibly active, and how long it
// holds. The glow reads this instead of the smoothed bar so it starts with the first audio and ends promptly.
const ACTIVE_LEVEL = 0.05;
const ACTIVE_HOLD_MS = 200;
const HOLD_MS = 1500;
// Visual ballistics, advanced per frame from timestamps.
const ATTACK_MS = 25;
const RELEASE_MS = 120;
const PEAK_FALL_DB_PER_SECOND = 12;
// Self-tap/outbound mismatch guard: the self tap reads the OS device before
// Discord processing, so bleed Discord removes downstream (echo cancellation,
// noise suppression) still pins it. Raw must stay this loud (normalized) while
// outbound stays this quiet (linear) for SELF_MISMATCH_HOLD_MS before the tap
// is dropped in favor of outbound levels.
const SELF_MISMATCH_HOLD_MS = 5000;
const SELF_MISMATCH_RAW_FLOOR = 0.5;
const SELF_MISMATCH_OUTBOUND_CEILING = 0.02;
const SELF_MISMATCH_RETRY_MS = 30000;
const STREAM_RELEASE_MS = 3000;
const BAR_HEIGHT = 18;
const BAR_WIDTH = 4;
const GRADIENT = "linear-gradient(to top, #21c55d 0%, #21c55d 50%, #eab308 75%, #ef4444 100%)";

interface AudioOutput {
    id: string;
    stream: MediaStream;
}

interface VoiceConnection {
    context: string;
    // Web clients (browser, Vesktop): one WebAudio stream per remote user.
    outputs?: Record<string, AudioOutput>;
    audioContext?: AudioContext;
    // Discord Desktop: native PCM bridge, with scalar stats as a fallback.
    localSpeakingFlags?: Record<string, number>;
    localPans?: Record<string, { left: number; right: number; }>;
    // Go live streams ride their own connection: it names the streamer and
    // carries the soundshare on its outbound when the stream has audio.
    soundshareActive?: boolean;
    streamUserId?: string;
    getStats?: () => Promise<any>;
    getUserIdBySsrc?: (ssrc: number) => string | null | undefined;
}

interface WebTap {
    output: AudioOutput;
    source: MediaStreamAudioSourceNode;
    splitter: ChannelSplitterNode;
    left: AnalyserNode;
    right: AnalyserNode;
    silent: GainNode;
    bufLeft: Float32Array<ArrayBuffer>;
    bufRight: Float32Array<ArrayBuffer>;
}

interface NativeLevel {
    userId: string;
    ageMs: number;
    channels: number;
    rmsLeft: number;
    rmsRight: number;
    peakLeft: number;
    peakRight: number;
}

interface ParticipantBridge {
    getParticipantStereoLevels(): { installed: boolean; connection: number; levels: NativeLevel[]; };
}

interface Meter {
    tap?: WebTap;
    amplitude: number;
    native?: NativeLevel;
    nativeAvailable?: boolean;
    nativeMissAt?: number;
    nativeGap?: boolean;
    activeUntil?: number;
    mono: boolean;
    display: [number, number];
    peak: [number, number];
    peakAt: [number, number];
    sampleAt: [number, number];
    ownsInput?: boolean;
    inputContext?: AudioContext;
    mismatchSince?: number;
    lastStreamAt?: number;
}

const meters = new Map<string, Meter>();
const subscribers = new Set<() => void>();
// Remembered SSRC resolutions; getUserIdBySsrc can miss for a while in packed calls.
const ssrcUserCache = new Map<number, string>();

let connection: VoiceConnection | null = null;
let intervalId: ReturnType<typeof setInterval> | undefined;
let lastScanAt = 0;
let lastNotifyAt = 0;
let lastMeterCount = 0;
let lastStatsAt = 0;
let statsInFlight = false;
let statsFailed = false;
let inputPending = false;
let inputGeneration = 0;
let inputKey = "";
let inputRetryAt = 0;
let participantBridge: ParticipantBridge | undefined;
let bridgeChecked = false;
let selfOutboundLinear = 0;
let inputMismatchDrops = 0;
let inputSuspendKey: string | null = null;

// Mounted meter DOM, driven by one requestAnimationFrame loop that writes
// transforms straight to refs, so levels never re-render React. A user can have
// several meters mounted (list row, call tile, popout), and Discord re-parents
// voice rows constantly, so the registry holds a set per user.
interface MeterDom {
    root: HTMLElement;
    fills: [HTMLElement, HTMLElement];
    peaks: [HTMLElement | null, HTMLElement | null];
    colors: [string, string];
    lastFill: [string, string];
    lastPeak: [string, string];
    lastPeakOpacity: [string, string];
    height: number;
}

const meterDoms = new Map<string, Set<MeterDom>>();
const meterDomByRoot = new WeakMap<HTMLElement, MeterDom>();
let frameId: number | undefined;
let domResize: ResizeObserver | undefined;

// Live counters for diagnostics over the CDP port
const debugState = (globalThis as { __vumDebug?: Record<string, number>; }).__vumDebug ??= {};

// The loop stays parked while nothing is mounted or the tab is hidden
function ensureFrameLoop() {
    if (frameId === undefined && meterDoms.size && meters.size && !document.hidden) {
        frameId = requestAnimationFrame(frameTick);
    }
}

function parkFrameLoop() {
    if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
        frameId = undefined;
    }
}

function onVisibilityChange() {
    if (document.hidden) parkFrameLoop();
    else ensureFrameLoop();
}

function peakColor(peak: number) {
    return peak > 0.995 ? "#ef4444" : peak > 0.916 ? "#ffa500" : "#d3d3d3";
}

function writeMeterDom(meter: Meter, dom: MeterDom) {
    const { showPeak } = settings.store;
    const peakRange = Math.max(0, dom.height - 2);
    for (let channel = 0; channel < 2; channel++) {
        // skip unchanged writes so a silent call causes no style churn
        const fill = dom.fills[channel];
        if (fill) {
            const transform = `translateY(${((1 - meter.display[channel]) * 100).toFixed(2)}%)`;
            if (dom.lastFill[channel] !== transform) {
                dom.lastFill[channel] = transform;
                fill.style.transform = transform;
            }
        }
        const peakLine = dom.peaks[channel];
        if (showPeak && peakLine) {
            const shown = meter.peak[channel] > 0.01;
            const transform = `translateY(${(shown ? (1 - meter.peak[channel]) * peakRange : peakRange + 2).toFixed(1)}px)`;
            if (dom.lastPeak[channel] !== transform) {
                dom.lastPeak[channel] = transform;
                peakLine.style.transform = transform;
            }
            const opacity = shown ? "1" : "0";
            if (dom.lastPeakOpacity[channel] !== opacity) {
                dom.lastPeakOpacity[channel] = opacity;
                peakLine.style.opacity = opacity;
            }
            const color = peakColor(meter.peak[channel]);
            if (dom.colors[channel] !== color) {
                dom.colors[channel] = color;
                peakLine.style.background = color;
            }
        }
    }
}

const settings = definePluginSettings({
    floorDb: {
        type: OptionType.SLIDER,
        description: "Bottom of the meter scale in dB. -60 matches SonoBus; raise it to make quiet talkers move the meter more.",
        markers: [-80, -70, -60, -50, -40, -30, -20],
        default: -60,
        stickToMarkers: true
    },
    showPeak: {
        type: OptionType.BOOLEAN,
        description: "Show the peak hold line on each bar.",
        default: true
    },
    showSelf: {
        type: OptionType.BOOLEAN,
        description: "Show a meter for your selected microphone input on Discord Desktop.",
        default: true,
        onChange() {
            lastScanAt = 0;
        }
    },
    tileSurfaces: {
        type: OptionType.SELECT,
        description: "Which call tiles show VU meters. Screen share tiles meter the stream's own audio and show nothing while it has none.",
        options: [
            {
                label: "Voice profiles only",
                value: "voice"
            },
            {
                label: "Screen shares only",
                value: "streams"
            },
            {
                label: "Both",
                value: "both",
                default: true
            }
        ]
    },
    tilePlacement: {
        type: OptionType.SELECT,
        description: "Where the meter sits on call tiles. Profile picture pins it to the bottom right corner of the user's avatar, so it stays on the picture when tile backgrounds are hidden.",
        options: [
            {
                label: "Background",
                value: "background",
                default: true
            },
            {
                label: "Profile picture",
                value: "avatar"
            }
        ]
    },
    tileMeterSide: {
        type: OptionType.SELECT,
        description: "Which side of the tile anchors the meter, for both the background position and the profile picture. The meter always sits centered vertically so it clears the strip and the labels.",
        options: [
            {
                label: "Right",
                value: "right",
                default: true
            },
            {
                label: "Left",
                value: "left"
            }
        ]
    },
    tileMeterHeight: {
        type: OptionType.SLIDER,
        description: "Tile meter height as a percent of the tile height. 50 is the default height.",
        markers: makeRange(25, 100, 5),
        default: 50,
        stickToMarkers: true
    }
}).withPrivateSettings<{ peakHoldEnabled?: boolean; }>();

function getConnection(): VoiceConnection | null {
    const engine = MediaEngineStore.getMediaEngine();
    if (!engine?.connections) return null;

    for (const conn of engine.connections as Iterable<VoiceConnection>) {
        if (conn?.context === "default") return conn;
    }

    return null;
}

function isWebConnection(conn: VoiceConnection) {
    return conn.audioContext != null && conn.outputs != null;
}

function newMeter(mono: boolean, tap?: WebTap): Meter {
    return { tap, amplitude: 0, mono, display: [0, 0], peak: [0, 0], peakAt: [0, 0], sampleAt: [0, 0] };
}

function channelCount(output: AudioOutput) {
    return output.stream.getAudioTracks()[0]?.getSettings?.().channelCount ?? 0;
}

function createWebMeter(conn: VoiceConnection, userId: string) {
    const output = conn.outputs![userId];
    if (!output?.stream?.getAudioTracks().length) return;

    const context = conn.audioContext!;
    const source = context.createMediaStreamSource(output.stream);
    const splitter = context.createChannelSplitter(2);
    const left = context.createAnalyser();
    const right = context.createAnalyser();
    left.fftSize = 1024;
    right.fftSize = 1024;
    left.smoothingTimeConstant = 0;
    right.smoothingTimeConstant = 0;

    const silent = context.createGain();
    silent.gain.value = 0;

    source.connect(splitter);
    splitter.connect(left, 0);
    splitter.connect(right, 1);
    left.connect(silent);
    right.connect(silent);
    silent.connect(context.destination);

    meters.set(userId, newMeter(channelCount(output) === 1, {
        output,
        source,
        splitter,
        left,
        right,
        silent,
        bufLeft: new Float32Array(left.fftSize),
        bufRight: new Float32Array(right.fftSize)
    }));
}

function dropMeter(userId: string) {
    const meter = meters.get(userId);
    if (!meter) return;

    meters.delete(userId);
    if (!meter.tap) return;

    if (meter.ownsInput) {
        meter.tap.output.stream.getTracks().forEach(track => track.stop());
        void meter.inputContext?.close();
        inputKey = "";
    }

    try {
        meter.tap.source.disconnect();
        meter.tap.splitter.disconnect();
        meter.tap.left.disconnect();
        meter.tap.right.disconnect();
        meter.tap.silent.disconnect();
    } catch (e) {
        logger.error("failed to release a meter", e);
    }
}

function dropAll() {
    inputGeneration++;
    ssrcUserCache.clear();
    for (const userId of [...meters.keys()]) dropMeter(userId);
}

async function syncSelfInput(conn: VoiceConnection) {
    const userId = UserStore.getCurrentUser()?.id;
    const deviceKey = MediaEngineStore.getInputDeviceId();
    if (!userId) return;
    if (!settings.store.showSelf) {
        inputSuspendKey = null;
        return;
    }
    if (inputKey === deviceKey && meters.get(userId)?.ownsInput) return;
    if (inputSuspendKey != null && inputSuspendKey === deviceKey) return;
    if (inputPending || Date.now() < inputRetryAt) return;

    dropMeter(userId);
    meters.set(userId, newMeter(true));
    const generation = inputGeneration;
    inputPending = true;
    let stream: MediaStream | undefined;
    let audioContext: AudioContext | undefined;
    let adopted = false;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(device => device.kind === "audioinput");
        const engine = MediaEngineStore.getMediaEngine() as {
            getAudioInputDevices(): Promise<Array<{ id: string; originalId?: string; name: string; }>>;
        };
        const nativeInputs = await engine.getAudioInputDevices();
        const selected = nativeInputs.find(device => device.id === deviceKey || device.originalId === deviceKey);
        const device = inputs.find(input => input.deviceId === deviceKey || input.deviceId === selected?.originalId)
            ?? inputs.find(input => input.label === selected?.name);
        const id = device?.deviceId ?? (deviceKey === "default" ? "default" : null);
        if (!id) throw new Error("Selected Discord input cannot be matched to an audio capture device.");
        stream = await navigator.mediaDevices.getUserMedia({ audio: {
            deviceId: { exact: id }, channelCount: { ideal: 2 },
            echoCancellation: false, noiseSuppression: false, autoGainControl: false
        }, video: false });
        if (generation !== inputGeneration || conn !== connection || !settings.store.showSelf || deviceKey !== MediaEngineStore.getInputDeviceId()) {
            return;
        }
        audioContext = new AudioContext();
        await audioContext.resume();
        if (generation !== inputGeneration || conn !== connection || !settings.store.showSelf || deviceKey !== MediaEngineStore.getInputDeviceId()) return;
        createWebMeter({ context: "input-meter", audioContext, outputs: { [userId]: { id: userId, stream } } }, userId);
        const meter = meters.get(userId);
        if (meter) {
            meter.ownsInput = true;
            meter.inputContext = audioContext;
            adopted = true;
            inputMismatchDrops = 0;
            inputSuspendKey = null;
        }
        inputKey = deviceKey;
    } catch (error) {
        logger.error("Cannot measure selected input channels", error);
        inputRetryAt = Date.now() + 30000;
    } finally {
        if (!adopted) {
            stream?.getTracks().forEach(track => track.stop());
            void audioContext?.close();
        }
        inputPending = false;
    }
}

function syncWebMeters(conn: VoiceConnection) {
    const outputs = conn.outputs!;

    for (const userId of Object.keys(outputs)) {
        const meter = meters.get(userId);
        if (!meter?.tap || meter.tap.output !== outputs[userId]) {
            dropMeter(userId);
            createWebMeter(conn, userId);
        } else {
            meter.mono = channelCount(outputs[userId]) === 1;
        }
    }

    for (const userId of [...meters.keys()]) {
        if (!outputs[userId]) dropMeter(userId);
    }
}

// Desktop: one meter for everyone in your voice channel, so silent users still get an empty bar.
function syncDesktopMeters() {
    const channelId = SelectedChannelStore.getVoiceChannelId();
    const members = new Set(channelId ? Object.keys(VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {}) : []);

    const me = UserStore.getCurrentUser()?.id;
    if (me && !settings.store.showSelf) members.delete(me);

    for (const userId of members) {
        const meter = meters.get(userId);
        if (!meter || (meter.tap && !meter.ownsInput)) {
            dropMeter(userId);
            meters.set(userId, newMeter(true));
        }
    }

    for (const userId of [...meters.keys()]) {
        if (!members.has(userId) && !userId.startsWith("stream:")) dropMeter(userId);
    }
}

// Stats report a 0..1 linear level; older engines have used 0..100 and 16-bit scales.
function toLinear(value: unknown) {
    const level = Number(value);
    if (!Number.isFinite(level) || level <= 0) return 0;
    if (level <= 1) return level;
    if (level <= 100) return level / 100;
    if (level <= 32767) return level / 32767;
    return Math.min(level / 1e5, 1);
}

function audioEntry(value: unknown): Record<string, any> | undefined {
    const entries = Array.isArray(value) ? value : [value];
    return entries.find(entry => entry && typeof entry === "object" && (entry.type == null || entry.type === "audio"));
}

function setAmplitude(userId: string | null | undefined, level: unknown) {
    if (!userId) return;

    const meter = meters.get(userId);
    if (meter && !meter.tap) meter.amplitude = toLinear(level);
}

const STREAM_KEY = (ownerId: string) => `stream:${ownerId}`;

// Stream meters only exist while the stream actually carries audio, so a
// soundless stream shows no meter instead of a flat or microphone-driven one.
function setStreamAmplitude(ownerId: string, level: unknown) {
    const key = STREAM_KEY(ownerId);
    let meter = meters.get(key);
    if (!meter || meter.tap) {
        dropMeter(key);
        meter = newMeter(true);
        meters.set(key, meter);
    }
    meter.lastStreamAt = Date.now();
    meter.amplitude = toLinear(level);
}

// Go live audio rides its own RTC connection, which names the streamer. The
// streamer sends the soundshare on that connection's outbound; a viewer
// receives the stream's audio as its inbound.
function readStreamLevels(conn: VoiceConnection, stats: any) {
    const owner = conn.streamUserId;
    if (!owner) return;

    if (conn.soundshareActive) {
        const outbound = audioEntry(stats?.rtp?.outbound);
        if (outbound) setStreamAmplitude(owner, outbound.audioLevel);
        return;
    }

    const inbound = stats?.rtp?.inbound;
    const entries = Array.isArray(inbound) ? inbound : inbound && typeof inbound === "object" ? Object.values(inbound) : [];
    for (const entry of entries) {
        const audio = audioEntry(entry);
        if (!audio?.ssrc) continue;
        setStreamAmplitude(owner, audio.audioLevel);
    }
}

// getUserIdBySsrc can miss in packed calls, so remember every resolution
function resolveSsrc(conn: VoiceConnection, ssrc: unknown) {
    const numeric = Number(ssrc);
    if (!Number.isFinite(numeric)) return undefined;

    const mapped = conn.getUserIdBySsrc?.(numeric);
    if (mapped) {
        ssrcUserCache.set(numeric, mapped);
        return mapped;
    }

    return ssrcUserCache.get(numeric);
}

function readLevels(conn: VoiceConnection, stats: any) {
    const inbound = stats?.rtp?.inbound;

    if (Array.isArray(inbound)) {
        for (const value of inbound) {
            const entry = audioEntry(value);
            if (entry) setAmplitude(resolveSsrc(conn, entry.ssrc), entry.audioLevel);
        }
    } else if (inbound && typeof inbound === "object") {
        for (const [key, value] of Object.entries(inbound)) {
            const entry = audioEntry(value);
            if (!entry) continue;

            const mapped = resolveSsrc(conn, entry.ssrc);
            const userId = mapped ?? (meters.has(key) ? key : null);
            if (mapped && meters.has(key) && mapped !== key) continue;
            setAmplitude(userId, entry.audioLevel);
        }
    }

    const me = UserStore.getCurrentUser()?.id;
    const outbound = audioEntry(stats?.rtp?.outbound);
    if (me && outbound) {
        const level = MediaEngineStore.isSelfMute() ? 0 : toLinear(outbound.audioLevel);
        selfOutboundLinear = level;
        setAmplitude(me, level);
    }
}

// 0 means taps or the native bridge already feed every voice meter. Otherwise
// the cadence follows the neediest consumer.
function statsPollMs() {
    let voiceFallback = false;
    let stream = false;
    let selfTap = false;
    for (const [userId, meter] of meters) {
        if (meter.tap) {
            if (meter.ownsInput) selfTap = true;
            continue;
        }
        if (userId.startsWith("stream:")) stream = true;
        else if (!meter.nativeAvailable || meter.nativeGap) voiceFallback = true;
    }
    if (voiceFallback) return STATS_MS;
    if (stream) return STREAM_STATS_MS;
    return selfTap ? SELF_STATS_MS : 0;
}

async function pollStats() {
    if (statsInFlight) return;
    const engine = MediaEngineStore.getMediaEngine();
    const connections = engine?.connections ? [...engine.connections as Iterable<VoiceConnection>] : [];
    if (!connections.length) return;

    statsInFlight = true;
    try {
        for (const conn of connections) {
            if (typeof conn.getStats !== "function") continue;
            try {
                const stats = await conn.getStats();
                if (!stats) continue;
                if (conn === connection) readLevels(conn, stats);
                readStreamLevels(conn, stats);
            } catch (e) {
                if (!statsFailed) logger.error("failed to read voice stats", e);
                statsFailed = true;
            }
        }
    } finally {
        statsInFlight = false;
    }
}

// The speaking flags flip the moment someone stops, well before their level decays.
function isHeard(userId: string) {
    const flags = connection?.localSpeakingFlags;
    if (!flags || !(userId in flags)) return true;
    return flags[userId] !== 0;
}

// Discord Desktop only reports one level per remote user, so their two bars come from the
// same gains the client's mixer uses. A user you have panned hard left goes quiet on the right.
function getPan(userId: string): [number, number] {
    try {
        const pan = MediaEngineStore.getLocalPan?.(userId);
        if (pan && Number.isFinite(pan.left) && Number.isFinite(pan.right)) {
            return [Math.max(0, pan.left), Math.max(0, pan.right)];
        }
    } catch (e) {
        // fall through to centered
    }

    const local = connection?.localPans?.[userId];
    if (local && Number.isFinite(local.left) && Number.isFinite(local.right)) {
        return [Math.max(0, local.left), Math.max(0, local.right)];
    }

    return [1, 1];
}

function readNativeLevels() {
    if (!bridgeChecked) {
        bridgeChecked = true;
        try {
            // Only the desktop app has native modules
            const voice = (typeof DiscordNative !== "undefined" ? DiscordNative.nativeModules?.requireModule("discord_voice") : null) as unknown as Partial<ParticipantBridge> | null;
            if (typeof voice?.getParticipantStereoLevels === "function") participantBridge = voice as ParticipantBridge;
        } catch (error) {
            logger.error("Cannot access participant PCM bridge", error);
        }
    }
    if (!participantBridge) return;
    const snapshot = participantBridge.getParticipantStereoLevels();
    const me = UserStore.getCurrentUser()?.id;
    for (const [userId, meter] of meters) {
        // Stream meters ride the stats path; the bridge only carries voice participants.
        if (meter.tap || userId === me || userId.startsWith("stream:")) continue;
        meter.nativeAvailable = snapshot.installed && snapshot.connection > 0;
        meter.native = undefined;
    }
    if (!snapshot.installed || !snapshot.connection) return;
    debugState.native = snapshot.levels.length;
    for (const level of snapshot.levels) {
        const meter = meters.get(level.userId);
        if (!meter || meter.tap || level.userId === me || level.ageMs < 0 || level.ageMs > 150
            || (level.channels !== 1 && level.channels !== 2)
            || ![level.rmsLeft, level.rmsRight, level.peakLeft, level.peakRight].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) continue;
        meter.native = level;
        meter.mono = level.channels === 1;
    }

    // nativeAvailable is connection-wide, so track flagged speakers the bridge
    // skips and hand them to stats instead of drawing a flat bar
    const now = Date.now();
    const flags = connection?.localSpeakingFlags;
    for (const [userId, meter] of meters) {
        if (meter.tap || userId === me || userId.startsWith("stream:")) continue;
        const flagged = !!flags && userId in flags && flags[userId] !== 0;
        if (meter.native || !flagged) meter.nativeMissAt = undefined;
        else meter.nativeMissAt ??= now;
        meter.nativeGap = meter.nativeMissAt !== undefined && now - meter.nativeMissAt > NATIVE_GAP_MS;
    }
}

function normalize(amplitude: number, floorDb: number) {
    const db = 20 * Math.log10(Math.max(amplitude, 1e-5));
    return Math.max(0, Math.min(1, (db - floorDb) / -floorDb));
}

function readChannel(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>, floorDb: number) {
    analyser.getFloatTimeDomainData(buffer);

    let sum = 0;
    let peak = 0;
    for (const value of buffer) {
        const abs = Math.abs(value);
        if (abs > peak) peak = abs;
        sum += value * value;
    }

    return { rms: normalize(Math.sqrt(sum / buffer.length), floorDb), peak: normalize(peak, floorDb) };
}

function smooth(meter: Meter, channel: 0 | 1, rms: number, peak: number, now: number) {
    const previousAt = meter.sampleAt[channel] || now;
    const elapsed = Math.max(0, now - previousAt);
    meter.sampleAt[channel] = now;
    const display = meter.display[channel];
    const tau = rms >= display ? ATTACK_MS : RELEASE_MS;
    // zero elapsed is the first sample, jump to the target
    meter.display[channel] = rms >= display && elapsed <= 0 ? rms
        : rms + (display - rms) * Math.exp(-elapsed / tau);

    if (peak >= meter.peak[channel]) {
        meter.peak[channel] = peak;
        meter.peakAt[channel] = now;
    } else if (now - meter.peakAt[channel] > HOLD_MS) {
        const fallMs = Math.max(0, now - Math.max(previousAt, meter.peakAt[channel] + HOLD_MS));
        const fall = PEAK_FALL_DB_PER_SECOND * fallMs / (1000 * -settings.store.floorDb);
        meter.peak[channel] = Math.max(meter.display[channel], meter.peak[channel] - fall);
    }
}

function notifySubscribers() {
    for (const subscriber of subscribers) subscriber();
}

// Audio activity per user id (stream: prefix stripped), for consumers that
// need more than Discord's mic-only speaking flag. Changes dispatch a window event.
const audioActiveUsers = new Set<string>();
let audioActiveDirty = false;
function noteActive(meter: Meter, rawLevel: number, now: number) {
    if (rawLevel >= ACTIVE_LEVEL) meter.activeUntil = now + ACTIVE_HOLD_MS;
}

function updateAudioActive() {
    const seen = new Set<string>();
    const now = Date.now();
    for (const [userId, meter] of meters) {
        const key = userId.startsWith("stream:") ? userId.slice(7) : userId;
        seen.add(key);
        const active = (meter.activeUntil ?? 0) > now;
        if (active && debugState.firstActiveAt == null) debugState.firstActiveAt = now;
        if (active !== audioActiveUsers.has(key)) {
            if (active) audioActiveUsers.add(key);
            else audioActiveUsers.delete(key);
            audioActiveDirty = true;
        }
    }
    for (const key of audioActiveUsers) {
        if (!seen.has(key)) {
            audioActiveUsers.delete(key);
            audioActiveDirty = true;
        }
    }
    if (audioActiveDirty) {
        audioActiveDirty = false;
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("testcord-vu-audio-change"));
    }
}

function isAudioActive(userId: string) {
    return audioActiveUsers.has(userId);
}

if (typeof window !== "undefined") {
    (window as unknown as { __testcordAudio: unknown }).__testcordAudio = {
        isActive: isAudioActive,
        active: () => [...audioActiveUsers]
    };
}

// Advance every meter's envelopes for `now`. Called per frame and from tick(),
// both dt-based, so mixing the cadences is safe.
function advanceEnvelopes(now: number) {
    const { floorDb } = settings.store;
    const perfNow = performance.now();
    for (const [userId, meter] of meters) {
        if (meter.tap) {
            const muted = meter.ownsInput && MediaEngineStore.isSelfMute();
            const left = muted ? { rms: 0, peak: 0 } : readChannel(meter.tap.left, meter.tap.bufLeft, floorDb);
            const right = muted || meter.mono ? left : readChannel(meter.tap.right, meter.tap.bufRight, floorDb);

            smooth(meter, 0, left.rms, left.peak, now);
            smooth(meter, 1, right.rms, right.peak, now);
            noteActive(meter, Math.max(left.rms, right.rms), now);
            if (meter.ownsInput) checkSelfMismatch(meter, muted === true, Math.max(left.rms, right.rms), now);
        } else if (meter.nativeAvailable && !meter.nativeGap) {
            const rmsLeft = normalize(meter.native?.rmsLeft ?? 0, floorDb);
            const rmsRight = normalize(meter.native?.rmsRight ?? 0, floorDb);
            smooth(meter, 0, rmsLeft, normalize(meter.native?.peakLeft ?? 0, floorDb), now);
            smooth(meter, 1, rmsRight, normalize(meter.native?.peakRight ?? 0, floorDb), now);
            noteActive(meter, Math.max(rmsLeft, rmsRight), now);
        } else {
            const heard = isHeard(userId);
            let linear = meter.amplitude;
            // stats can miss a flagged speaker (unmapped SSRC), so synthesize a
            // nominal level to keep the meter and the speaking ring in agreement
            if (heard && linear <= 0.001) {
                const flags = connection?.localSpeakingFlags;
                if (flags && userId in flags && flags[userId] !== 0) {
                    linear = 0.32 + 0.1 * Math.sin(perfNow / 110 + userId.length * 1.7 + (userId.charCodeAt(0) % 7));
                }
            }

            const value = heard ? normalize(linear, floorDb) : 0;
            // received audio counts as activity even before Discord's speaking flag arrives
            noteActive(meter, normalize(meter.amplitude, floorDb), now);
            const [panL, panR] = getPan(userId);

            smooth(meter, 0, value * panL, value * panL, now);
            smooth(meter, 1, value * panR, value * panR, now);
        }
    }
}

// Samples every level source, advances the envelopes and writes the bars
function frameTick() {
    frameId = undefined;
    if (!meterDoms.size || !meters.size || document.hidden) return;

    let writes = 0;
    try {
        advanceEnvelopes(Date.now());

        for (const [userId, doms] of meterDoms) {
            const meter = meters.get(userId);
            if (!meter) continue;
            for (const dom of doms) {
                writeMeterDom(meter, dom);
                writes++;
            }
        }
    } catch (e) {
        logger.error("meter frame failed", e);
    }

    debugState.frames = (debugState.frames ?? 0) + 1;
    debugState.writes = (debugState.writes ?? 0) + writes;
    debugState.doms = meterDoms.size;
    debugState.meters = meters.size;
    debugState.frameAt = Date.now();

    if (meterDoms.size && meters.size && !document.hidden) frameId = requestAnimationFrame(frameTick);
}

// The self tap reads the OS device before Discord processing, so bleed that
// Discord removes downstream still pins it while outbound stays silent. After
// a sustained mismatch the tap is dropped (showing outbound instead) with a
// delayed retry; after two drops the input stays on outbound until the Discord
// input device changes.
function checkSelfMismatch(meter: Meter, muted: boolean, raw: number, now: number) {
    if (!meter.ownsInput || muted || now - lastStatsAt > SELF_STATS_MS * 1.5) {
        meter.mismatchSince = undefined;
        return;
    }
    if (raw < SELF_MISMATCH_RAW_FLOOR || selfOutboundLinear > SELF_MISMATCH_OUTBOUND_CEILING) {
        meter.mismatchSince = undefined;
        inputMismatchDrops = 0;
        return;
    }
    if (meter.mismatchSince == null) meter.mismatchSince = now;
    if (now - meter.mismatchSince < SELF_MISMATCH_HOLD_MS) return;
    const me = UserStore.getCurrentUser()?.id;
    logger.warn("self input tap disagrees with voice outbound; falling back to outbound levels");
    if (me) dropMeter(me);
    inputMismatchDrops++;
    inputRetryAt = Date.now() + SELF_MISMATCH_RETRY_MS;
    if (inputMismatchDrops >= 2) inputSuspendKey = MediaEngineStore.getInputDeviceId();
}

function tick() {
    try {
        const conn = getConnection();
        if (conn !== connection) {
            dropAll();
            connection = conn;
            debugState.connectedAt = Date.now();
            delete debugState.firstActiveAt;
            lastScanAt = 0;
            statsFailed = false;
        }

        if (!connection) return;

        const now = Date.now();
        const web = isWebConnection(connection);

        if (now - lastScanAt >= SCAN_MS) {
            lastScanAt = now;
            if (web) syncWebMeters(connection);
            else {
                syncDesktopMeters();
                void syncSelfInput(connection);
            }
        }

        // stats only feed desktop meters that actually wait on them
        const statsMs = web ? 0 : statsPollMs();
        if (statsMs && !document.hidden && now - lastStatsAt >= statsMs) {
            lastStatsAt = now;
            void pollStats();
        }

        // also run here so displays stay honest while the rAF loop is parked
        if (!web) readNativeLevels();
        advanceEnvelopes(now);
        updateAudioActive();

        for (const userId of [...meters.keys()]) {
            if (userId.startsWith("stream:") && now - (meters.get(userId)?.lastStreamAt ?? 0) > STREAM_RELEASE_MS) dropMeter(userId);
        }

        // only structural changes notify components, levels ride the rAF loop
        if (meters.size !== lastMeterCount || (meters.size && now - lastNotifyAt >= NOTIFY_MS)) {
            lastMeterCount = meters.size;
            lastNotifyAt = now;
            notifySubscribers();
        }

        ensureFrameLoop();
    } catch (e) {
        logger.error("meter tick failed", e);
    }
}

// The fill translates inside its clipped box. No will-change: a layer per
// fill made Chromium re-layerize the whole call view every frame.
const BAR_STYLE: React.CSSProperties = {
    position: "relative", boxSizing: "border-box", width: "100%", height: "100%",
    background: "#000", border: "1px solid rgba(144,144,144,0.35)", borderRadius: 2, overflow: "hidden"
};
const FILL_STYLE: React.CSSProperties = { position: "absolute", inset: 0, backgroundImage: GRADIENT, transform: "translateY(100%)" };
const PEAK_STYLE: React.CSSProperties = { position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "#d3d3d3", opacity: 0 };

// One bar: a clipped window with a gradient fill. Live rendering writes
// transforms through fillRef/peakRef; static callers pass value/peak instead.
function MeterBar({ width, value, peak, showPeak, fillRef, peakRef }: {
    width: number;
    value?: number;
    peak?: number;
    showPeak?: boolean;
    fillRef?: React.Ref<HTMLDivElement>;
    peakRef?: React.Ref<HTMLDivElement>;
}) {
    const fillStyle = value == null ? FILL_STYLE : { ...FILL_STYLE, transform: `translateY(${(1 - value) * 100}%)` };
    return (
        <div style={{ ...BAR_STYLE, width }}>
            <div ref={fillRef} style={fillStyle} />
            {showPeak && (peak == null || peak > 0.01) && (
                <div
                    ref={peakRef}
                    style={peak == null ? PEAK_STYLE : {
                        ...PEAK_STYLE,
                        top: `clamp(0px, calc(${(1 - peak) * 100}% - 1px), calc(100% - 2px))`,
                        opacity: 1,
                        background: peak > 0.995 ? "#ef4444" : peak > 0.916 ? "#ffa500" : "#d3d3d3"
                    }}
                />
            )}
        </div>
    );
}

const VoiceMeter = ErrorBoundary.wrap(({ userId, height = BAR_HEIGHT, width = BAR_WIDTH, style }: { userId: string; height?: number | string; width?: number; style?: React.CSSProperties; }) => {
    settings.use(["showPeak"]);
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    const lastKey = React.useRef("");

    React.useEffect(() => {
        // levels never re-render, this only catches structural flips
        const check = () => {
            const meter = meters.get(userId);
            const key = meter ? `${meter.mono}|${meter.tap != null}|${meter.nativeAvailable === true}` : "";

            if (key !== lastKey.current) {
                lastKey.current = key;
                forceUpdate();
            }
        };

        check();
        subscribers.add(check);
        return () => void subscribers.delete(check);
    }, [userId]);

    const fillRefs = [React.useRef<HTMLDivElement | null>(null), React.useRef<HTMLDivElement | null>(null)];
    const peakRefs = [React.useRef<HTMLDivElement | null>(null), React.useRef<HTMLDivElement | null>(null)];
    const domRef = React.useRef<MeterDom | null>(null);

    const attachRoot = React.useCallback((root: HTMLDivElement | null) => {
        // with several meters per user, ref(null) must only drop this component's own dom
        const own = domRef.current;
        if (own) {
            meterDoms.get(userId)?.delete(own);
            domResize?.unobserve(own.root);
            meterDomByRoot.delete(own.root);
            domRef.current = null;
        }
        if (!root) return;

        const dom: MeterDom = {
            root,
            fills: [fillRefs[0].current!, fillRefs[1].current!],
            peaks: [peakRefs[0].current, peakRefs[1].current],
            colors: ["", ""],
            lastFill: ["", ""],
            lastPeak: ["", ""],
            lastPeakOpacity: ["", ""],
            height: root.clientHeight || BAR_HEIGHT
        };
        let set = meterDoms.get(userId);
        if (!set) {
            set = new Set();
            meterDoms.set(userId, set);
        }
        set.add(dom);
        domRef.current = dom;
        meterDomByRoot.set(root, dom);
        domResize ??= new ResizeObserver(records => {
            for (const record of records) {
                const tracked = meterDomByRoot.get(record.target as HTMLElement);
                if (tracked) tracked.height = record.contentRect.height || BAR_HEIGHT;
            }
        });
        domResize.observe(root);
        ensureFrameLoop();
    }, [userId]);

    const { showPeak } = settings.store;
    // The peak lines mount and unmount with the setting, after attachRoot has
    // already recorded the bar elements, so point the frame loop at the new ones.
    React.useEffect(() => {
        const dom = domRef.current;
        if (!dom) return;
        dom.peaks = [peakRefs[0].current, peakRefs[1].current];
        dom.lastPeak = ["", ""];
        dom.lastPeakOpacity = ["", ""];
        dom.colors = ["", ""];
    }, [showPeak]);

    const meter = meters.get(userId);
    if (!meter) return null;

    const gap = Math.max(2, Math.round(width / 2));
    const measured = (meter.tap != null || meter.nativeAvailable === true) && !meter.mono;
    const title = userId.startsWith("stream:")
        ? "Screen share audio. Left | Right"
        : meter.ownsInput
        ? "Your selected input before Discord encoding. Left | Right"
        : meter.nativeAvailable
            ? "Participant decoded audio channels before your local pan. Left | Right"
            : measured
                ? "Participant audio channels. Left | Right"
            : "Left | Right after your local pan. Discord Desktop reports one level per participant, so both bars carry it.";

    return (
        <div ref={attachRoot} style={{ display: "flex", alignItems: "stretch", height, ...style }} data-vu-meter={measured ? "lr" : "level"} title={title}>
            <MeterBar width={width} fillRef={fillRefs[0]} peakRef={peakRefs[0]} showPeak={showPeak} />
            <div style={{ width: gap, display: "flex", alignItems: "stretch", justifyContent: "center" }}>
                <div style={{ width: 1, background: "rgba(235,235,235,0.6)", borderRadius: 1 }} />
            </div>
            <MeterBar width={width} fillRef={fillRefs[1]} peakRef={peakRefs[1]} showPeak={showPeak} />
        </div>
    );
}, { noop: true });

// Participant types: STREAM 0, HIDDEN_STREAM 1, USER 2, ACTIVITY 3. Current
// builds don't pass streamId to stream tiles, so the type marks screen shares.
const STREAM_PARTICIPANT_TYPES = new Set([0, 1]);

interface ReactFiberNode {
    memoizedProps?: { streamId?: unknown; participant?: { type?: unknown; streamId?: unknown; }; };
    return?: ReactFiberNode | null;
}

function fiberIsStreamTile(tile: HTMLElement): boolean {
    const key = Object.keys(tile).find(k => k.startsWith("__reactFiber$"));
    if (!key) return false;
    let fiber = Reflect.get(tile, key) as ReactFiberNode | undefined;
    let sawStreamId = false;
    for (let hops = 0; fiber && hops < 40; hops++, fiber = fiber.return ?? undefined) {
        const props = fiber.memoizedProps;
        if (!props || typeof props !== "object") continue;
        const type = props.participant?.type;
        if (typeof type === "number") return STREAM_PARTICIPANT_TYPES.has(type);
        if (props.streamId != null) sawStreamId = true;
    }
    // Older builds without a participant object: fall back to the stream id
    return sawStreamId;
}

function TileMeter({ userId }: { userId?: string; }) {
    settings.use(["tilePlacement", "tileMeterSide", "tileMeterHeight", "tileSurfaces"]);
    const onPicture = settings.store.tilePlacement === "avatar";
    const fromLeft = settings.store.tileMeterSide === "left";
    const surfaces = settings.store.tileSurfaces;
    const boxRef = React.useRef<HTMLDivElement | null>(null);
    const [pictureInset, setPictureInset] = React.useState<{ right: number; bottom: number; } | null>(null);
    const [isStreamSlot, setIsStreamSlot] = React.useState(false);
    const [isStreamTile, setIsStreamTile] = React.useState(false);

    React.useLayoutEffect(() => {
        const tile = boxRef.current?.closest<HTMLElement>("div[data-selenium-video-tile]");
        if (!tile) return;

        // Stream previews carry no audio until opened, so they get no meter.
        // Tiles are marked by participant type, the live indicator class is unreliable.
        const syncStreamState = () => {
            const video = tile.querySelector("video");
            const playing = video != null && video.srcObject != null && video.videoWidth > 0;
            const streamTile = fiberIsStreamTile(tile);
            setIsStreamTile(streamTile);
            setIsStreamSlot(streamTile && !playing);
        };
        syncStreamState();
        let syncTimer: ReturnType<typeof setTimeout> | undefined;
        const observer = new MutationObserver(records => {
            if (syncTimer !== undefined) return;
            if (records.every(record => boxRef.current?.contains(record.target))) return;
            syncTimer = setTimeout(() => {
                syncTimer = undefined;
                syncStreamState();
            }, 200);
        });
        observer.observe(tile, { childList: true, subtree: true, attributes: true });
        // A stream starting or stopping playback changes no DOM: its video only
        // gains or loses frames. Media events do not bubble, so listen in capture.
        const mediaEvents = ["loadedmetadata", "playing", "emptied", "ended"];
        mediaEvents.forEach(name => tile.addEventListener(name, syncStreamState, true));
        return () => {
            if (syncTimer !== undefined) { clearTimeout(syncTimer); syncTimer = undefined; }
            observer.disconnect();
            mediaEvents.forEach(name => tile.removeEventListener(name, syncStreamState, true));
        };
    }, []);

    React.useLayoutEffect(() => {
        if (!onPicture) return;

        const box = boxRef.current;
        const tile = box?.closest<HTMLElement>("div[data-selenium-video-tile]");
        if (!box || !tile) return;

        // Discord paints the tile picture as one role=img element that fills the tile
        // box, and FullVCPFP scales that box. Mask and background both cover a centered
        // square, so the visible picture is that square, and the meter must pin to it
        // instead of the box. ResizeObserver misses style-only changes; a zoom or
        // rounding change re-measures at the next remount.
        const measure = () => {
            const picture = tile.querySelector<HTMLElement>("div[role=img]");
            if (!picture) return;

            const tileBox = tile.getBoundingClientRect();
            const pictureBox = picture.getBoundingClientRect();
            if (!tileBox.width || !pictureBox.width) return;

            const zoom = picture.clientHeight ? pictureBox.height / picture.clientHeight : 1;
            const square = Math.min(picture.clientWidth, picture.clientHeight) * zoom;
            if (!square) return;
            const squareRight = pictureBox.left + (pictureBox.width + square) / 2;
            const squareBottom = pictureBox.top + (pictureBox.height + square) / 2;

            const right = Math.max(0, tileBox.right - squareRight);
            const bottom = Math.max(0, tileBox.bottom - squareBottom);
            if (!Number.isFinite(right) || !Number.isFinite(bottom)) return;
            setPictureInset(prev => (prev && Math.abs(prev.right - right) < 0.5 && Math.abs(prev.bottom - bottom) < 0.5 ? prev : { right, bottom }));
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(tile);
        return () => observer.disconnect();
    }, [onPicture]);

    if (!userId) return null;
    if (isStreamSlot) return null;
    if (isStreamTile && surfaces === "voice") return null;
    if (!isStreamTile && surfaces === "streams") return null;

    const height = `calc(${Math.round(settings.store.tileMeterHeight)}% - 10px)`;
    // 18px is the native seat (bars centered in the background strip); the
    // mirrored left seat uses the same inset from the tile's left edge, and the
    // picture seat hugs the measured square's corner. Every meter is centered
    // vertically (top 50% + translateY), which clears the strip and the labels.
    const inset = pictureInset ? pictureInset.right + 14 : 14;
    const style: React.CSSProperties = { position: "absolute", height, zIndex: 3, pointerEvents: "none", top: "50%", transform: "translateY(-50%)" };
    if (fromLeft) {
        style.left = onPicture ? inset : 18;
    } else {
        style.right = onPicture ? (pictureInset ? pictureInset.right + 14 : 14) : 18;
    }

    return (
        <div ref={boxRef} style={style}>
            <VoiceMeter userId={isStreamTile ? `stream:${userId}` : userId} height="100%" width={8} />
        </div>
    );
}

export default definePlugin({
    name: "VoiceVUMeters",
    description: "Draws left and right voice meters with a divider next to everyone in your voice channel and on call tiles.",
    authors: [Devs.ewlle, Devs.kraethis, Devs.Sharp],
    tags: ["Voice", "Utility"],
    settings,
    managedStyle: meterStyle,

    patches: [
        {
            // Voice channel list row: the meter goes last, after the mute/deafen icons, so every bar lines up.
            find: "VOICE_PANEL}}",
            replacement: {
                match: /(?<=userId:(\i)\.id,.{0,300}?)\(0,\i\.jsx\)\(\i,\{disabled:\i,[^}]{0,80}?isHovered:\i\}\)/,
                replace: "$&,$self.renderMeter($1.id)"
            }
        },
        {
            find: "data-selenium-video-tile",
            replacement: {
                match: /"data-selenium-video-tile":(\i),(.{0,30}?children:)(\i)/,
                replace: "\"data-selenium-video-tile\":$1,$2[$3,$self.renderTileMeter($1)]"
            }
        }
    ],

    renderMeter(userId: string) {
        return <VoiceMeter userId={userId} style={{ flexShrink: 0 }} />;
    },

    renderTileMeter(userId?: string) {
        return <TileMeter userId={userId} />;
    },

    start() {
        if (!settings.store.peakHoldEnabled) {
            settings.store.showPeak = true;
            settings.store.peakHoldEnabled = true;
        }
        document.addEventListener("visibilitychange", onVisibilityChange);
        intervalId = setInterval(tick, POLL_MS);
    },

    stop() {
        document.removeEventListener("visibilitychange", onVisibilityChange);

        if (intervalId !== undefined) {
            clearInterval(intervalId);
            intervalId = undefined;
        }

        parkFrameLoop();
        domResize?.disconnect();
        domResize = undefined;
        meterDoms.clear();

        dropAll();
        connection = null;
        lastMeterCount = 0;
        statsInFlight = false;
        participantBridge = undefined;
        bridgeChecked = false;
        selfOutboundLinear = 0;
        inputMismatchDrops = 0;
        inputSuspendKey = null;
    }
});
