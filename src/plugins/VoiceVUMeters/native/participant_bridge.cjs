/* SPDX-License-Identifier: MIT */
// Levels come from the native callback for each connection and participant.
module.exports = function attachParticipantMeters(voice, tap) {
    const initial = tap.read();
    if (!initial.installed) throw new Error(initial.error || 'Native participant tap unavailable');
    const active = new Map();
    const create = voice.createVoiceConnectionWithOptions;
    voice.createVoiceConnectionWithOptions = function (...args) {
        const before = tap.read().connections;
        const connection = create.apply(this, args);
        const id = tap.read().connections;
        if (id !== before + 1) return connection;
        active.set(id, args[1]?.context ?? 'default');
        const destroy = connection.destroy;
        connection.destroy = function (...values) {
            active.delete(id);
            return destroy.apply(this, values);
        };
        const transport = connection.setTransportOptions;
        connection.setTransportOptions = function (options) {
            const decoded = Array.isArray(options?.audioDecoders) ? options.audioDecoders.map(codec =>
                codec?.name?.toLowerCase() === 'opus'
                    ? { ...codec, channels: 2, params: { ...codec.params, stereo: '1', 'sprop-stereo': '1' } }
                    : codec) : undefined;
            return transport.call(this, decoded ? { ...options, audioDecoders: decoded } : options);
        };
        return connection;
    };
    voice.createOwnStreamConnectionWithOptions = voice.createVoiceConnectionWithOptions;
    voice.getParticipantStereoLevels = function () {
        const current = [...active].filter(([, context]) => context === 'default').map(([id]) => id);
        const id = Math.max(0, ...current);
        const snapshot = tap.read();
        return { installed: snapshot.installed, connection: id,
            levels: snapshot.levels.filter(level => level.connection === id && level.ageMs <= 150) };
    };
};
