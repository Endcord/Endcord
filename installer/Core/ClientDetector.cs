using System;
using System.Collections.Generic;
using System.IO;

namespace EndcordInstaller.Core
{
    /// <summary>Settings on disk that belong to another client.</summary>
    public sealed class SettingsSource
    {
        public KnownMod Mod { get; set; }
        public string DataDir { get; set; }
        public string SettingsFile { get; set; }
        public string NativeSettingsFile { get; set; }
        public string QuickCssFile { get; set; }
        public string ThemesDir { get; set; }
        public string PluginsDir { get; set; }
        public DateTime LastModified { get; set; }
        public int EnabledPluginCount { get; set; }
        public int ThemeCount { get; set; }
        public bool HasQuickCss { get; set; }
        public bool SettingsReadable { get; set; }

        public bool HasAnything
        {
            get { return File.Exists(SettingsFile ?? "") || ThemeCount > 0 || HasQuickCss; }
        }
    }

    public sealed class DetectedClient
    {
        public KnownMod Mod { get; set; }
        public List<DiscordInstall> InjectedInto { get; set; }
        public SettingsSource Settings { get; set; }

        public DetectedClient() { InjectedInto = new List<DiscordInstall>(); }

        public bool CanMigrate
        {
            get { return Settings != null && Mod.Format != SettingsFormat.None && Settings.HasAnything; }
        }

        public bool IsStandalone { get { return Mod.Kind == ModKind.Standalone; } }

        /// <summary>Program files a mod's own installer leaves in %APPDATA% (never settings).</summary>
        public string DistDir
        {
            get
            {
                if (Settings == null || string.IsNullOrEmpty(Settings.DataDir) || Mod.Kind != ModKind.Injector) return null;
                string d = Path.Combine(Settings.DataDir, "dist");
                return Directory.Exists(d) ? d : null;
            }
        }
    }

    public sealed class DetectionResult
    {
        public List<DiscordInstall> Installs { get; set; }
        public List<DetectedClient> Clients { get; set; }
        public bool EndcordHasSettings { get; set; }

        public DetectionResult()
        {
            Installs = new List<DiscordInstall>();
            Clients = new List<DetectedClient>();
        }

        public bool EndcordInstalled
        {
            get { foreach (var i in Installs) if (i.HasEndcord) return true; return false; }
        }

        public List<DetectedClient> MigrationSources
        {
            get
            {
                var list = new List<DetectedClient>();
                foreach (var c in Clients) if (c.CanMigrate) list.Add(c);
                // Clients that are actually active in Discord first, then most recently used.
                list.Sort((a, b) =>
                {
                    int ia = a.InjectedInto.Count > 0 ? 0 : 1, ib = b.InjectedInto.Count > 0 ? 0 : 1;
                    if (ia != ib) return ia.CompareTo(ib);
                    return b.Settings.LastModified.CompareTo(a.Settings.LastModified);
                });
                return list;
            }
        }

        public DetectedClient Find(string modId)
        {
            foreach (var c in Clients) if (c.Mod.Id == modId) return c;
            return null;
        }
    }

    public static class ClientDetector
    {
        public static DetectionResult Detect(InstallerPaths paths, IEnumerable<string> customRoots)
        {
            var result = new DetectionResult();
            result.Installs.AddRange(DiscordLocator.FindAll(paths));
            if (customRoots != null)
            {
                foreach (var root in customRoots)
                {
                    var d = DiscordLocator.OpenCustom(root);
                    if (d == null) continue;
                    bool dup = false;
                    foreach (var i in result.Installs)
                        if (string.Equals(i.RootPath, d.RootPath, StringComparison.OrdinalIgnoreCase)) dup = true;
                    if (!dup) result.Installs.Add(d);
                }
            }

            var byId = new Dictionary<string, DetectedClient>();
            foreach (var install in result.Installs)
            {
                foreach (var mod in install.ForeignMods)
                {
                    DetectedClient c;
                    if (!byId.TryGetValue(mod.Id, out c))
                    {
                        c = new DetectedClient { Mod = mod };
                        byId[mod.Id] = c;
                    }
                    c.InjectedInto.Add(install);
                }
            }

            foreach (var mod in ModCatalog.SettingsSources())
            {
                var src = ReadSource(paths, mod);
                if (src == null) continue;
                DetectedClient c;
                if (!byId.TryGetValue(mod.Id, out c))
                {
                    c = new DetectedClient { Mod = mod };
                    byId[mod.Id] = c;
                }
                c.Settings = src;
            }

            // Keep catalog order for stable UI.
            foreach (var mod in ModCatalog.All)
            {
                DetectedClient c;
                if (byId.TryGetValue(mod.Id, out c)) result.Clients.Add(c);
            }
            DetectedClient unknown;
            if (byId.TryGetValue(ModCatalog.Unknown.Id, out unknown)) result.Clients.Add(unknown);

            result.EndcordHasSettings = File.Exists(paths.SettingsFile);
            return result;
        }

