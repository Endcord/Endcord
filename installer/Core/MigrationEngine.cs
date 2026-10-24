using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;

namespace EndcordInstaller.Core
{
    public enum MigrationItemKind
    {
        CoreSetting,
        Plugin,
        ThemeFile,
        QuickCss,
        NativeSetting
    }

    public sealed class MigrationPreviewItem
    {
        public MigrationItemKind Kind { get; set; }
        public string Key { get; set; }
        public string DisplayName { get; set; }
        public bool Compatible { get; set; }
        public string ReasonKey { get; set; }
        public string Detail { get; set; }
    }

    public sealed class MigrationPlan
    {
        public DetectedClient Source { get; set; }
        public List<MigrationPreviewItem> CompatibleItems { get; private set; }
        public List<MigrationPreviewItem> IncompatibleItems { get; private set; }

        public int CompatiblePluginCount { get; set; }
        public int IncompatiblePluginCount { get; set; }
        public int CompatibleCoreCount { get; set; }
        public int IncompatibleCoreCount { get; set; }
        public int ThemeCount { get; set; }
        public bool HasQuickCss { get; set; }

        // User toggles in migration modal/view
        public bool ImportCoreSettings { get; set; }
        public bool ImportPlugins { get; set; }
        public bool ImportThemes { get; set; }
        public bool ImportQuickCss { get; set; }

        public MigrationPlan()
        {
            CompatibleItems = new List<MigrationPreviewItem>();
            IncompatibleItems = new List<MigrationPreviewItem>();
            ImportCoreSettings = true;
            ImportPlugins = true;
            ImportThemes = true;
            ImportQuickCss = true;
        }
    }

    public sealed class BackupSnapshot
    {
        public string Id { get; set; }
        public string DirectoryPath { get; set; }
        public DateTime CreatedAt { get; set; }
        public string SourceModName { get; set; }
        public string Reason { get; set; }
        public bool HadEndcordSettings { get; set; }
    }

    public sealed class MigrationResult
    {
        public bool Success { get; set; }
        public BackupSnapshot Backup { get; set; }
        public int MigratedPlugins { get; set; }
        public int SkippedPlugins { get; set; }
        public int MigratedCoreSettings { get; set; }
        public int MigratedThemes { get; set; }
        public bool MigratedQuickCss { get; set; }
        public bool RolledBack { get; set; }
        public string ErrorMessage { get; set; }
    }

    public static class MigrationEngine
    {
        // Root keys supported by Endcord's Settings store (src/api/Settings.ts)
        static readonly HashSet<string> SupportedRootKeys = new HashSet<string>(StringComparer.Ordinal)
        {
            "autoUpdate",
            "autoUpdateNotification",
            "useQuickCss",
            "eagerPatches",
            "enabledThemes",
            "enableReactDevtools",
            "themeLinks",
            "frameless",
            "transparent",
            "winCtrlQ",
            "macosVibrancyStyle",
            "windowsMaterial",
            "disableMinSize",
            "winNativeTitleBar",
            "plugins",
            "uiElements",
            "notifications",
            "cloud",
            "language"
        };

        /// <summary>
        /// Builds a full inspection & preview plan of what can and cannot be migrated from a detected client.
        /// </summary>
        public static MigrationPlan Analyze(DetectedClient client)
        {
            if (client == null) throw new ArgumentNullException("client");
            var plan = new MigrationPlan { Source = client };
            var src = client.Settings;
            if (src == null) return plan;

            if (client.Mod.Format == SettingsFormat.VencordFamily)
            {
                AnalyzeVencordFamily(plan, src);
            }
            else if (client.Mod.Format == SettingsFormat.BetterDiscord)
            {
                AnalyzeBetterDiscord(plan, src);
            }

            return plan;
        }

