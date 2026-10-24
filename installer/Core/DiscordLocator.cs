using System;
using System.Collections.Generic;
using System.IO;

namespace EndcordInstaller.Core
{
    /// <summary>State of a single Discord "app-x.y.z" folder.</summary>
    public sealed class AppDirInfo
    {
        public string Path { get; set; }
        public string ResourcesPath { get; set; }
        public string VersionText { get; set; }
        public Version Version { get; set; }

        /// <summary>Mod that replaced Discord's loader (app folder / app.asar stub). Null = vanilla.</summary>
        public KnownMod LoaderMod { get; set; }
        /// <summary>Mods injected into discord_desktop_core (BetterDiscord style, legacy Endcord).</summary>
        public List<KnownMod> CoreMods { get; set; }
        /// <summary>Discord's own app.asar can be found (either app.asar or the _app.asar backup).</summary>
        public bool HasOriginalAsar { get; set; }

        public AppDirInfo() { CoreMods = new List<KnownMod>(); }

        public string AppFolder { get { return System.IO.Path.Combine(ResourcesPath, "app"); } }
        public string AppAsar { get { return System.IO.Path.Combine(ResourcesPath, "app.asar"); } }
        public string BackupAsar { get { return System.IO.Path.Combine(ResourcesPath, "_app.asar"); } }

        /// <summary>The mod that actually runs in this version (loader first, then core injections).</summary>
        public KnownMod ActiveMod
        {
            get
            {
                if (LoaderMod != null) return LoaderMod;
                foreach (var m in CoreMods) if (!m.IsEndcord) return m;
                return CoreMods.Count > 0 ? CoreMods[0] : null;
            }
        }

        /// <summary>Mods other than Endcord that are present in any form.</summary>
        public List<KnownMod> ForeignMods
        {
            get
            {
                var list = new List<KnownMod>();
                if (LoaderMod != null && !LoaderMod.IsEndcord) list.Add(LoaderMod);
                foreach (var m in CoreMods) if (!m.IsEndcord && !list.Contains(m)) list.Add(m);
                return list;
            }
        }
    }

    public sealed class DiscordInstall
    {
        public string Id { get; set; }
        public string DisplayName { get; set; }
        public string RootPath { get; set; }
        public string ExeName { get; set; }
        public bool IsCustom { get; set; }
        public List<AppDirInfo> AppDirs { get; set; }

        public DiscordInstall() { AppDirs = new List<AppDirInfo>(); }

        public AppDirInfo Latest { get { return AppDirs.Count > 0 ? AppDirs[AppDirs.Count - 1] : null; } }
        public string ProcessName { get { return System.IO.Path.GetFileNameWithoutExtension(ExeName ?? "Discord.exe"); } }
        public string VersionText { get { return Latest != null ? Latest.VersionText : ""; } }
        public KnownMod ActiveMod { get { return Latest != null ? Latest.ActiveMod : null; } }
        public bool HasEndcord { get { var m = ActiveMod; return m != null && m.IsEndcord; } }
        public bool IsDamaged { get { return Latest == null || !Latest.HasOriginalAsar; } }
        public List<KnownMod> ForeignMods { get { return Latest != null ? Latest.ForeignMods : new List<KnownMod>(); } }
        public override string ToString() { return DisplayName; }
    }

    public static class DiscordLocator
    {
        /// <summary>Anything below this size is a loader stub, not Discord's real app.asar.</summary>
        public const long OriginalAsarMinSize = 100000;
        const int MaxProbeBytes = 512 * 1024;

        static readonly string[][] Flavors =
        {
            new[] { "stable", "Discord", "Discord.exe", "Discord" },
            new[] { "ptb", "Discord PTB", "DiscordPTB.exe", "DiscordPTB" },
            new[] { "canary", "Discord Canary", "DiscordCanary.exe", "DiscordCanary" },
            new[] { "development", "Discord Development", "DiscordDevelopment.exe", "DiscordDevelopment" },
        };

        public static List<DiscordInstall> FindAll(InstallerPaths paths)
        {
            var list = new List<DiscordInstall>();
            foreach (var f in Flavors)
            {
                string id = f[0];
                string displayName = f[1];
                string exeName = f[2];
                string folderName = f[3];

                var d = Open(id, displayName, System.IO.Path.Combine(paths.Local, folderName), exeName, false);
                if (d == null && !paths.IsSandboxed)
                {
                    string regRoot = TryFindFromRegistryOrProcess(folderName, exeName);
                    if (!string.IsNullOrEmpty(regRoot))
                        d = Open(id, displayName, regRoot, exeName, false);
                }
                if (d != null) list.Add(d);
            }
            return list;
        }

