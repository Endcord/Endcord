#include <windows.h>
#include <node_api.h>
#include <wincrypt.h>
#include <MinHook.h>
#include <atomic>
#include <functional>
#include <stdexcept>
#include "participant_metrics.hpp"

using RawAudio = std::function<void(const std::string&, const int16_t*, size_t, int, size_t, uint32_t, bool&, float)>;
static_assert(sizeof(RawAudio) == 64, "Discord's observed x64 std::function ABI uses 64 bytes");
using Connect = void* (*)(void*, void*, const void*, const void*, void*, void*, RawAudio*, void*);
static Connect originalConnect = nullptr;
static ParticipantMetrics metrics;
static std::atomic<uint64_t> connectionCount{0};
static std::atomic<uint64_t> frameCount{0};
static bool installed = false;
static std::string installError;
#ifdef VUTAP_TEST_DISABLE_INPUT
using CodecParse = void* (*)(void*, void*);
static CodecParse originalCodecParse;
static bool codecValid = false;
static uint64_t codecBytes = 0;
static std::string codecRaw;
static std::string callbackStack;
static void* codecParseTap(void* result, void* value) {
    auto returned = originalCodecParse(result, value);
    auto bytes = static_cast<unsigned char*>(result);
    codecValid = bytes[24] != 0;
    if (codecValid) {
        auto begin = *reinterpret_cast<unsigned char**>(bytes);
        auto end = *reinterpret_cast<unsigned char**>(bytes+8);
        codecBytes = end-begin;
        codecRaw.clear();
        constexpr char hex[] = "0123456789abcdef";
        for (size_t i=0;i<std::min<size_t>(codecBytes,64);i++) {
            codecRaw += hex[begin[i]>>4]; codecRaw += hex[begin[i]&15];
        }
    }
    return returned;
}
#endif

// Preserve every argument, the original callback and the original return value.
static void* connectTap(void* engine, void* result, const void* user, const void* options,
                        void* connected, void* speaking, RawAudio* received, void* captured) {
#ifdef VUTAP_TEST_DISABLE_INPUT
    // Only the isolated decoder-test build has this control. Never ship it.
    using SetInputEnabled = void (*)(void*, bool);
    auto disable = reinterpret_cast<SetInputEnabled>(GetProcAddress(GetModuleHandleW(L"discord_voice.node"),
        "?SetAudioInputEnabled@Discord@@QEAAX_N@Z"));
    if (disable) disable(engine, false);
#endif
    const auto id = ++connectionCount;
    if (received) {
        auto previous = std::move(*received);
        *received = [previous = std::move(previous), id](const std::string& userId, const int16_t* pcm,
            size_t frames, int rate, size_t channels, uint32_t timestamp, bool& muted, float gain) {
#ifdef VUTAP_TEST_DISABLE_INPUT
            if (callbackStack.empty()) {
                void* stack[12];auto count=RtlCaptureStackBackTrace(0,12,stack,nullptr);
                auto base=reinterpret_cast<uintptr_t>(GetModuleHandleW(L"discord_voice.node"));
                for(USHORT i=0;i<count;i++) {
                    auto address=reinterpret_cast<uintptr_t>(stack[i]);
                    if(address>=base && address<base+0xe00000) callbackStack+=std::to_string(address-base)+",";
                }
            }
#endif
            ++frameCount;
            try { metrics.observe(id, userId, pcm, frames, rate, channels, timestamp, GetTickCount64()); }
            catch (...) { /* Meter failures must not interrupt voice playback. */ }
            if (previous) previous(userId, pcm, frames, rate, channels, timestamp, muted, gain);
#ifdef VUTAP_TEST_DISABLE_INPUT
            // The native caller clears this exact participant frame after the tap returns.
            muted = true;
#endif
        };
    }
    return originalConnect(engine, result, user, options, connected, speaking, received, captured);
}