        static void AnalyzeVencordFamily(MigrationPlan plan, SettingsSource src)
        {
            if (!string.IsNullOrEmpty(src.SettingsFile) && File.Exists(src.SettingsFile))
            {
                try
                {
                    var root = Json.ParseObject(FileOps.ReadText(src.SettingsFile));
                    foreach (var kv in root)
                    {
                        if (kv.Key == "plugins") continue;

                        if (kv.Key == "cloud")
                        {
                            var cloudObj = kv.Value as JsonObject;
                            if (cloudObj != null && cloudObj.GetBool("authenticated", false))
                            {
                                plan.IncompatibleCoreCount++;
                                plan.IncompatibleItems.Add(new MigrationPreviewItem
                                {
                                    Kind = MigrationItemKind.CoreSetting,
                                    Key = "cloud.authenticated",
                                    DisplayName = "cloud",
                                    Compatible = false,
                                    ReasonKey = "mig.reason.cloudAuth",
                                    Detail = "authenticatedSession"
                                });
                                continue;
                            }
                        }

                        if (SupportedRootKeys.Contains(kv.Key))
                        {
                            plan.CompatibleCoreCount++;
                            plan.CompatibleItems.Add(new MigrationPreviewItem
                            {
                                Kind = MigrationItemKind.CoreSetting,
                                Key = kv.Key,
                                DisplayName = kv.Key,
                                Compatible = true,
                                ReasonKey = "mig.reason.compatibleCore",
                                Detail = SummarizeValue(kv.Value)
                            });
                        }
                        else
                        {
                            plan.IncompatibleCoreCount++;
                            plan.IncompatibleItems.Add(new MigrationPreviewItem
                            {
                                Kind = MigrationItemKind.CoreSetting,
                                Key = kv.Key,
                                DisplayName = kv.Key,
                                Compatible = false,
                                ReasonKey = "mig.reason.clientSpecificSetting",
                                Detail = SummarizeValue(kv.Value)
                            });
                        }
                    }

                    var plugins = root.GetObject("plugins");
                    if (plugins != null)
                    {
                        foreach (var pkv in plugins)
                        {
                            var pObj = pkv.Value as JsonObject;
                            bool enabled = pObj != null && pObj.GetBool("enabled", false);
                            int optCount = pObj != null ? Math.Max(0, pObj.Count - 1) : 0;

                            // Skip disabled plugins with no custom options to keep preview clean & meaningful
                            if (!enabled && optCount == 0) continue;

                            bool ok = KnownPlugins.IsSupported(pkv.Key);
                            var item = new MigrationPreviewItem
                            {
                                Kind = MigrationItemKind.Plugin,
                                Key = pkv.Key,
                                DisplayName = pkv.Key,
                                Compatible = ok,
                                ReasonKey = ok ? "mig.reason.compatiblePlugin" : "mig.reason.unsupportedPlugin",
                                Detail = enabled ? (optCount > 0 ? "enabled+" + optCount : "enabled") : ("options:" + optCount)
                            };

                            if (ok)
                            {
                                plan.CompatiblePluginCount++;
                                plan.CompatibleItems.Add(item);
                            }
                            else
                            {
                                plan.IncompatiblePluginCount++;
                                plan.IncompatibleItems.Add(item);
                            }
                        }
                    }
                }
                catch
                {
                    plan.IncompatibleCoreCount++;
                    plan.IncompatibleItems.Add(new MigrationPreviewItem
                    {
                        Kind = MigrationItemKind.CoreSetting,
                        Key = "settings.json",
                        DisplayName = "settings.json",
                        Compatible = false,
                        ReasonKey = "mig.reason.corruptJson",
                        Detail = "corrupt"
                    });
                }
            }

            // QuickCSS
            if (src.HasQuickCss && !string.IsNullOrEmpty(src.QuickCssFile) && File.Exists(src.QuickCssFile))
            {
                long sz = FileOps.SizeOf(src.QuickCssFile);
                plan.HasQuickCss = true;
                plan.CompatibleItems.Add(new MigrationPreviewItem
                {
                    Kind = MigrationItemKind.QuickCss,
                    Key = "quickCss.css",
                    DisplayName = "quickCss.css",
                    Compatible = true,
                    ReasonKey = "mig.reason.compatibleCss",
                    Detail = sz + " B"
                });
            }

            // Themes
            if (!string.IsNullOrEmpty(src.ThemesDir) && Directory.Exists(src.ThemesDir))
            {
                try
                {
                    foreach (var f in Directory.GetFiles(src.ThemesDir, "*.css"))
                    {
                        string name = Path.GetFileName(f);
                        plan.ThemeCount++;
                        plan.CompatibleItems.Add(new MigrationPreviewItem
                        {
                            Kind = MigrationItemKind.ThemeFile,
                            Key = name,
                            DisplayName = name,
                            Compatible = true,
                            ReasonKey = "mig.reason.compatibleTheme",
                            Detail = FileOps.SizeOf(f) + " B"
                        });
                    }
                }
                catch { }
            }
        }