        static string TryFindFromRegistryOrProcess(string folderName, string exeName)
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + folderName))
                {
                    if (key != null)
                    {
                        string loc = key.GetValue("InstallLocation") as string;
                        if (!string.IsNullOrEmpty(loc) && Directory.Exists(loc))
                            return loc;
                    }
                }
            }
            catch { }

            try
            {
                string procName = System.IO.Path.GetFileNameWithoutExtension(exeName);
                var procs = System.Diagnostics.Process.GetProcessesByName(procName);
                foreach (var p in procs)
                {
                    try
                    {
                        string file = p.MainModule != null ? p.MainModule.FileName : null;
                        if (!string.IsNullOrEmpty(file))
                        {
                            var appDir = Directory.GetParent(file);
                            var rootDir = appDir != null ? appDir.Parent : null;
                            if (rootDir != null && Directory.Exists(rootDir.FullName))
                                return rootDir.FullName;
                        }
                    }
                    catch { }
                    finally { try { p.Dispose(); } catch { } }
                }
            }
            catch { }

            return null;
        }

        /// <summary>Re-reads the current on-disk state of an install (after patching etc.).</summary>
        public static DiscordInstall Refresh(DiscordInstall d)
        {
            return Open(d.Id, d.DisplayName, d.RootPath, d.ExeName, d.IsCustom);
        }

        /// <summary>Accepts a Discord root, an app-* folder or a resources folder.</summary>
        public static DiscordInstall OpenCustom(string path)
        {
            if (string.IsNullOrEmpty(path) || !Directory.Exists(path)) return null;
            string candidate = path.TrimEnd('\\', '/');
            for (int i = 0; i < 3 && !string.IsNullOrEmpty(candidate); i++)
            {
                string exe = GuessExe(candidate);
                if (exe != null)
                {
                    var d = Open("custom:" + candidate.ToLowerInvariant(), System.IO.Path.GetFileName(candidate), candidate, exe, true);
                    if (d != null) return d;
                }
                var parent = Directory.GetParent(candidate);
                candidate = parent != null ? parent.FullName : null;
            }
            return null;
        }

        static string GuessExe(string root)
        {
            try
            {
                var apps = Directory.GetDirectories(root, "app-*");
                if (apps.Length == 0) return null;
                foreach (var app in apps)
                    foreach (var exe in Directory.GetFiles(app, "Discord*.exe"))
                        return System.IO.Path.GetFileName(exe);
                return "Discord.exe";
            }
            catch
            {
                return null;
            }
        }

        public static DiscordInstall Open(string id, string name, string root, string exe, bool custom)
        {
            try
            {
                if (!Directory.Exists(root)) return null;
                var dirs = new List<AppDirInfo>();
                foreach (var dir in Directory.GetDirectories(root, "app-*"))
                {
                    var info = InspectAppDir(dir);
                    if (info != null) dirs.Add(info);
                }
                if (dirs.Count == 0) return null;
                dirs.Sort(CompareVersions);
                return new DiscordInstall { Id = id, DisplayName = name, RootPath = root, ExeName = exe, IsCustom = custom, AppDirs = dirs };
            }
            catch
            {
                return null;
            }
        }

        static int CompareVersions(AppDirInfo a, AppDirInfo b)
        {
            if (a.Version != null && b.Version != null) return a.Version.CompareTo(b.Version);
            return string.Compare(a.VersionText, b.VersionText, StringComparison.OrdinalIgnoreCase);
        }

        public static AppDirInfo InspectAppDir(string dir)
        {
            string res = System.IO.Path.Combine(dir, "resources");
            if (!Directory.Exists(res)) return null;

            string verText = System.IO.Path.GetFileName(dir);
            if (verText.StartsWith("app-", StringComparison.OrdinalIgnoreCase)) verText = verText.Substring(4);
            Version ver;
            Version.TryParse(verText, out ver);

            var info = new AppDirInfo { Path = dir, ResourcesPath = res, VersionText = verText, Version = ver };

            // Electron searches resources/app, then resources/app.asar — so the app folder wins.
            if (Directory.Exists(info.AppFolder))
            {
                info.LoaderMod = IdentifyLoaderFolder(info.AppFolder);
            }
            else if (Directory.Exists(info.AppAsar))
            {
                info.LoaderMod = IdentifyLoaderFolder(info.AppAsar);
            }
            else if (File.Exists(info.AppAsar) && FileOps.SizeOf(info.AppAsar) < OriginalAsarMinSize)
            {
                info.LoaderMod = ModCatalog.Match(FileOps.ReadSmall(info.AppAsar, MaxProbeBytes)) ?? ModCatalog.Unknown;
            }

            long backup = FileOps.SizeOf(info.BackupAsar);
            long main = File.Exists(info.AppAsar) ? FileOps.SizeOf(info.AppAsar) : -1;
            info.HasOriginalAsar = backup >= OriginalAsarMinSize || main >= OriginalAsarMinSize;

            foreach (var coreIndex in FindDesktopCoreIndices(dir))
            {
                string text = FileOps.ReadSmall(coreIndex, MaxProbeBytes);
                foreach (var line in SplitLines(text))
                {
                    if (IsCoreAsarLine(line)) continue;
                    var m = ModCatalog.Match(line);
                    if (m != null && !info.CoreMods.Contains(m)) info.CoreMods.Add(m);
                }
            }
            return info;
        }

        static KnownMod IdentifyLoaderFolder(string folder)
        {
            string text = FileOps.ReadSmall(System.IO.Path.Combine(folder, "index.js"), MaxProbeBytes) ?? "";
            text += FileOps.ReadSmall(System.IO.Path.Combine(folder, "package.json"), MaxProbeBytes) ?? "";
            return ModCatalog.Match(text) ?? ModCatalog.Unknown;
        }

        public static List<string> FindDesktopCoreIndices(string appDir)
        {
            var list = new List<string>();
            string modules = System.IO.Path.Combine(appDir, "modules");
            if (!Directory.Exists(modules)) return list;
            try
            {
                foreach (var dir in Directory.GetDirectories(modules, "discord_desktop_core*"))
                {
                    string inner = System.IO.Path.Combine(dir, "discord_desktop_core", "index.js");
                    if (File.Exists(inner)) list.Add(inner);
                    string flat = System.IO.Path.Combine(dir, "index.js");
                    if (File.Exists(flat)) list.Add(flat);
                }
            }
            catch { }
            return list;
        }

        internal static IEnumerable<string> SplitLines(string text)
        {
            if (string.IsNullOrEmpty(text)) yield break;
            foreach (var l in text.Split('\n')) yield return l.TrimEnd('\r');
        }

        internal static bool IsCoreAsarLine(string line)
        {
            return line.Contains("core.asar") && ModCatalog.Match(line) == null;
        }
    }
}
