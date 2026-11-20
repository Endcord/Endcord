using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using EndcordInstaller.Core;
using EndcordInstaller.Localization;
using Microsoft.Win32;

namespace EndcordInstaller.Tests
{
    public static class InstallerTestRunner
    {
        public static int RunAll(string logOutputPath)
        {
            InstallationEngine.LeaveProcessesAlone = true;

            var logs = new List<string>();
            int passed = 0;
            int failed = 0;

            Action<string, Action> Check = (name, test) =>
            {
                try
                {
                    test();
                    passed++;
                    string line = "[PASS] " + name;
                    logs.Add(line);
                    Console.WriteLine(line);
                }
                catch (Exception ex)
                {
                    failed++;
                    string line = "[FAIL] " + name + " -> " + ex.Message;
                    logs.Add(line);
                    Console.WriteLine(line);
                }
            };

            Check("1. Localization: All 5 languages (EN, TR, RU, ES, FR) complete & formatted", TestLocalization);
            Check("2. Client Detection: Vencord, Equicord, Mallcord, Nightcord, BetterDiscord", TestClientDetection);
            Check("3. Migration Engine: Preview, compatible/incompatible filtering, backup & restore", TestMigrationAndBackups);
            Check("4. Smart Installation: Conflict replacement, in-place update, cleanup & uninstall", TestInstallUpdateUninstall);
            Check("5. Resilience: Cancellation rollback, locked file retry & damaged install handling", TestResilienceAndErrors);
            Check("6. Payload integrity: a file planted next to the installer is refused, the embedded one passes", TestPayloadIntegrity);
            Check("7. Release manifest: only a manifest signed by the release key is trusted, in the form Node signs it", TestReleaseManifest);
            Check("8. Endcord Desktop: installs a signed release, updates without the runtime, refuses bad downloads, uninstalls", TestDesktopSetup);

            string summary = string.Format("SUMMARY: {0} passed, {1} failed", passed, failed);
            logs.Add(summary);
            Console.WriteLine(summary);

            if (!string.IsNullOrEmpty(logOutputPath))
            {
                try { File.WriteAllLines(logOutputPath, logs.ToArray(), FileOps.Utf8); } catch { }
            }

            return failed == 0 ? 0 : 1;
        }

        static void Assert(bool condition, string message)
        {
            if (!condition) throw new Exception(message);
        }

        // ---- A release key of the tests' own, so a manifest they sign is accepted and nobody else's would be ----

        static CngKey testKey;

        static CngKey TestKey()
        {
            if (testKey == null) testKey = CngKey.Create(CngAlgorithm.ECDsaP256);
            return testKey;
        }

        /// <summary>X then Y of the test key, as ReleaseManifest.PublicKey wants it</summary>
        static byte[] TestPublicKey()
        {
            byte[] blob = TestKey().Export(CngKeyBlobFormat.EccPublicBlob);
            var point = new byte[64];
            Buffer.BlockCopy(blob, 8, point, 0, 64);
            return point;
        }

        /// <summary>A version.json as scripts/uploadRelease.mjs writes one, signed with the test key</summary>
        static string SignedManifest(string version, IDictionary<string, string> assets, string installerSha256 = null, string folder = "dist/")
        {
            const string hash = "abcdef1";
            const string updatedAt = "1762639513000";
            installerSha256 = installerSha256 ?? new string('0', 64);

            var assetLines = new List<string>();
            foreach (var kv in assets) assetLines.Add(kv.Key + " " + kv.Value);
            assetLines.Sort(string.CompareOrdinal);
            var payload = new List<string> { version, hash, updatedAt, installerSha256 };
            payload.AddRange(assetLines);

            byte[] rawSignature;
            using (var ecdsa = new ECDsaCng(TestKey()))
            {
                ecdsa.HashAlgorithm = CngAlgorithm.Sha256;
                rawSignature = ecdsa.SignData(Encoding.UTF8.GetBytes(string.Join("\n", payload.ToArray())));
            }

            var manifest = new JsonObject();
            manifest["version"] = version;
            manifest["hash"] = hash;
            manifest["updatedAt"] = new JsonNumber(updatedAt);
            manifest["installerSha256"] = installerSha256;
            var list = new List<object>();
            foreach (var kv in assets)
            {
                var asset = new JsonObject();
                asset["name"] = kv.Key;
                asset["url"] = (folder == "desktop/" ? DesktopEngine.FileBase : "https://raw.githubusercontent.com/Endcord/Endcord/main/" + folder) + kv.Key;
                asset["sha256"] = kv.Value;
                list.Add(asset);
            }
            manifest["assets"] = list;
            manifest["signature"] = Convert.ToBase64String(DerSignature(rawSignature));
            return Json.Serialize(manifest);
        }

        /// <summary>CNG signs as r then s; Node writes a DER SEQUENCE of two INTEGERs, which is what the verifier reads</summary>
        static byte[] DerSignature(byte[] raw)
        {
            byte[] r = DerInteger(raw, 0), s = DerInteger(raw, 32);
            var der = new byte[2 + r.Length + s.Length];
            der[0] = 0x30;
            der[1] = (byte)(r.Length + s.Length);
            Buffer.BlockCopy(r, 0, der, 2, r.Length);
            Buffer.BlockCopy(s, 0, der, 2 + r.Length, s.Length);
            return der;
        }

        static byte[] DerInteger(byte[] raw, int offset)
        {
            int start = offset;
            while (start < offset + 31 && raw[start] == 0) start++;
            int n = offset + 32 - start;
            int pad = (raw[start] & 0x80) != 0 ? 1 : 0;
            var der = new byte[2 + pad + n];
            der[0] = 0x02;
            der[1] = (byte)(pad + n);
            Buffer.BlockCopy(raw, start, der, 2 + pad, n);
            return der;
        }

