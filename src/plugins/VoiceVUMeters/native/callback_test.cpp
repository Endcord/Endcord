#include <cassert>
#include <functional>
#include <iostream>
#include "participant_metrics.hpp"

int main() {
    ParticipantMetrics metrics;
    const float left[] = {0.5f,0, -0.5f,0};
    const float right[] = {0,0.25f, 0,-0.25f};
    metrics.observe(1, "111", left, 2, 48000, 2, 101, 100);
    metrics.observe(1, "222", right, 2, 48000, 2, 202, 100);
    auto values = metrics.snapshot(100);
    assert(values.size() == 2);
    for (auto& value : values) {
        if (value.user == "111") {
            assert(value.timestamp == 101 && value.rms[0] == 0.5 && value.rms[1] == 0);
            assert(value.peak[0] == 0.5 && value.peak[1] == 0);
        } else {
            assert(value.timestamp == 202 && value.rms[0] == 0 && value.rms[1] == 0.25);
            assert(value.peak[0] == 0 && value.peak[1] == 0.25);
        }
    }
    assert(metrics.snapshot(1101).empty());
    metrics.observe(1, "bad-id", left, 2, 48000, 2, 101, 2000);
    metrics.observe(1, "111", left, 2, 48000, 0, 101, 2000);
    assert(metrics.snapshot(2000).empty());
    const float mono[] = {0.125f,-0.125f};
    metrics.observe(2, "111", mono, 2, 48000, 1, 101, 2000);
    values = metrics.snapshot(2000);
    assert(values.size() == 1 && values[0].rms[0] == 0.125 && values[0].rms[1] == 0.125);
    assert(values[0].mid == 0.125 && values[0].side == 0);
    // Centered stereo has no side; inverted channels are all side; hard pan splits evenly.
    const float centered[] = {0.5f,0.5f, -0.5f,-0.5f};
    const float inverted[] = {0.5f,-0.5f, -0.5f,0.5f};
    metrics.observe(3, "333", centered, 2, 48000, 2, 1, 3000);
    metrics.observe(3, "444", inverted, 2, 48000, 2, 1, 3000);
    metrics.observe(3, "555", left, 2, 48000, 2, 1, 3000);
    for (const auto& value : metrics.snapshot(3000)) {
        if (value.user == "333") assert(value.mid == 0.5 && value.side == 0);
        if (value.user == "444") assert(value.mid == 0 && value.side == 0.5);
        if (value.user == "555") assert(value.mid == 0.25 && value.side == 0.25);
    }
    std::cout << "PASS participant identity, isolated stereo PCM, independent peaks, mono, mid/side, invalid metadata and stale cleanup\n";
}
