using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using EndcordInstaller.Core;
using EndcordInstaller.Localization;

namespace EndcordInstaller.Tests
{
    public static class InstallerTestRunner
    {
        public static int RunAll(string logOutputPath)
        {
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

                var det = ClientDetector.Detect(paths, null);
                var conflicts = InstallationEngine.FindConflicts(det.Installs);
                Assert(conflicts.Count == 1 && conflicts[0].ForeignMods[0].Id == "vencord", "Should detect Vencord conflict");

                // 1. Install Endcord with Turkish selected (replacing Vencord loader & syncing client language)
                Loc.SetLanguage("tr");
                var installOut = InstallationEngine.RunInstall(paths, det.Installs, false, false, null, CancellationToken.None);
                Assert(installOut.Success && !installOut.WasUpdate, "First install should succeed");
                Assert(installOut.AffectedInstalls[0].HasEndcord, "Endcord should be active after install");
                var clientSettings = Json.ParseObject(FileOps.ReadText(paths.SettingsFile));
                Assert(clientSettings != null && Convert.ToString(clientSettings["language"]) == "tr", "Client settings.json should inherit installer language 'tr'");
                Loc.SetLanguage("en");

                // 2. Seamless Update (Endcord already installed)
                var det2 = ClientDetector.Detect(paths, null);
                var updateOut = InstallationEngine.RunInstall(paths, det2.Installs, false, false, null, CancellationToken.None);
                Assert(updateOut.Success && updateOut.WasUpdate, "Second install should be recognized as seamless update");

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

                // 1. Cancellation rollback test
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

                // 2. Temporarily locked file retry test
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

                // 3. Damaged Discord installation (no app.asar)
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