        public static SettingsSource ReadSource(InstallerPaths paths, KnownMod mod)
        {
            foreach (var dirName in mod.DataDirNames)
            {
                string dataDir = Path.Combine(paths.Roaming, dirName);
                if (!Directory.Exists(dataDir)) continue;

                var s = new SettingsSource { Mod = mod, DataDir = dataDir };
                if (mod.Format == SettingsFormat.VencordFamily)
                {
                    string settingsDir = Path.Combine(dataDir, "settings");
                    s.SettingsFile = Path.Combine(settingsDir, "settings.json");
                    s.NativeSettingsFile = Path.Combine(settingsDir, "native-settings.json");
                    s.QuickCssFile = Path.Combine(settingsDir, "quickCss.css");
                    s.ThemesDir = Path.Combine(dataDir, "themes");
                    s.ThemeCount = CountFiles(s.ThemesDir, "*.css");
                    s.HasQuickCss = HasContent(s.QuickCssFile);
                    if (File.Exists(s.SettingsFile))
                    {
                        try
                        {
                            var json = Json.ParseObject(FileOps.ReadText(s.SettingsFile));
                            s.SettingsReadable = true;
                            var plugins = json.GetObject("plugins");
                            if (plugins != null)
                                foreach (var kv in plugins)
                                {
                                    var p = kv.Value as JsonObject;
                                    if (p != null && p.GetBool("enabled", false)) s.EnabledPluginCount++;
                                }
                        }
                        catch { s.SettingsReadable = false; }
                    }
                    s.LastModified = FileOps.LatestWrite(settingsDir, s.ThemesDir);
                }
                else if (mod.Format == SettingsFormat.BetterDiscord)
                {
                    s.ThemesDir = Path.Combine(dataDir, "themes");
                    s.PluginsDir = Path.Combine(dataDir, "plugins");
                    s.ThemeCount = CountFiles(s.ThemesDir, "*.theme.css");
                    s.EnabledPluginCount = 0;
                    s.LastModified = FileOps.LatestWrite(s.ThemesDir);
                }

                if (s.HasAnything) return s;
            }
            return null;
        }

        static int CountFiles(string dir, string pattern)
        {
            try { return Directory.Exists(dir) ? Directory.GetFiles(dir, pattern).Length : 0; }
            catch { return 0; }
        }

        static bool HasContent(string file)
        {
            try { return File.Exists(file) && FileOps.ReadText(file).Trim().Length > 0; }
            catch { return false; }
        }
    }

    /// <summary>Installer preferences persisted in %APPDATA%\Endcord\installer\prefs.ini.</summary>
    public sealed class Prefs
    {
        readonly string _file;
        readonly Dictionary<string, string> _values;

        public Prefs(InstallerPaths paths)
        {
            _file = paths.PrefsFile;
            _values = Ini.Read(_file);
        }

        public string Language
        {
            get { string v; return _values.TryGetValue("language", out v) ? v : null; }
            set { _values["language"] = value; }
        }

        public bool Relaunch
        {
            get { string v; return !_values.TryGetValue("relaunch", out v) || v != "0"; }
            set { _values["relaunch"] = value ? "1" : "0"; }
        }

        public List<string> CustomPaths
        {
            get
            {
                string v;
                var list = new List<string>();
                if (_values.TryGetValue("customPaths", out v))
                    foreach (var p in v.Split('|')) if (p.Trim().Length > 0) list.Add(p.Trim());
                return list;
            }
            set { _values["customPaths"] = string.Join("|", value.ToArray()); }
        }

        public bool WasMigrated(string modId)
        {
            return _values.ContainsKey("migrated." + modId);
        }

        public void MarkMigrated(string modId)
        {
            _values["migrated." + modId] = DateTime.Now.ToString("o");
        }

        public bool Save()
        {
            try
            {
                Ini.Write(_file, _values);
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
