using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32;

namespace EndcordInstaller.Core
{
    /// <summary>Something the setup couldn't do, with the message to show (a Loc key) and what went wrong underneath</summary>
    public sealed class DesktopSetupException : Exception
    {
        public string MessageKey { get; private set; }

        public DesktopSetupException(string messageKey, string detail) : base(detail)
        {
            MessageKey = messageKey;
        }
    }

    /// <summary>
    /// Installs, updates and removes Endcord Desktop (Endcord/EndcordDesktop) for the signed-in Windows user, without
    /// admin rights. Its runtime (Electron, with Endcord's name and icon) is one zip from a release of Endcord/EndcordDesktop, checked against
    /// the SHA-256 the signed desktop manifest carries. Its six own files come from that repository's dist/, each checked against
    /// the same manifest, so a new install starts on the current release even when the runtime is older.
    /// </summary>
    public sealed class DesktopEngine
    {
        /// <summary>The app's own files, which its updater keeps current. Kept in step with DESKTOP_FILES in scripts/uploadRelease.mjs</summary>
        public static readonly string[] AppFiles = { "endcordDesktopMain.js", "endcordDesktopPreload.js", "endcordDesktopRenderer.js", "endcordDesktopRenderer.css", "main.js", "preload.js" };
        public const string ExeName = "EndcordDesktop.exe";
        public const string SetupName = "EndcordDesktopSetup.exe";
        public const string ReleaseBase = "https://github.com/Endcord/EndcordDesktop/releases/download/";
        public const string FileBase = "https://raw.githubusercontent.com/Endcord/EndcordDesktop/main/dist/";
        const string Target = "win32-x64";
        const string TopFolder = "EndcordDesktop-" + Target;
        /// <summary>The runtime zip a folder was made from, so an update that keeps it only swaps the six files</summary>
        const string RuntimeMarker = "runtime.sha256";
        const string DefaultUninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\EndcordDesktop";
        static readonly Regex SignedVersion = new Regex(@"^(\d{1,4}\.\d{1,4}\.\d{1,4})\+electron(\d{1,4}\.\d{1,4}\.\d{1,4})$");

        readonly InstallerPaths _paths;

        /// <summary>Downloads a URL to a file, reporting bytes done and the total (0 when unknown). Replaced in the self-tests</summary>
        public Action<string, string, Action<long, long>, CancellationToken> Download = DownloadFile;
        /// <summary>The registry key the app is listed under in Settings > Apps, below HKEY_CURRENT_USER. Null lists it nowhere</summary>
        public string UninstallKey = DefaultUninstallKey;
        /// <summary>Never starts the installed app (the self-tests install a stand-in exe)</summary>
        public bool SkipLaunch;

        public DesktopEngine(InstallerPaths paths)
        {
            _paths = paths;
        }

        public string InstallDir { get { return Path.Combine(_paths.Local, "Programs", "Endcord Desktop"); } }
        /// <summary>Where the app keeps its sign-in, settings and themes (Electron's userData for "Endcord Desktop")</summary>
        public string DataDir { get { return Path.Combine(_paths.Roaming, "Endcord Desktop"); } }
        public string Exe { get { return Path.Combine(InstallDir, ExeName); } }
        string AppDir { get { return Path.Combine(InstallDir, "resources", "app"); } }
        public bool IsInstalled { get { return File.Exists(Exe); } }

        /// <summary>The runtime zip's address for a signed version such as "1.0.0+electron45.2.2"; null for any other version</summary>
        public static string RuntimeUrl(string signedVersion)
        {
            var m = SignedVersion.Match(signedVersion ?? "");
            if (!m.Success) return null;
            return ReleaseBase + "desktop-" + m.Groups[1].Value + "-electron" + m.Groups[2].Value + "/" + TopFolder + ".zip";
        }

        public static string AppVersionOf(string signedVersion)
        {
            var m = SignedVersion.Match(signedVersion ?? "");
            return m.Success ? m.Groups[1].Value : null;
        }