        static void AnalyzeBetterDiscord(MigrationPlan plan, SettingsSource src)
        {
            if (!string.IsNullOrEmpty(src.ThemesDir) && Directory.Exists(src.ThemesDir))
            {
                try
                {
                    foreach (var f in Directory.GetFiles(src.ThemesDir, "*.theme.css"))
                    {
                        string name = Path.GetFileName(f);
                        plan.ThemeCount++;
                        plan.CompatibleItems.Add(new MigrationPreviewItem
                        {
                            Kind = MigrationItemKind.ThemeFile,
                            Key = name,
                            DisplayName = name,
                            Compatible = true,
                            ReasonKey = "mig.reason.compatibleTheme",
                            Detail = FileOps.SizeOf(f) + " B"
                        });
                    }
                }
                catch { }
            }

            if (!string.IsNullOrEmpty(src.PluginsDir) && Directory.Exists(src.PluginsDir))
            {
                try
                {
                    foreach (var f in Directory.GetFiles(src.PluginsDir, "*.plugin.js"))
                    {
                        string name = Path.GetFileName(f);
                        plan.IncompatiblePluginCount++;
                        plan.IncompatibleItems.Add(new MigrationPreviewItem
                        {
                            Kind = MigrationItemKind.Plugin,
                            Key = name,
                            DisplayName = name,
                            Compatible = false,
                            ReasonKey = "mig.reason.bdPluginFormat",
                            Detail = "BetterDiscord JS"
                        });
                    }
                }
                catch { }
            }
        }

        static string SummarizeValue(object v)
        {
            if (v == null) return "null";
            if (v is bool) return (bool)v ? "true" : "false";
            if (v is string) return (string)v;
            if (v is JsonNumber) return v.ToString();
            var l = v as List<object>;
            if (l != null) return l.Count + " items";
            var o = v as JsonObject;
            if (o != null) return o.Count + " keys";
            return "";
        }

        /// <summary>
        /// Creates a timestamped backup of Endcord's current settings/themes and a safety snapshot of the source client's settings.
        /// </summary>
        public static BackupSnapshot CreateBackup(InstallerPaths paths, string sourceModName, string reason, CancellationToken ct)
        {
            Directory.CreateDirectory(paths.BackupsDir);
            string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss-fff");
            string safeReason = string.IsNullOrEmpty(reason) ? "manual" : reason.Replace(" ", "-").ToLowerInvariant();
            string id = stamp + "-" + safeReason;
            string dir = Path.Combine(paths.BackupsDir, id);
            Directory.CreateDirectory(dir);

            bool hadEndcord = File.Exists(paths.SettingsFile) || File.Exists(paths.QuickCssFile) ||
                              (Directory.Exists(paths.ThemesDir) && Directory.GetFiles(paths.ThemesDir, "*.css").Length > 0);

            string endcordBackup = Path.Combine(dir, "endcord");
            Directory.CreateDirectory(endcordBackup);

            if (Directory.Exists(paths.SettingsDir))
                FileOps.CopyDirectory(paths.SettingsDir, Path.Combine(endcordBackup, "settings"), ct);

            if (Directory.Exists(paths.ThemesDir))
                FileOps.CopyDirectory(paths.ThemesDir, Path.Combine(endcordBackup, "themes"), ct);

            var meta = new Dictionary<string, string>
            {
                { "id", id },
                { "createdAt", DateTime.Now.ToString("o") },
                { "sourceMod", sourceModName ?? "Endcord" },
                { "reason", reason ?? "backup" },
                { "hadEndcordSettings", hadEndcord ? "1" : "0" }
            };
            Ini.Write(Path.Combine(dir, "manifest.ini"), meta);

            return new BackupSnapshot
            {
                Id = id,
                DirectoryPath = dir,
                CreatedAt = DateTime.Now,
                SourceModName = sourceModName ?? "Endcord",
                Reason = reason ?? "backup",
                HadEndcordSettings = hadEndcord
            };
        }