        static void TestReleaseManifest()
        {
            var savedKey = ReleaseManifest.PublicKey;
            try
            {
                Assert(savedKey != null && savedKey.Length == 64, "The release key built into the installer should read as a P-256 point");

                // What Node's crypto.sign wrote over this payload with a throwaway key (scratch script, 2026-11-09): the DER form
                // and the key's point, as the release script and the updater use them
                byte[] nodeKey = Convert.FromBase64String("e3SrdOebdOmg42S2vIbYhFpfb7LsUtdPhSik+8vCfXA3MCZ0rsL0h+Uv1GU/gwZ6kgXrG9hW/jRyCMjicQ1izw==");
                byte[] nodeSignature = Convert.FromBase64String("MEYCIQCnCSQpYGEQLtePvdCWpu2cZSLpaG1ayspKk9bYTSNW/QIhAM7e/sTfUv2MGmG5r0kleuGjwB/sZFOs7GOsW6Q2+Og/");
                byte[] nodePayload = Encoding.UTF8.GetBytes(string.Join("\n", new[] { "4.10.0", "abcdef1", "1762639513000", new string('0', 64), "patcher.js 11", "preload.js 22" }));
                Assert(ReleaseManifest.VerifySignature(nodePayload, nodeSignature, nodeKey), "A signature Node wrote should verify");
                nodePayload[0] = (byte)'5';
                Assert(!ReleaseManifest.VerifySignature(nodePayload, nodeSignature, nodeKey), "A changed payload must not verify");
                Assert(!ReleaseManifest.VerifySignature(nodePayload, new byte[] { 0x30, 0x02, 0x02, 0x00 }, nodeKey), "A signature that isn't two integers must not verify");
                Assert(!ReleaseManifest.VerifySignature(nodePayload, nodeSignature, savedKey), "The wrong key must not verify");

                // The manifest as a whole: the same payload rule as the release script, and a real key of the test's own
                ReleaseManifest.PublicKey = TestPublicKey();
                var assets = new Dictionary<string, string> { { "renderer.js", new string('a', 64) }, { "patcher.js", new string('B', 64) }, { "preload.js", new string('c', 64) }, { "renderer.css", new string('d', 64) } };
                string manifest = SignedManifest("4.10.0", assets);
                var release = ReleaseManifest.Verify(manifest);
                Assert(release != null && release.Version == "4.10.0" && release.Assets["patcher.js"] == new string('b', 64), "A manifest signed by the release key should be read, with its hashes in lower case");
                Assert(ReleaseManifest.Verify(manifest.Replace("\"4.10.0\"", "\"4.10.1\"")) == null, "A manifest changed after signing must be refused");
                Assert(ReleaseManifest.Verify(manifest.Replace("1762639513000", "1762639513001")) == null, "A changed release time must be refused");
                Assert(ReleaseManifest.Verify("{\"version\":\"4.10.0\"}") == null && ReleaseManifest.Verify("not json") == null, "Something that isn't a manifest must be refused");
                var partial = new Dictionary<string, string>(assets);
                partial.Remove("patcher.js");
                Assert(ReleaseManifest.Verify(SignedManifest("4.10.0", partial)) == null, "A correctly signed manifest with a file missing must be refused");
                Assert(ReleaseManifest.Verify(SignedManifest("4.10.0\nx", assets)) == null, "A correctly signed manifest with a line break in its version must be refused");
                ReleaseManifest.PublicKey = savedKey;
                Assert(ReleaseManifest.Verify(manifest) == null, "A manifest signed by another key must be refused by the release key");
            }
            finally
            {
                ReleaseManifest.PublicKey = savedKey;
            }
        }

        static string Sha(byte[] data)
        {
            using (var sha = SHA256.Create())
            {
                var sb = new StringBuilder();
                foreach (var b in sha.ComputeHash(data)) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        /// <summary>A runtime zip as buildDesktopApp.mjs makes one: everything under one top folder</summary>
        static byte[] RuntimeZip(IDictionary<string, string> entries)
        {
            using (var buffer = new MemoryStream())
            {
                using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, true))
                {
                    foreach (var kv in entries)
                    {
                        using (var writer = new StreamWriter(zip.CreateEntry("EndcordDesktop-win32-x64/" + kv.Key).Open())) writer.Write(kv.Value);
                    }
                }
                return buffer.ToArray();
            }
        }