        /// <summary>Installs the current release, or brings an installed one up to it. Progress goes from 0 to 1</summary>
        public void Install(Action<double, string> report, CancellationToken ct)
        {
            report(0.02, "desktop.status.checking");
            string text;
            try
            {
                text = ReleaseManifest.FetchDesktop();
            }
            catch (Exception e)
            {
                throw new DesktopSetupException("desktop.err.offline", e.Message);
            }
            if (text == null) throw new DesktopSetupException("desktop.err.offline", "no manifest");
            var release = ReleaseManifest.Verify(text, AppFiles);
            if (release == null) throw new DesktopSetupException("desktop.err.unsigned", "the desktop manifest isn't signed by the release key");
            string runtimeUrl = RuntimeUrl(release.Version);
            if (runtimeUrl == null) throw new DesktopSetupException("desktop.err.unsigned", "unexpected version " + release.Version);

            string staging = InstallDir + ".new";
            string scratch = Path.Combine(Path.GetTempPath(), "EndcordDesktopSetup-" + release.InstallerSha256.Substring(0, 12));
            bool keepRuntime = IsInstalled && SameText(ReadMarker(), release.InstallerSha256);
            try
            {
                Directory.CreateDirectory(scratch);
                if (!keepRuntime)
                {
                    string zip = Path.Combine(scratch, TopFolder + ".zip");
                    if (!(File.Exists(zip) && SameText(FileOps.Sha256(zip), release.InstallerSha256)))
                    {
                        report(0.04, "desktop.status.downloading");
                        string part = zip + ".part";
                        Download(runtimeUrl, part, (done, total) => { if (total > 0) report(0.04 + 0.68 * done / total, "desktop.status.downloading"); }, ct);
                        if (!SameText(FileOps.Sha256(part), release.InstallerSha256))
                        {
                            File.Delete(part);
                            throw new DesktopSetupException("desktop.err.badDownload", "the runtime zip doesn't match the signed manifest");
                        }
                        if (File.Exists(zip)) File.Delete(zip);
                        File.Move(part, zip);
                    }
                    ct.ThrowIfCancellationRequested();
                    report(0.74, "desktop.status.unpacking");
                    if (Directory.Exists(staging)) FileOps.DeleteDirectory(staging, ct);
                    Extract(zip, staging, ct);
                }

                // The app's own six files, the current release's whatever the runtime came with
                report(0.88, "desktop.status.files");
                var files = new Dictionary<string, string>();
                foreach (var name in AppFiles)
                {
                    string file = Path.Combine(scratch, name);
                    Download(FileBase + name, file, (done, total) => { }, ct);
                    if (!SameText(FileOps.Sha256(file), release.Assets[name]))
                        throw new DesktopSetupException("desktop.err.badDownload", name + " doesn't match the signed manifest");
                    files[name] = file;
                }

                report(0.93, "desktop.status.closing");
                CloseRunning();
                ct.ThrowIfCancellationRequested();

                report(0.95, "desktop.status.installing");
                string appDir = keepRuntime ? AppDir : Path.Combine(staging, "resources", "app");
                if (!Directory.Exists(appDir)) throw new DesktopSetupException("desktop.err.badDownload", "the runtime has no resources\\app");
                foreach (var pair in files) FileOps.Retry(() => File.Copy(pair.Value, Path.Combine(appDir, pair.Key), true), pair.Key, ct);
                // The app's updater keeps an earlier version and a record of a pending swap here. Setup's files are the
                // current release, so neither applies to them
                foreach (var stale in new[] { "update-state.json", "update-rejected.json" }) FileOps.DeletePath(Path.Combine(appDir, stale), ct);
                FileOps.DeletePath(Path.Combine(appDir, "previous"), ct);

                if (!keepRuntime)
                {
                    File.WriteAllText(Path.Combine(staging, RuntimeMarker), release.InstallerSha256, FileOps.Utf8);
                    string old = InstallDir + ".old";
                    if (Directory.Exists(old)) FileOps.DeleteDirectory(old, ct);
                    if (Directory.Exists(InstallDir)) FileOps.Move(InstallDir, old, ct);
                    Directory.CreateDirectory(Path.GetDirectoryName(InstallDir));
                    FileOps.Move(staging, InstallDir, ct);
                    try { FileOps.DeleteDirectory(old, ct); } catch { }
                }

                CopySetupIntoInstall();
                Register(AppVersionOf(release.Version));
                report(0.98, "desktop.status.shortcuts");
                if (!SkipLaunch) RunApp("--setup-shortcuts", 20000);
                report(1, "desktop.status.done");
            }
            catch (DesktopSetupException)
            {
                throw;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception e)
            {
                throw new DesktopSetupException("desktop.err.failed", e.Message);
            }
            finally
            {
                try { if (Directory.Exists(staging)) FileOps.DeleteDirectory(staging, CancellationToken.None); } catch { }
                foreach (var name in AppFiles)
                {
                    try { File.Delete(Path.Combine(scratch, name)); } catch { }
                }
            }
        }

        /// <summary>Removes the app: what it set up in the system, its folder, its Settings > Apps entry, and its data when asked</summary>
        public void Uninstall(bool removeData, Action<double, string> report, CancellationToken ct)
        {
            report(0.1, "desktop.status.closing");
            CloseRunning();
            // The app takes back discord:// links, its startup entry and its shortcuts itself (desktop/src/main.ts)
            if (IsInstalled && !SkipLaunch) RunApp("--uninstall-cleanup", 20000);
            report(0.4, "desktop.status.removing");
            Unregister();
            if (Directory.Exists(InstallDir)) FileOps.DeleteDirectory(InstallDir, ct);
            if (removeData && Directory.Exists(DataDir)) FileOps.DeleteDirectory(DataDir, ct);
            try
            {
                foreach (var dir in Directory.GetDirectories(Path.GetTempPath(), "EndcordDesktopSetup-*")) FileOps.DeleteDirectory(dir, ct);
            }
            catch { }
            report(1, "desktop.status.removed");
        }

        /// <summary>Starts the installed app and leaves it running</summary>
        public void Open()
        {
            if (SkipLaunch || !IsInstalled) return;
            Process.Start(new ProcessStartInfo(Exe) { UseShellExecute = false, WorkingDirectory = InstallDir });
        }