        public static List<BackupSnapshot> ListBackups(InstallerPaths paths)
        {
            var list = new List<BackupSnapshot>();
            if (!Directory.Exists(paths.BackupsDir)) return list;
            try
            {
                foreach (var dir in Directory.GetDirectories(paths.BackupsDir))
                {
                    string mf = Path.Combine(dir, "manifest.ini");
                    if (!File.Exists(mf)) continue;
                    var d = Ini.Read(mf);
                    DateTime dt;
                    if (!DateTime.TryParse(d.ContainsKey("createdAt") ? d["createdAt"] : "", out dt))
                        dt = Directory.GetCreationTime(dir);
                    list.Add(new BackupSnapshot
                    {
                        Id = d.ContainsKey("id") ? d["id"] : Path.GetFileName(dir),
                        DirectoryPath = dir,
                        CreatedAt = dt,
                        SourceModName = d.ContainsKey("sourceMod") ? d["sourceMod"] : "Endcord",
                        Reason = d.ContainsKey("reason") ? d["reason"] : "backup",
                        HadEndcordSettings = d.ContainsKey("hadEndcordSettings") && d["hadEndcordSettings"] == "1"
                    });
                }
                list.Sort((a, b) => b.CreatedAt.CompareTo(a.CreatedAt));
            }
            catch { }
            return list;
        }

        public static void RestoreBackup(InstallerPaths paths, BackupSnapshot snapshot, CancellationToken ct)
        {
            if (snapshot == null || !Directory.Exists(snapshot.DirectoryPath))
                throw new InstallerException(FailureKind.MigrationFailed, "Backup snapshot not found", snapshot != null ? snapshot.DirectoryPath : "");

            string endcordBackup = Path.Combine(snapshot.DirectoryPath, "endcord");
            string backedSettings = Path.Combine(endcordBackup, "settings");
            string backedThemes = Path.Combine(endcordBackup, "themes");

            if (Directory.Exists(paths.SettingsDir))
                FileOps.DeleteDirectory(paths.SettingsDir, ct);
            if (Directory.Exists(paths.ThemesDir))
                FileOps.DeleteDirectory(paths.ThemesDir, ct);

            Directory.CreateDirectory(paths.SettingsDir);
            Directory.CreateDirectory(paths.ThemesDir);

            if (Directory.Exists(backedSettings))
                FileOps.CopyDirectory(backedSettings, paths.SettingsDir, ct);
            if (Directory.Exists(backedThemes))
                FileOps.CopyDirectory(backedThemes, paths.ThemesDir, ct);
        }