        static void TestDesktopSetup()
        {
            InstallerPaths paths;
            string root = CreateSandbox(out paths);
            var savedKey = ReleaseManifest.PublicKey;
            var savedFetch = ReleaseManifest.FetchDesktop;
            const string testKeys = @"Software\EndcordInstallerSelfTest";
            string regKey = testKeys + @"\Uninstall-" + Guid.NewGuid().ToString("N").Substring(0, 8);
            try
            {
                ReleaseManifest.PublicKey = TestPublicKey();
                var served = new Dictionary<string, byte[]>(StringComparer.Ordinal);
                var assets = new Dictionary<string, string>();
                Action<string> releaseFiles = text =>
                {
                    foreach (var name in DesktopEngine.AppFiles)
                    {
                        byte[] b = Encoding.UTF8.GetBytes("// " + text + " " + name);
                        served[DesktopEngine.FileBase + name] = b;
                        assets[name] = Sha(b);
                    }
                };
                const string version = "1.0.0+electron45.2.2";
                string runtimeUrl = DesktopEngine.RuntimeUrl(version);
                Assert(runtimeUrl == "https://github.com/Endcord/EndcordDesktop/releases/download/desktop-1.0.0-electron45.2.2/EndcordDesktop-win32-x64.zip", "The runtime comes from the GitHub release its signed version names");
                Assert(DesktopEngine.RuntimeUrl("1.0.0") == null && DesktopEngine.RuntimeUrl("1.0.0+electron45.2.2/../x") == null, "A version that doesn't name an Electron gives no address");

                byte[] runtime = RuntimeZip(new Dictionary<string, string> { { "EndcordDesktop.exe", "stand-in" }, { "resources/app/package.json", "{}" }, { "resources/app/main.js", "// runtime's own main" } });
                served[runtimeUrl] = runtime;
                releaseFiles("current");
                string manifest = SignedManifest(version, assets, Sha(runtime), "desktop/");
                ReleaseManifest.FetchDesktop = () => manifest;

                int runtimeDownloads = 0;
                var engine = new DesktopEngine(paths) { SkipLaunch = true, UninstallKey = regKey };
                engine.Download = (url, file, progress, ct) =>
                {
                    byte[] b;
                    if (!served.TryGetValue(url, out b)) throw new System.Net.WebException("404 " + url);
                    if (url.EndsWith(".zip")) runtimeDownloads++;
                    File.WriteAllBytes(file, b);
                    progress(b.Length, b.Length);
                };
                string appDir = Path.Combine(engine.InstallDir, "resources", "app");
                double reached = 0;
                engine.Install((ratio, status) => reached = ratio, CancellationToken.None);
                Assert(engine.IsInstalled && FileOps.IsStrictlyInside(engine.Exe, paths.Local), "It installs into the user's own Programs folder");
                foreach (var name in DesktopEngine.AppFiles)
                    Assert(File.ReadAllText(Path.Combine(appDir, name)) == "// current " + name, "A new install starts on the current release's files, not the runtime's: " + name);
                Assert(reached == 1, "Progress ends at 100%");
                using (var key = Registry.CurrentUser.OpenSubKey(regKey))
                {
                    Assert(key != null && (string)key.GetValue("DisplayName") == "Endcord Desktop" && (string)key.GetValue("DisplayVersion") == "1.0.0", "It is listed in Settings > Apps");
                    Assert(((string)key.GetValue("UninstallString")).Contains("--uninstall-desktop"), "Settings > Apps removes it through setup");
                }

                // A release of new files on the same runtime: the six files change, the 140 MB zip isn't fetched again
                File.WriteAllText(Path.Combine(appDir, "update-state.json"), "{}");
                Directory.CreateDirectory(Path.Combine(appDir, "previous"));
                Directory.CreateDirectory(engine.DataDir);
                File.WriteAllText(Path.Combine(engine.DataDir, "Local State"), "signed in");
                releaseFiles("newer");
                manifest = SignedManifest(version, assets, Sha(runtime), "desktop/");
                engine.Install((ratio, status) => { }, CancellationToken.None);
                Assert(runtimeDownloads == 1, "An update that keeps the runtime only downloads the six files");
                Assert(File.ReadAllText(Path.Combine(appDir, "main.js")) == "// newer main.js", "The update's files are in place");
                Assert(!File.Exists(Path.Combine(appDir, "update-state.json")) && !Directory.Exists(Path.Combine(appDir, "previous")), "What the app's updater had kept is cleared");

                // A runtime that isn't the signed one leaves the install as it was
                const string nextVersion = "1.0.1+electron45.2.3";
                byte[] signedRuntime = RuntimeZip(new Dictionary<string, string> { { "EndcordDesktop.exe", "next stand-in" }, { "resources/app/package.json", "{}" } });
                served[DesktopEngine.RuntimeUrl(nextVersion)] = RuntimeZip(new Dictionary<string, string> { { "EndcordDesktop.exe", "planted" }, { "resources/app/package.json", "{}" } });
                manifest = SignedManifest(nextVersion, assets, Sha(signedRuntime), "desktop/");
                string refused = null;
                try { engine.Install((ratio, status) => { }, CancellationToken.None); }
                catch (DesktopSetupException e) { refused = e.MessageKey; }
                Assert(refused == "desktop.err.badDownload", "A runtime that doesn't match the signed SHA-256 is refused");
                Assert(File.ReadAllText(engine.Exe) == "stand-in" && File.ReadAllText(Path.Combine(appDir, "main.js")) == "// newer main.js", "and the installed app is left as it was");

                string unsigned = manifest.Replace("1.0.1", "1.0.2");
                ReleaseManifest.FetchDesktop = () => unsigned;
                refused = null;
                try { engine.Install((ratio, status) => { }, CancellationToken.None); }
                catch (DesktopSetupException e) { refused = e.MessageKey; }
                Assert(refused == "desktop.err.unsigned", "A manifest changed after signing is refused");
                ReleaseManifest.FetchDesktop = () => manifest;

                // A zip entry that climbs out of the folder fails the whole unpack
                string slipZip = Path.Combine(root, "slip.zip");
                File.WriteAllBytes(slipZip, RuntimeZip(new Dictionary<string, string> { { "../../escaped.txt", "x" } }));
                bool slipped = true;
                try { DesktopEngine.Extract(slipZip, Path.Combine(root, "slip"), CancellationToken.None); }
                catch (DesktopSetupException) { slipped = false; }
                Assert(!slipped && !File.Exists(Path.Combine(root, "escaped.txt")), "A zip entry pointing outside the folder is refused");

                // Removing it: the folder and the listing go, the sign-in stays unless asked for
                engine.Uninstall(false, (ratio, status) => { }, CancellationToken.None);
                Assert(!Directory.Exists(engine.InstallDir), "Uninstall removes the app's folder");
                using (var key = Registry.CurrentUser.OpenSubKey(regKey)) Assert(key == null, "and its Settings > Apps entry");
                Assert(File.Exists(Path.Combine(engine.DataDir, "Local State")), "Its sign-in and settings stay unless the user asks");
                Directory.CreateDirectory(engine.InstallDir);
                engine.Uninstall(true, (ratio, status) => { }, CancellationToken.None);
                Assert(!Directory.Exists(engine.DataDir), "Asked to, uninstall removes them too");
            }
            finally
            {
                ReleaseManifest.PublicKey = savedKey;
                ReleaseManifest.FetchDesktop = savedFetch;
                try { Registry.CurrentUser.DeleteSubKeyTree(testKeys, false); } catch { }
                try { Directory.Delete(root, true); } catch { }
            }
        }