        string ReadMarker()
        {
            try { return File.ReadAllText(Path.Combine(InstallDir, RuntimeMarker)).Trim(); }
            catch { return ""; }
        }

        static bool SameText(string a, string b)
        {
            return string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>The zip's one top folder into <paramref name="target"/>. An entry that would land outside it fails the whole install</summary>
        public static void Extract(string zipFile, string target, CancellationToken ct)
        {
            Directory.CreateDirectory(target);
            using (var stream = File.OpenRead(zipFile))
            using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                foreach (var entry in zip.Entries)
                {
                    ct.ThrowIfCancellationRequested();
                    string name = entry.FullName.Replace('/', '\\');
                    if (!name.StartsWith(TopFolder + "\\", StringComparison.OrdinalIgnoreCase))
                        throw new DesktopSetupException("desktop.err.badDownload", "unexpected entry " + entry.FullName);
                    string relative = name.Substring(TopFolder.Length + 1);
                    if (relative.Length == 0) continue;
                    string path = Path.GetFullPath(Path.Combine(target, relative));
                    if (!FileOps.IsStrictlyInside(path, target))
                        throw new DesktopSetupException("desktop.err.badDownload", "entry outside the folder: " + entry.FullName);
                    if (name.EndsWith("\\"))
                    {
                        Directory.CreateDirectory(path);
                        continue;
                    }
                    Directory.CreateDirectory(Path.GetDirectoryName(path));
                    using (var input = entry.Open())
                    using (var output = File.Create(path))
                        input.CopyTo(output);
                }
            }
        }

        /// <summary>Ends Endcord Desktop processes that run from this install, and only those</summary>
        public void CloseRunning()
        {
            foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(ExeName)))
            {
                try
                {
                    string path = process.MainModule.FileName;
                    if (!FileOps.IsStrictlyInside(path, InstallDir)) continue;
                    process.Kill();
                    process.WaitForExit(5000);
                }
                catch { }
                finally
                {
                    process.Dispose();
                }
            }
        }

        void RunApp(string argument, int waitMs)
        {
            try
            {
                using (var process = Process.Start(new ProcessStartInfo(Exe, argument) { UseShellExecute = false, WorkingDirectory = InstallDir, CreateNoWindow = true }))
                {
                    if (process != null) process.WaitForExit(waitMs);
                }
            }
            catch { }
        }

        /// <summary>A copy of this setup in the install folder: Settings > Apps runs it to remove the app</summary>
        void CopySetupIntoInstall()
        {
            string self = Assembly.GetExecutingAssembly().Location;
            string copy = Path.Combine(InstallDir, SetupName);
            if (string.IsNullOrEmpty(self) || SameText(Path.GetFullPath(self), Path.GetFullPath(copy))) return;
            try { File.Copy(self, copy, true); } catch { }
        }

        void Register(string version)
        {
            if (UninstallKey == null) return;
            using (var key = Registry.CurrentUser.CreateSubKey(UninstallKey))
            {
                if (key == null) return;
                string setup = Path.Combine(InstallDir, SetupName);
                key.SetValue("DisplayName", "Endcord Desktop");
                key.SetValue("DisplayVersion", version ?? "");
                key.SetValue("Publisher", "Endcord");
                key.SetValue("DisplayIcon", Exe + ",0");
                key.SetValue("InstallLocation", InstallDir);
                key.SetValue("UninstallString", "\"" + setup + "\" --uninstall-desktop");
                key.SetValue("URLInfoAbout", "https://endcord.com");
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                long kb = 0;
                try
                {
                    foreach (var file in Directory.GetFiles(InstallDir, "*", SearchOption.AllDirectories)) kb += new FileInfo(file).Length / 1024;
                }
                catch { }
                key.SetValue("EstimatedSize", (int)Math.Min(kb, int.MaxValue), RegistryValueKind.DWord);
            }
        }

        void Unregister()
        {
            if (UninstallKey == null) return;
            try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); } catch { }
        }

        static void DownloadFile(string url, string file, Action<long, long> progress, CancellationToken ct)
        {
            // Older Windows defaults to TLS 1.0, which GitHub turns away
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.UserAgent = "EndcordInstaller";
            request.Timeout = 30000;
            request.ReadWriteTimeout = 60000;
            // GitHub sends release downloads on to its file host
            request.AllowAutoRedirect = true;
            using (ct.Register(request.Abort))
            using (var response = (HttpWebResponse)request.GetResponse())
            {
                if (response.StatusCode != HttpStatusCode.OK) throw new WebException("HTTP " + (int)response.StatusCode);
                if (!response.ResponseUri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase)) throw new WebException("not https: " + response.ResponseUri.Host);
                long total = response.ContentLength;
                using (var input = response.GetResponseStream())
                using (var output = File.Create(file))
                {
                    var buffer = new byte[81920];
                    long done = 0;
                    int read;
                    while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        ct.ThrowIfCancellationRequested();
                        output.Write(buffer, 0, read);
                        done += read;
                        progress(done, total);
                    }
                }
            }
        }
    }
}