        /// <summary>
        /// Executes the migration plan safely: backs up existing Endcord settings and source snapshot first,
        /// merges compatible settings/plugins/themes/QuickCSS, and automatically rolls back if any write fails.
        /// </summary>
        public static MigrationResult Execute(InstallerPaths paths, MigrationPlan plan, CancellationToken ct)
        {
            if (plan == null || plan.Source == null)
                throw new ArgumentNullException("plan");

            var result = new MigrationResult();
            BackupSnapshot backup = null;

            try
            {
                ct.ThrowIfCancellationRequested();
                backup = CreateBackup(paths, plan.Source.Mod.DisplayName, "pre-migration-" + plan.Source.Mod.Id, ct);
                result.Backup = backup;

                // Also store a read-only copy of the source client's settings inside the backup folder
                var src = plan.Source.Settings;
                if (src != null)
                {
                    string srcSnap = Path.Combine(backup.DirectoryPath, "source-" + plan.Source.Mod.Id);
                    Directory.CreateDirectory(srcSnap);
                    if (!string.IsNullOrEmpty(src.SettingsFile) && File.Exists(src.SettingsFile))
                        FileOps.Retry(() => File.Copy(src.SettingsFile, Path.Combine(srcSnap, "settings.json"), true), src.SettingsFile, ct);
                    if (!string.IsNullOrEmpty(src.QuickCssFile) && File.Exists(src.QuickCssFile))
                        FileOps.Retry(() => File.Copy(src.QuickCssFile, Path.Combine(srcSnap, "quickCss.css"), true), src.QuickCssFile, ct);
                }

                Directory.CreateDirectory(paths.SettingsDir);
                Directory.CreateDirectory(paths.ThemesDir);

                if (plan.Source.Mod.Format == SettingsFormat.VencordFamily && src != null)
                {
                    if ((plan.ImportCoreSettings || plan.ImportPlugins) && !string.IsNullOrEmpty(src.SettingsFile) && File.Exists(src.SettingsFile))
                    {
                        var srcRoot = Json.ParseObject(FileOps.ReadText(src.SettingsFile));
                        JsonObject dstRoot;
                        if (File.Exists(paths.SettingsFile))
                        {
                            try { dstRoot = Json.ParseObject(FileOps.ReadText(paths.SettingsFile)); }
                            catch { dstRoot = new JsonObject(); }
                        }
                        else
                        {
                            dstRoot = new JsonObject();
                        }

                        if (plan.ImportCoreSettings)
                        {
                            foreach (var kv in srcRoot)
                            {
                                if (kv.Key == "plugins") continue;
                                if (!SupportedRootKeys.Contains(kv.Key)) continue;

                                if (kv.Key == "cloud")
                                {
                                    var cloud = Json.DeepClone(kv.Value) as JsonObject;
                                    if (cloud != null)
                                    {
                                        // Never carry over another mod's cloud auth session
                                        cloud["authenticated"] = false;
                                        dstRoot["cloud"] = cloud;
                                        result.MigratedCoreSettings++;
                                    }
                                    continue;
                                }

                                dstRoot[kv.Key] = Json.DeepClone(kv.Value);
                                result.MigratedCoreSettings++;
                            }
                        }

                        if (plan.ImportPlugins)
                        {
                            var srcPlugins = srcRoot.GetObject("plugins");
                            var dstPlugins = dstRoot.GetObject("plugins");
                            if (dstPlugins == null)
                            {
                                dstPlugins = new JsonObject();
                                dstRoot["plugins"] = dstPlugins;
                            }

                            if (srcPlugins != null)
                            {
                                foreach (var pkv in srcPlugins)
                                {
                                    if (KnownPlugins.IsSupported(pkv.Key))
                                    {
                                        dstPlugins[pkv.Key] = Json.DeepClone(pkv.Value);
                                        var pObj = pkv.Value as JsonObject;
                                        bool enabled = pObj != null && pObj.GetBool("enabled", false);
                                        int optCount = pObj != null ? Math.Max(0, pObj.Count - 1) : 0;
                                        if (enabled || optCount > 0) result.MigratedPlugins++;
                                    }
                                    else
                                    {
                                        result.SkippedPlugins++;
                                    }
                                }
                            }
                        }

                        dstRoot["language"] = EndcordInstaller.Localization.Loc.CurrentLanguage;
                        string serialized = Json.Serialize(dstRoot) + "\n";
                        // Verify round-trip parse before committing
                        Json.ParseObject(serialized);
                        FileOps.Retry(() => FileOps.WriteAllTextAtomic(paths.SettingsFile, serialized), paths.SettingsFile, ct);
                    }

                    // Native settings (safe subset: customCspRules + compatible plugins)
                    if (plan.ImportCoreSettings && !string.IsNullOrEmpty(src.NativeSettingsFile) && File.Exists(src.NativeSettingsFile))
                    {
                        try
                        {
                            var nativeSrc = Json.ParseObject(FileOps.ReadText(src.NativeSettingsFile));
                            var nativeDst = new JsonObject();
                            var nPlugins = new JsonObject();
                            var srcNPlugins = nativeSrc.GetObject("plugins");
                            if (srcNPlugins != null)
                            {
                                foreach (var kv in srcNPlugins)
                                    if (KnownPlugins.IsSupported(kv.Key))
                                        nPlugins[kv.Key] = Json.DeepClone(kv.Value);
                            }
                            nativeDst["plugins"] = nPlugins;
                            nativeDst["customCspRules"] = nativeSrc.ContainsKey("customCspRules")
                                ? Json.DeepClone(nativeSrc["customCspRules"])
                                : new JsonObject();
                            FileOps.Retry(() => FileOps.WriteAllTextAtomic(paths.NativeSettingsFile, Json.Serialize(nativeDst) + "\n"), paths.NativeSettingsFile, ct);
                        }
                        catch { }
                    }

                    // QuickCSS
                    if (plan.ImportQuickCss && src.HasQuickCss && !string.IsNullOrEmpty(src.QuickCssFile) && File.Exists(src.QuickCssFile))
                    {
                        string css = FileOps.ReadText(src.QuickCssFile);
                        FileOps.Retry(() => FileOps.WriteAllTextAtomic(paths.QuickCssFile, css), paths.QuickCssFile, ct);
                        result.MigratedQuickCss = true;
                    }
                }

                // Themes (both Vencord family and BetterDiscord)
                if (plan.ImportThemes && src != null && !string.IsNullOrEmpty(src.ThemesDir) && Directory.Exists(src.ThemesDir))
                {
                    foreach (var f in Directory.GetFiles(src.ThemesDir, "*.css"))
                    {
                        ct.ThrowIfCancellationRequested();
                        string name = Path.GetFileName(f);
                        string target = Path.Combine(paths.ThemesDir, name);
                        string srcFile = f;
                        FileOps.Retry(() => File.Copy(srcFile, target, true), target, ct);
                        result.MigratedThemes++;
                    }
                }

                result.Success = true;
                return result;
            }
            catch (OperationCanceledException)
            {
                if (backup != null)
                {
                    try { RestoreBackup(paths, backup, CancellationToken.None); result.RolledBack = true; } catch { }
                }
                throw;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.ErrorMessage = ex.Message;
                if (backup != null)
                {
                    try { RestoreBackup(paths, backup, CancellationToken.None); result.RolledBack = true; } catch { }
                }
                throw new InstallerException(FailureKind.MigrationFailed, ex.Message, plan.Source.Mod.DisplayName, ex);
            }
        }

        /// <summary>
        /// Resets Endcord settings to a clean slate while preserving a full backup first.
        /// </summary>
        public static BackupSnapshot StartFresh(InstallerPaths paths, CancellationToken ct)
        {
            var backup = CreateBackup(paths, "Endcord", "start-fresh", ct);
            if (File.Exists(paths.SettingsFile))
                FileOps.DeleteFile(paths.SettingsFile, ct);
            if (File.Exists(paths.NativeSettingsFile))
                FileOps.DeleteFile(paths.NativeSettingsFile, ct);
            if (File.Exists(paths.QuickCssFile))
                FileOps.DeleteFile(paths.QuickCssFile, ct);
            return backup;
        }
    }
}