static bool auditedBinary(HMODULE module) {
    wchar_t path[MAX_PATH];
    if (!GetModuleFileNameW(module, path, MAX_PATH)) return false;
    HANDLE file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    HCRYPTPROV provider = 0; HCRYPTHASH hash = 0;
    bool ok = CryptAcquireContextW(&provider, nullptr, nullptr, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)
        && CryptCreateHash(provider, CALG_SHA_256, 0, 0, &hash);
    unsigned char buffer[65536]; DWORD bytes = 0;
    while (ok) {
        if (!ReadFile(file, buffer, sizeof(buffer), &bytes, nullptr)) { ok = false; break; }
        if (!bytes) break;
        ok = CryptHashData(hash, buffer, bytes, 0) != FALSE;
    }
    unsigned char actual[32]; DWORD size = sizeof(actual);
    constexpr unsigned char expected[] = {
        0x40,0x39,0xdc,0xd1,0x10,0xa2,0xd2,0xb1,0x76,0x72,0xa6,0x2f,0x94,0xd1,0x1d,0xd5,
        0xa9,0xa4,0xe5,0x9a,0xb2,0x42,0x09,0x15,0xef,0x13,0x62,0xa2,0x94,0x67,0xa4,0xa5
    };
    ok = ok && CryptGetHashParam(hash, HP_HASHVAL, actual, &size, 0)
        && size == sizeof(expected) && memcmp(actual, expected, sizeof(expected)) == 0;
    if (hash) CryptDestroyHash(hash);
    if (provider) CryptReleaseContext(provider, 0);
    CloseHandle(file);
    return ok;
}

static void install() {
    HMODULE module = GetModuleHandleW(L"discord_voice.node");
    if (!module) { installError = "Native voice module is not loaded"; return; }
    if (!auditedBinary(module)) { installError = "Unaudited native voice binary"; return; }
    const auto* dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(module);
    const auto* nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(reinterpret_cast<const char*>(module) + dos->e_lfanew);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE || nt->Signature != IMAGE_NT_SIGNATURE
        || nt->FileHeader.Machine != IMAGE_FILE_MACHINE_AMD64) {
        installError = "Unsupported native voice architecture"; return;
    }
    constexpr auto name = "?Connect@Discord@@QEAA?AV?$shared_ptr@VConnection@voice@discord@@@std@@AEBV?$basic_string@DU?$char_traits@D@std@@V?$allocator@D@2@@3@AEBUBridgeConnectionOptions@discord@@V?$function@$$A6AXAEBUConnectionInfo@discord@@AEBV?$basic_string@DU?$char_traits@D@std@@V?$allocator@D@2@@std@@@Z@3@V?$function@$$A6AXI@Z@3@V?$function@$$A6AXAEBV?$basic_string@DU?$char_traits@D@std@@V?$allocator@D@2@@std@@PEBF_KH2IAEA_NM@Z@3@V?$function@$$A6AXPEAF_KH1@Z@3@@Z";
    void* target = reinterpret_cast<void*>(GetProcAddress(module, name));
    if (!target) { installError = "Decoded participant callback export is unavailable"; return; }
    // Fail closed if the audited function prologue has changed.
    constexpr unsigned char prologue[] = {0x41, 0x57, 0x41, 0x56, 0x41, 0x55, 0x41, 0x54, 0x56, 0x57, 0x55, 0x53};
    if (memcmp(target, prologue, sizeof(prologue))) { installError = "Unaudited native voice function"; return; }
    const auto initialized = MH_Initialize();
    if (initialized != MH_OK && initialized != MH_ERROR_ALREADY_INITIALIZED) {
        installError = "Cannot initialize participant tap"; return;
    }
    if (MH_CreateHook(target, reinterpret_cast<void*>(connectTap), reinterpret_cast<void**>(&originalConnect)) != MH_OK) {
        installError = "Cannot prepare participant tap"; return;
    }
    if (MH_EnableHook(target) != MH_OK) {
        MH_RemoveHook(target);
        installError = "Cannot enable participant tap"; return;
    }
    installed = true;