        static string CreateSandbox(out InstallerPaths paths)
        {
            string root = Path.Combine(Path.GetTempPath(), "endcord-installer-test-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            string roaming = Path.Combine(root, "Roaming");
            string local = Path.Combine(root, "Local");
            Directory.CreateDirectory(roaming);
            Directory.CreateDirectory(local);
            paths = new InstallerPaths(roaming, local);
            return root;
        }

        static void CreateFakeAsar(string path)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            byte[] buf = new byte[(int)DiscordLocator.OriginalAsarMinSize + 4096];
            for (int i = 0; i < buf.Length; i++) buf[i] = (byte)('A' + (i % 26));
            File.WriteAllBytes(path, buf);
        }

        static void CreatePayloadDir(string dir)
        {
            Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir, "patcher.js"), "// endcord patcher\n");
            File.WriteAllText(Path.Combine(dir, "preload.js"), "// endcord preload\n");
            File.WriteAllText(Path.Combine(dir, "renderer.js"), "definePlugin({ name: \"AlwaysAnimate\" });\n");
            File.WriteAllText(Path.Combine(dir, "renderer.css"), "/* endcord css */\n");
        }

        static void TestPayloadIntegrity()
        {
            string tmp = Path.Combine(Path.GetTempPath(), "endcord-payload-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tmp);
            try
            {
                Assert(InstallationEngine.EmbeddedPayloadHash("patcher.js") != null, "This build should carry the payload hash list");

                string planted = Path.Combine(tmp, "patcher.js");
                File.WriteAllText(planted, "require('child_process').exec('calc');\n");
                Assert(!InstallationEngine.PayloadMatchesEmbeddedHash("patcher.js", planted), "A file that isn't the embedded payload must be refused");

                InstallationEngine.CustomPayloadDirectory = null;
                string extracted = Path.Combine(tmp, "extracted.js");
                InstallationEngine.ExtractPayloadAsset("patcher.js", extracted, CancellationToken.None);
                Assert(InstallationEngine.PayloadMatchesEmbeddedHash("patcher.js", extracted), "The embedded payload must match its own hash");
            }
            finally
            {
                try { Directory.Delete(tmp, true); } catch { }
            }
        }

        static void TestLocalization()
        {
            Assert(Loc.SupportedLanguages.Length == 5, "Expected 5 supported languages");
            var missing = Loc.FindMissingTranslations();
            Assert(missing.Count == 0, "Missing translations: " + string.Join(", ", missing.ToArray()));

            string[] clients = { "Vencord", "Equicord", "Mallcord", "Nightcord" };
            foreach (var lang in Loc.SupportedLanguages)
            {
                Loc.SetLanguage(lang.Code);
                Assert(Loc.CurrentLanguage == lang.Code, "Language did not switch to " + lang.Code);
                foreach (var cl in clients)
                {
                    string msg = Loc.F("mig.banner.prompt", cl);
                    Assert(msg.Contains(cl), "Prompt in " + lang.Code + " missing client name " + cl);
                    Assert(msg.Contains("Endcord"), "Prompt in " + lang.Code + " missing Endcord");
                }
            }
            Loc.SetLanguage("en");
        }

        static void TestClientDetection()
        {
            InstallerPaths paths;
            string sandbox = CreateSandbox(out paths);
            try
            {
                // 1. Discord Stable with Vencord stub app.asar
                string stableRes = Path.Combine(paths.Local, "Discord", "app-1.0.9030", "resources");
                CreateFakeAsar(Path.Combine(stableRes, "_app.asar"));
                File.WriteAllText(Path.Combine(stableRes, "app.asar"), "require('C:/Users/test/AppData/Roaming/Vencord/dist/patcher.js');");

                // 2. Discord PTB with Equicord app folder
                string ptbRes = Path.Combine(paths.Local, "DiscordPTB", "app-1.0.1020", "resources");
                CreateFakeAsar(Path.Combine(ptbRes, "_app.asar"));
                Directory.CreateDirectory(Path.Combine(ptbRes, "app"));
                File.WriteAllText(Path.Combine(ptbRes, "app", "index.js"), "require('../../Equicord/patcher.js');");

                // 3. Discord Canary with Nightcord in desktop_core
                string canaryApp = Path.Combine(paths.Local, "DiscordCanary", "app-1.0.500");
                CreateFakeAsar(Path.Combine(canaryApp, "resources", "app.asar"));
                string coreDir = Path.Combine(canaryApp, "modules", "discord_desktop_core-1", "discord_desktop_core");
                Directory.CreateDirectory(coreDir);
                File.WriteAllText(Path.Combine(coreDir, "index.js"), "require('nightcord');\nmodule.exports = require('./core.asar');");

                // 4. Mallcord & Vencord settings in Roaming
                string mallSettings = Path.Combine(paths.Roaming, "Mallcord", "settings");
                Directory.CreateDirectory(mallSettings);
                File.WriteAllText(Path.Combine(mallSettings, "settings.json"), "{\"useQuickCss\":true,\"plugins\":{\"AlwaysAnimate\":{\"enabled\":true}}}");

                string venSettings = Path.Combine(paths.Roaming, "Vencord", "settings");
                Directory.CreateDirectory(venSettings);
                File.WriteAllText(Path.Combine(venSettings, "settings.json"), "{\"useQuickCss\":true,\"plugins\":{\"SilentTyping\":{\"enabled\":true}}}");

                var det = ClientDetector.Detect(paths, null);
                Assert(det.Installs.Count == 3, "Expected 3 Discord installs, found " + det.Installs.Count);
                Assert(det.Find("vencord") != null && det.Find("vencord").InjectedInto.Count == 1, "Expected Vencord detected");
                Assert(det.Find("equicord") != null && det.Find("equicord").InjectedInto.Count == 1, "Expected Equicord detected");
                Assert(det.Find("nightcord") != null && det.Find("nightcord").InjectedInto.Count == 1, "Expected Nightcord detected");
                Assert(det.Find("mallcord") != null && det.Find("mallcord").CanMigrate, "Expected Mallcord settings detected");

                // Prefs persistence check
                var prefs = new Prefs(paths) { Language = "tr", Relaunch = false };
                Assert(prefs.Save(), "Prefs save failed");
                var prefsReloaded = new Prefs(paths);
                Assert(prefsReloaded.Language == "tr" && !prefsReloaded.Relaunch, "Prefs reload mismatch");
            }
            finally
            {
                try { Directory.Delete(sandbox, true); } catch { }
            }
        }

        static void TestMigrationAndBackups()
        {
            InstallerPaths paths;
            string sandbox = CreateSandbox(out paths);
            try
            {
                // Seed existing Endcord settings to verify backup & restore
                Directory.CreateDirectory(paths.SettingsDir);
                File.WriteAllText(paths.SettingsFile, "{\"useQuickCss\":false,\"plugins\":{\"BlurNSFW\":{\"enabled\":true}}}");

                // Seed Vencord profile with compatible + incompatible items
                string venDir = Path.Combine(paths.Roaming, "Vencord");
                string venSettings = Path.Combine(venDir, "settings");
                string venThemes = Path.Combine(venDir, "themes");
                Directory.CreateDirectory(venSettings);
                Directory.CreateDirectory(venThemes);

                string sampleJson =
                    "{\n" +
                    "    \"useQuickCss\": true,\n" +
                    "    \"themeLinks\": [\"https://example.com/a.css\"],\n" +
                    "    \"vencordExclusiveRootFlag\": 123,\n" +
                    "    \"cloud\": { \"authenticated\": true, \"url\": \"https://api.vencord.dev\" },\n" +
                    "    \"plugins\": {\n" +
                    "        \"AlwaysAnimate\": { \"enabled\": true },\n" +
                    "        \"SilentTyping\": { \"enabled\": true, \"showIcon\": true },\n" +
                    "        \"NonExistentForkPluginXYZ\": { \"enabled\": true }\n" +
                    "    }\n" +
                    "}";
                File.WriteAllText(Path.Combine(venSettings, "settings.json"), sampleJson);
                File.WriteAllText(Path.Combine(venSettings, "quickCss.css"), "body { --test: 1; }");
                File.WriteAllText(Path.Combine(venThemes, "midnight.theme.css"), "/* theme */");

                var det = ClientDetector.Detect(paths, null);
                var ven = det.Find("vencord");
                Assert(ven != null && ven.CanMigrate, "Vencord should be migratable");

                var plan = MigrationEngine.Analyze(ven);
                Assert(plan.CompatiblePluginCount == 2, "Expected 2 compatible plugins, got " + plan.CompatiblePluginCount);
                Assert(plan.IncompatiblePluginCount == 1, "Expected 1 incompatible plugin, got " + plan.IncompatiblePluginCount);
                Assert(plan.IncompatibleCoreCount == 2, "Expected 2 incompatible core items (cloud auth + exclusive flag)");
                Assert(plan.ThemeCount == 1 && plan.HasQuickCss, "Expected 1 theme and QuickCSS");

                var res = MigrationEngine.Execute(paths, plan, CancellationToken.None);
                Assert(res.Success && res.Backup != null, "Migration should succeed and create backup");
                Assert(res.MigratedPlugins == 2 && res.SkippedPlugins == 1, "Plugin counts mismatch");
                Assert(File.Exists(Path.Combine(paths.ThemesDir, "midnight.theme.css")), "Theme not copied");
                Assert(File.Exists(paths.QuickCssFile), "QuickCSS not copied");

                var migratedJson = Json.ParseObject(FileOps.ReadText(paths.SettingsFile));
                Assert(migratedJson.GetBool("useQuickCss", false), "useQuickCss should be true");
                Assert(!migratedJson.ContainsKey("vencordExclusiveRootFlag"), "Incompatible root key should be excluded");
                Assert(migratedJson.GetObject("plugins").GetObject("AlwaysAnimate").GetBool("enabled", false), "AlwaysAnimate should be enabled");
                Assert(!migratedJson.GetObject("plugins").ContainsKey("NonExistentForkPluginXYZ"), "Unsupported plugin should be excluded");

                // Verify source Vencord settings were NOT modified or deleted
                Assert(File.Exists(Path.Combine(venSettings, "settings.json")), "Source Vencord settings must remain intact");

                // Test restoring backup snapshot
                MigrationEngine.RestoreBackup(paths, res.Backup, CancellationToken.None);
                var restoredJson = Json.ParseObject(FileOps.ReadText(paths.SettingsFile));
                Assert(!restoredJson.GetBool("useQuickCss", true), "Restored backup should have useQuickCss=false");
            }
            finally
            {
                try { Directory.Delete(sandbox, true); } catch { }
            }
        }

        static void TestInstallUpdateUninstall()
        {
            InstallerPaths paths;
            string sandbox = CreateSandbox(out paths);
            try
            {
                string payloadDir = Path.Combine(sandbox, "payload");
                CreatePayloadDir(payloadDir);
                InstallationEngine.CustomPayloadDirectory = payloadDir;

                // Create Discord Stable with Vencord injected + Vencord dist & settings
                string stableRes = Path.Combine(paths.Local, "Discord", "app-1.0.9030", "resources");
                CreateFakeAsar(Path.Combine(stableRes, "_app.asar"));
                Directory.CreateDirectory(Path.Combine(stableRes, "app"));
                File.WriteAllText(Path.Combine(stableRes, "app", "index.js"), "require('vencord/patcher.js');");

                string venDist = Path.Combine(paths.Roaming, "Vencord", "dist");
                string venSettings = Path.Combine(paths.Roaming, "Vencord", "settings");
                Directory.CreateDirectory(venDist);
                Directory.CreateDirectory(venSettings);
                File.WriteAllText(Path.Combine(venDist, "patcher.js"), "// vencord");
                File.WriteAllText(Path.Combine(venSettings, "settings.json"), "{\"useQuickCss\":true}");

                // Discord halfway through downloading its own update: a folder with no app.asar yet, which isn't a version
                string updating = Path.Combine(paths.Local, "Discord", ".app-1.0.9031.installing");
                Directory.CreateDirectory(Path.Combine(updating, "resources"));

                var det = ClientDetector.Detect(paths, null);
                Assert(det.Installs.Count == 1 && det.Installs[0].AppDirs.Count == 1 && !det.Installs[0].IsDamaged,
                    "Discord's unfinished update folder must not count as a version, found " + (det.Installs.Count == 1 ? det.Installs[0].AppDirs.Count : -1));
                var conflicts = InstallationEngine.FindConflicts(det.Installs);
                Assert(conflicts.Count == 1 && conflicts[0].ForeignMods[0].Id == "vencord", "Should detect Vencord conflict");

                // 1. Install Endcord with Turkish selected (replacing Vencord loader & syncing client language)
                Loc.SetLanguage("tr");
                var installOut = InstallationEngine.RunInstall(paths, det.Installs, false, false, null, CancellationToken.None);
                Assert(installOut.Success && !installOut.WasUpdate, "First install should succeed");
                Assert(Directory.GetFileSystemEntries(Path.Combine(updating, "resources")).Length == 0, "Discord's unfinished update must be left alone");
                Assert(installOut.AffectedInstalls[0].HasEndcord, "Endcord should be active after install");
                var clientSettings = Json.ParseObject(FileOps.ReadText(paths.SettingsFile));
                Assert(clientSettings != null && Convert.ToString(clientSettings["language"]) == "tr", "Client settings.json should inherit installer language 'tr'");
                Loc.SetLanguage("en");

                // 2. Running it again over an Endcord that's already installed updates it
                var det2 = ClientDetector.Detect(paths, null);
                var updateOut = InstallationEngine.RunInstall(paths, det2.Installs, false, false, null, CancellationToken.None);
                Assert(updateOut.Success && updateOut.WasUpdate, "Second install should be recognized as seamless update");

                // 2b. An installer older than the Endcord it finds (Endcord updated itself since) keeps the newer files, when
                // the current signed release confirms they're Endcord's
                var savedFetch = ReleaseManifest.Fetch;
                var savedKey = ReleaseManifest.PublicKey;
                string distPatcher = Path.Combine(paths.Dist, "patcher.js");
                try
                {
                    ReleaseManifest.PublicKey = TestPublicKey();
                    File.WriteAllText(Path.Combine(payloadDir, "patcher.js"), "// Endcord aaaaaaa\n// Version: 4.1.1\n// endcord patcher\n");
                    string newer = "// Endcord bbbbbbb\n// Version: 4.10.0\n// newer patcher\n";
                    File.WriteAllText(distPatcher, newer);
                    var released = new Dictionary<string, string>();
                    foreach (var name in InstallationEngine.PayloadFiles) released[name] = FileOps.Sha256(Path.Combine(paths.Dist, name));
                    string manifest = SignedManifest("4.10.0", released);
                    ReleaseManifest.Fetch = () => manifest;

                    var oldOut = InstallationEngine.RunInstall(paths, det2.Installs, false, false, null, CancellationToken.None);
                    Assert(oldOut.Success && oldOut.KeptVersion == "4.10.0" && oldOut.PayloadVersion == "4.1.1",
                        "An older installer should keep Endcord 4.10.0, kept " + (oldOut.KeptVersion ?? "nothing"));
                    Assert(FileOps.ReadText(distPatcher) == newer, "The newer patcher.js must not be replaced by an older one");
                    Assert(oldOut.AffectedInstalls.Count == 1 && oldOut.AffectedInstalls[0].HasEndcord, "Discord should still be hooked up after keeping the newer files");

                    // A file planted in the folder that claims a high version isn't the release's: replaced
                    File.WriteAllText(distPatcher, "// Endcord planted\n// Version: 9.9.9\n// not Endcord's\n");
                    var plantedOut = InstallationEngine.RunInstall(paths, det2.Installs, false, false, null, CancellationToken.None);
                    Assert(plantedOut.Success && plantedOut.KeptVersion == null && FileOps.ReadText(distPatcher).Contains("4.1.1"),
                        "Files the release doesn't vouch for must be replaced, kept " + (plantedOut.KeptVersion ?? "nothing"));

                    // Offline, there's no release to vouch for them: replaced
                    File.WriteAllText(distPatcher, newer);
                    ReleaseManifest.Fetch = () => null;
                    var offlineOut = InstallationEngine.RunInstall(paths, det2.Installs, false, false, null, CancellationToken.None);
                    Assert(offlineOut.Success && offlineOut.KeptVersion == null && FileOps.ReadText(distPatcher).Contains("4.1.1"), "Without a manifest the installer's files are installed");

                    // A manifest changed after it was signed vouches for nothing
                    File.WriteAllText(distPatcher, newer);
                    ReleaseManifest.Fetch = () => manifest.Replace("\"4.10.0\"", "\"4.10.1\"");
                    var forgedOut = InstallationEngine.RunInstall(paths, det2.Installs, false, false, null, CancellationToken.None);
                    Assert(forgedOut.Success && forgedOut.KeptVersion == null && FileOps.ReadText(distPatcher).Contains("4.1.1"), "A manifest with a bad signature must not keep anything");

                    // 2c. One that is newer, or an install from before versions were written down, updates as before
                    ReleaseManifest.Fetch = () => { throw new Exception("The manifest must not be asked for when the installer is the newer one"); };
                    File.WriteAllText(distPatcher, "// Endcord ccccccc\n// Version: 4.1.0\n");
                    var newOut = InstallationEngine.RunInstall(paths, det2.Installs, false, false, null, CancellationToken.None);
                    Assert(newOut.Success && newOut.KeptVersion == null && FileOps.ReadText(distPatcher).Contains("4.1.1"), "A newer installer should update Endcord");
                    File.WriteAllText(distPatcher, "// Endcord 479410c\n// Standalone: true\n");
                    var unknownOut = InstallationEngine.RunInstall(paths, det2.Installs, false, false, null, CancellationToken.None);
                    Assert(unknownOut.Success && unknownOut.KeptVersion == null && FileOps.ReadText(distPatcher).Contains("4.1.1"), "An install without a version line should be updated");
                    Assert(InstallationEngine.ReadPayloadVersion(Path.Combine(payloadDir, "missing.js")) == null, "A missing patcher has no version");
                }
                finally
                {
                    ReleaseManifest.Fetch = savedFetch;
                    ReleaseManifest.PublicKey = savedKey;
                }

                // 3a. Cleanup must leave Vencord's files alone while another Discord flavour still loads them
                string devRes = Path.Combine(paths.Local, "DiscordDevelopment", "app-1.0.1035", "resources");
                CreateFakeAsar(Path.Combine(devRes, "_app.asar"));
                File.WriteAllText(Path.Combine(devRes, "app.asar"), "require(\"" + Path.Combine(venDist, "patcher.js").Replace("\\", "\\\\") + "\")");
                var detDev = ClientDetector.Detect(paths, null);
                InstallationEngine.CleanupPreviousClient(paths, det.Find("vencord"), detDev.Installs, true, CancellationToken.None);
                Assert(Directory.Exists(venDist), "Vencord dist must stay while Discord Development still loads it");
                Directory.Delete(Path.Combine(paths.Local, "DiscordDevelopment"), true);

                // 3. Confirmed previous-client cleanup: removes Vencord/dist but keeps Vencord/settings
                var venClient = det.Find("vencord");
                InstallationEngine.CleanupPreviousClient(paths, venClient, det2.Installs, true, CancellationToken.None);
                Assert(!Directory.Exists(venDist), "Vencord dist should be cleaned up");
                Assert(File.Exists(Path.Combine(venSettings, "settings.json")), "Vencord user settings must NEVER be deleted");

                // 4. Uninstall Endcord: restores vanilla app.asar
                var det3 = ClientDetector.Detect(paths, null);
                var uninstOut = InstallationEngine.RunUninstall(paths, det3.Installs, false, null, CancellationToken.None);
                Assert(uninstOut.Success, "Uninstall should succeed");
                Assert(File.Exists(Path.Combine(stableRes, "app.asar")) && !Directory.Exists(Path.Combine(stableRes, "app")),
                    "Vanilla app.asar must be restored");
            }
            finally
            {
                InstallationEngine.CustomPayloadDirectory = null;
                try { Directory.Delete(sandbox, true); } catch { }
            }
        }

        static void TestResilienceAndErrors()
        {
            InstallerPaths paths;
            string sandbox = CreateSandbox(out paths);
            try
            {
                string payloadDir = Path.Combine(sandbox, "payload");
                CreatePayloadDir(payloadDir);
                InstallationEngine.CustomPayloadDirectory = payloadDir;

                // 1. Cancelling halfway puts everything back
                string stableRes = Path.Combine(paths.Local, "Discord", "app-1.0.9030", "resources");
                CreateFakeAsar(Path.Combine(stableRes, "app.asar"));
                var det = ClientDetector.Detect(paths, null);

                using (var cts = new CancellationTokenSource())
                {
                    var outcome = InstallationEngine.RunInstall(paths, det.Installs, false, false, ev =>
                    {
                        if (ev.Stage == InstallStage.PatchingClient) cts.Cancel();
                    }, cts.Token);

                    Assert(outcome.Cancelled && outcome.RolledBack, "Cancelled install should roll back cleanly");
                    Assert(File.Exists(Path.Combine(stableRes, "app.asar")) && !Directory.Exists(Path.Combine(stableRes, "app")),
                        "Original app.asar must be intact after cancellation rollback");
                }

                // 1b. A patch stopped after app.asar went to _app.asar is still rolled back. A file named "app" makes
                // creating resources/app fail; the retry it causes is where the cancel lands
                string appBlocker = Path.Combine(stableRes, "app");
                File.WriteAllText(appBlocker, "not a folder");
                using (var cts = new CancellationTokenSource())
                {
                    Action<string> cancelOnRetry = subject => cts.Cancel();
                    FileOps.RetryingLocked += cancelOnRetry;
                    try
                    {
                        var midOutcome = InstallationEngine.RunInstall(paths, ClientDetector.Detect(paths, null).Installs, false, false, null, cts.Token);
                        Assert(midOutcome.Cancelled && midOutcome.RolledBack, "An install cancelled halfway through a folder should roll back");
                        Assert(File.Exists(Path.Combine(stableRes, "app.asar")) && !File.Exists(Path.Combine(stableRes, "_app.asar")),
                            "app.asar must be put back when the patch stopped after moving it");
                    }
                    finally
                    {
                        FileOps.RetryingLocked -= cancelOnRetry;
                        File.Delete(appBlocker);
                    }
                }

                // 1c. An unreadable settings.json is left for the client's .bak recovery; the language still goes to installer-state.json
                Directory.CreateDirectory(paths.SettingsDir);
                File.WriteAllText(paths.SettingsFile, "{\"plugins\": {");
                InstallationEngine.SyncClientLanguageSetting(paths, "tr");
                Assert(File.ReadAllText(paths.SettingsFile) == "{\"plugins\": {", "A settings.json that doesn't parse must not be overwritten");
                Assert(File.ReadAllText(Path.Combine(paths.EndcordRoot, "installer-state.json")).Contains("\"tr\""), "The language must still reach installer-state.json");
                File.WriteAllText(paths.SettingsFile, "{\"plugins\": {}}");
                InstallationEngine.SyncClientLanguageSetting(paths, "fr");
                string synced = File.ReadAllText(paths.SettingsFile);
                Assert(synced.Contains("\"fr\"") && synced.Contains("plugins"), "A readable settings.json gets the language and keeps the rest");

                // 1d. Uninstalling one Discord keeps dist while an install on a custom path still loads it
                string customRoot = Path.Combine(sandbox, "PortableDiscord");
                CreateFakeAsar(Path.Combine(customRoot, "app-1.0.9030", "resources", "app.asar"));
                var custom = DiscordLocator.OpenCustom(customRoot);
                var stableOnly = ClientDetector.Detect(paths, null).Installs.Find(i => i.Id == "stable");
                var bothOut = InstallationEngine.RunInstall(paths, new[] { stableOnly, custom }, false, false, null, CancellationToken.None);
                Assert(bothOut.Success, "Installing on a custom path should succeed");
                stableOnly = ClientDetector.Detect(paths, null).Installs.Find(i => i.Id == "stable");
                var partialOut = InstallationEngine.RunUninstall(paths, new[] { stableOnly }, false, null, CancellationToken.None, new[] { customRoot });
                Assert(partialOut.Success && File.Exists(Path.Combine(paths.Dist, "patcher.js")), "dist must stay while a custom-path install still uses it");
                var lastOut = InstallationEngine.RunUninstall(paths, new[] { DiscordLocator.OpenCustom(customRoot) }, false, null, CancellationToken.None, new[] { customRoot });
                Assert(lastOut.Success && !Directory.Exists(paths.Dist), "dist goes with the last install that used it");

                // 2. A file that's locked for a moment gets retried
                string lockedFile = Path.Combine(sandbox, "locked.txt");
                File.WriteAllText(lockedFile, "initial");
                var fs = new FileStream(lockedFile, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
                ThreadPool.QueueUserWorkItem(_ =>
                {
                    Thread.Sleep(220);
                    try { fs.Dispose(); } catch { }
                });
                FileOps.Retry(() => File.WriteAllText(lockedFile, "updated"), lockedFile, CancellationToken.None);
                Assert(File.ReadAllText(lockedFile) == "updated", "Retry should succeed once lock releases");

                // 3. A Discord install with no app.asar
                string damagedRes = Path.Combine(paths.Local, "DiscordCanary", "app-1.0.100", "resources");
                Directory.CreateDirectory(damagedRes);
                File.WriteAllText(Path.Combine(damagedRes, "app.asar"), "tiny broken stub without backup");
                var detDamaged = ClientDetector.Detect(paths, null);
                var canary = detDamaged.Installs.Find(i => i.Id == "canary");
                Assert(canary != null && canary.IsDamaged, "Canary without original asar should be marked damaged");

                var dmgOutcome = InstallationEngine.RunInstall(paths, new[] { canary }, false, false, null, CancellationToken.None);
                Assert(!dmgOutcome.Success && dmgOutcome.FailureKind == FailureKind.DiscordDamaged,
                    "Damaged install should fail with FailureKind.DiscordDamaged");
            }
            finally
            {
                InstallationEngine.CustomPayloadDirectory = null;
                try { Directory.Delete(sandbox, true); } catch { }
            }
        }
    }
}
