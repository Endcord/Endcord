#pragma once
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>
#include <type_traits>

// Keep only levels. Audio samples are never stored or written to disk.
struct ParticipantLevel {
    std::string user;
    uint32_t timestamp;
    uint64_t connection;
    uint64_t at;
    int rate;
    size_t channels;
    size_t frames;
    std::array<double, 2> rms{};
    std::array<double, 2> peak{};
    // Mid (L+R)/2 and side (L-R)/2 RMS. Side catches width from delay or phase
    // differences even when both channels are equally loud.
    double mid = 0;
    double side = 0;
};

class ParticipantMetrics {
    std::mutex mutex_;
    std::unordered_map<std::string, ParticipantLevel> levels_;
public:
    template<typename Sample>
    void observe(uint64_t connection, const std::string& user, const Sample* pcm,
                 size_t frames, int rate, size_t channels, uint32_t timestamp, uint64_t now) {
        if (user.empty() || user.size() > 20 || user.find_first_not_of("0123456789") != std::string::npos
            || !pcm || frames == 0 || frames > 5760 || (channels != 1 && channels != 2)
            || rate < 8000 || rate > 192000) return;
        ParticipantLevel level{user, timestamp, connection, now, rate, channels, frames};
        for (size_t frame = 0; frame < frames; ++frame) {
            for (size_t channel = 0; channel < channels; ++channel) {
                double sample = pcm[frame * channels + channel];
                if constexpr (std::is_integral_v<Sample>) sample /= 32768.0;
                if (!std::isfinite(sample)) return;
                level.rms[channel] += sample * sample;
                level.peak[channel] = std::max(level.peak[channel], std::abs(sample));
            }
        }
        if (channels == 2) {
            for (size_t frame = 0; frame < frames; ++frame) {
                double left = pcm[frame * 2], right = pcm[frame * 2 + 1];
                if constexpr (std::is_integral_v<Sample>) { left /= 32768.0; right /= 32768.0; }
                level.mid += (left + right) * (left + right) * 0.25;
                level.side += (left - right) * (left - right) * 0.25;
            }
            level.mid = std::sqrt(level.mid / frames);
            level.side = std::sqrt(level.side / frames);
        }
        for (size_t channel = 0; channel < channels; ++channel)
            level.rms[channel] = std::sqrt(level.rms[channel] / frames);
        if (channels == 1) {
            level.rms[1] = level.rms[0];
            level.peak[1] = level.peak[0];
            level.mid = level.rms[0];
        }
        // Never wait for the renderer on the voice thread.
        std::unique_lock lock(mutex_, std::try_to_lock);
        if (!lock.owns_lock()) return;
        const std::string key = std::to_string(connection) + ":" + user;
        if (levels_.size() >= 256 && !levels_.contains(key)) return;
        levels_.insert_or_assign(key, std::move(level));
    }

    std::vector<ParticipantLevel> snapshot(uint64_t now) {
        std::lock_guard lock(mutex_);
        std::vector<ParticipantLevel> result;
        for (auto it = levels_.begin(); it != levels_.end();) {
            if (now < it->second.at || now - it->second.at > 1000) {
                it = levels_.erase(it);
            } else {
                result.push_back(it->second);
                ++it;
            }
        }
        return result;
    }
};