#ifdef VUTAP_TEST_DISABLE_INPUT
    auto codecTarget = reinterpret_cast<char*>(module)+0x3a2f0;
    if (MH_CreateHook(codecTarget,reinterpret_cast<void*>(codecParseTap),reinterpret_cast<void**>(&originalCodecParse)) == MH_OK)
        MH_EnableHook(codecTarget);
#endif
}

// Resolve stable Node-API functions from the host. No Electron ABI-specific import library.
#define API_LIST(X) \
    X(napi_create_object) X(napi_create_array_with_length) X(napi_create_double) \
    X(napi_create_string_utf8) X(napi_get_boolean) X(napi_set_named_property) \
    X(napi_set_element) X(napi_create_function)
#define DECLARE(name) static decltype(&name) p_##name = nullptr;
API_LIST(DECLARE)
#undef DECLARE

static bool resolveApi() {
    const auto host = GetModuleHandleW(nullptr);
#define RESOLVE(name) p_##name = reinterpret_cast<decltype(&name)>(GetProcAddress(host, #name)); if (!p_##name) return false;
    API_LIST(RESOLVE)
#undef RESOLVE
    return true;
}
static void number(napi_env env, napi_value obj, const char* name, double value) {
    napi_value v; p_napi_create_double(env, value, &v); p_napi_set_named_property(env, obj, name, v);
}
static void string(napi_env env, napi_value obj, const char* name, const std::string& value) {
    napi_value v; p_napi_create_string_utf8(env, value.c_str(), value.size(), &v); p_napi_set_named_property(env, obj, name, v);
}
static napi_value read(napi_env env, napi_callback_info) {
    napi_value result, array, ok;
    p_napi_create_object(env, &result);
    p_napi_get_boolean(env, installed, &ok); p_napi_set_named_property(env, result, "installed", ok);
    string(env, result, "error", installError);
    number(env, result, "connections", static_cast<double>(connectionCount));
    number(env, result, "frames", static_cast<double>(frameCount));
#ifdef VUTAP_TEST_DISABLE_INPUT
    number(env,result,"testOutputDiscarded",installed);
    number(env,result,"testCodecValid",codecValid);
    number(env,result,"testCodecBytes",static_cast<double>(codecBytes));
    string(env,result,"testCodecRaw",codecRaw);
    string(env,result,"testCallbackStack",callbackStack);
#endif
    const auto now = GetTickCount64();
    const auto levels = metrics.snapshot(now);
    p_napi_create_array_with_length(env, levels.size(), &array);
    uint32_t index = 0;
    for (const auto& level : levels) {
        napi_value obj; p_napi_create_object(env, &obj);
        string(env, obj, "userId", level.user);
        number(env, obj, "rtpTimestamp", level.timestamp);
        number(env, obj, "connection", static_cast<double>(level.connection));
        number(env, obj, "ageMs", static_cast<double>(now - level.at));
        number(env, obj, "sampleRate", level.rate);
        number(env, obj, "channels", static_cast<double>(level.channels));
        number(env, obj, "sampleFrames", static_cast<double>(level.frames));
        number(env, obj, "rmsLeft", level.rms[0]); number(env, obj, "rmsRight", level.rms[1]);
        number(env, obj, "rmsMid", level.mid); number(env, obj, "rmsSide", level.side);
        number(env, obj, "peakLeft", level.peak[0]); number(env, obj, "peakRight", level.peak[1]);
        p_napi_set_element(env, array, index++, obj);
    }
    p_napi_set_named_property(env, result, "levels", array);
    return result;
}
extern "C" __declspec(dllexport) int32_t node_api_module_get_api_version_v1() { return 8; }
extern "C" __declspec(dllexport) napi_value napi_register_module_v1(napi_env env, napi_value exports) {
    if (!resolveApi()) return exports;
    install();
    napi_value fn; p_napi_create_function(env, "read", NAPI_AUTO_LENGTH, read, nullptr, &fn);
    p_napi_set_named_property(env, exports, "read", fn);
    return exports;
}
