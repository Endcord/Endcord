using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;

namespace EndcordInstaller.Core
{
    public enum InstallOperationKind
    {
        InstallOrUpdate,
        Repair,
        Uninstall,
        CloseDiscord
    }

    public enum InstallStage
    {
        Preparing,
        ClosingDiscord,
        BackingUp,
        ExtractingPayload,
        CleaningConflicts,
        PatchingClient,
        RestoringClient,
        Verifying,
        Relaunching,
        RollingBack,
        Completed
    }

    public sealed class InstallProgressEvent
    {
        public InstallStage Stage { get; set; }
        public int CompletedSteps { get; set; }
        public int TotalSteps { get; set; }
        public string StatusKey { get; set; }
        public object[] StatusArgs { get; set; }
        public string LogMessage { get; set; }
        public bool IsWarning { get; set; }
        public bool IsError { get; set; }
        public bool IsSuccess { get; set; }

        public int Percentage
        {
            get
            {
                if (TotalSteps <= 0) return 0;
                int pct = (int)Math.Round(100.0 * CompletedSteps / TotalSteps);
                return Math.Max(0, Math.Min(100, pct));
            }
        }
    }

    public sealed class ConflictItem
    {
        public DiscordInstall Install { get; set; }
        public List<KnownMod> ForeignMods { get; set; }
    }

    public sealed class OperationOutcome
    {
        public InstallOperationKind Operation { get; set; }
        public bool Success { get; set; }
        public bool Cancelled { get; set; }
        public bool RolledBack { get; set; }
        public FailureKind FailureKind { get; set; }
        public string FailureSubject { get; set; }
        public string ErrorDetail { get; set; }
        public List<DiscordInstall> AffectedInstalls { get; private set; }
        public List<KnownMod> ReplacedMods { get; private set; }
        public bool WasUpdate { get; set; }

        public OperationOutcome()
        {
            AffectedInstalls = new List<DiscordInstall>();
            ReplacedMods = new List<KnownMod>();
        }
    }

    public static class InstallationEngine
    {
        public static readonly string[] PayloadFiles = { "patcher.js", "preload.js", "renderer.js", "renderer.css" };

        /// <summary>Optional override folder for payload assets (used by tests or dev mode).</summary>
        public static string CustomPayloadDirectory { get; set; }

        /// <summary>Checks which targets have another client mod injected that would conflict with Endcord.</summary>
        public static List<ConflictItem> FindConflicts(IEnumerable<DiscordInstall> targets)
        {
            var list = new List<ConflictItem>();
            if (targets == null) return list;
            foreach (var t in targets)
            {
                var mods = t.ForeignMods;
                if (mods != null && mods.Count > 0)
                    list.Add(new ConflictItem { Install = t, ForeignMods = mods });
            }
            return list;
        }

        public static bool IsProcessRunning(DiscordInstall install)
        {
            if (install == null) return false;
            try
            {
                return Process.GetProcessesByName(install.ProcessName).Length > 0;
            }
            catch
            {
                return false;
            }
        }

        public static void CloseDiscordProcess(string processName, CancellationToken ct)
        {
            try
            {
                string target = processName ?? "Discord";
                if (target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                    target = target.Substring(0, target.Length - 4);

                Process[] procs = Process.GetProcessesByName(target);
                foreach (var p in procs)
                {
                    ct.ThrowIfCancellationRequested();
                    try
                    {
                        if (!p.HasExited)
                        {
                            p.CloseMainWindow();
                            if (!p.WaitForExit(4500) && !p.HasExited)
                                p.Kill();
                            p.WaitForExit(2000);
                        }
                    }
                    catch { }
                    finally
                    {
                        try { p.Dispose(); } catch { }
                    }
                }
            }
            catch (OperationCanceledException) { throw; }
            catch { }
        }

        public static void LaunchDiscord(DiscordInstall install)
        {
            if (install == null) return;
            try
            {
                string updateExe = Path.Combine(install.RootPath, "Update.exe");
                if (File.Exists(updateExe) && !string.IsNullOrEmpty(install.ExeName))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = updateExe,
                        Arguments = "--processStart " + install.ExeName,
                        WorkingDirectory = install.RootPath,
                        UseShellExecute = true
                    });
                    return;
                }

                if (install.Latest != null)
                {
                    string exe = Path.Combine(install.Latest.Path, install.ExeName ?? "Discord.exe");
                    if (File.Exists(exe))
                    {
                        Process.Start(new ProcessStartInfo { FileName = exe, WorkingDirectory = install.Latest.Path, UseShellExecute = true });
                        return;
                    }
                }

                string rootExe = Path.Combine(install.RootPath, install.ExeName ?? "Discord.exe");
                if (File.Exists(rootExe))
                    Process.Start(new ProcessStartInfo { FileName = rootExe, WorkingDirectory = install.RootPath, UseShellExecute = true });
            }
            catch { }
        }

        public static OperationOutcome RunInstall(
            InstallerPaths paths,
            IList<DiscordInstall> targets,
            bool isRepair,
            bool relaunchAfter,
            Action<InstallProgressEvent> onProgress,
            CancellationToken ct)
        {
            var outcome = new OperationOutcome
            {
                Operation = isRepair ? InstallOperationKind.Repair : InstallOperationKind.InstallOrUpdate
            };

            if (targets == null || targets.Count == 0)
            {
                outcome.FailureKind = FailureKind.NoTargets;
                return outcome;
            }

            bool allHadEndcord = true;
            foreach (var t in targets)
            {
                if (!t.HasEndcord) allHadEndcord = false;
                foreach (var fm in t.ForeignMods)
                    if (!outcome.ReplacedMods.Contains(fm)) outcome.ReplacedMods.Add(fm);
            }
            outcome.WasUpdate = allHadEndcord && !isRepair;

            // Count exact real work steps:
            // 1 (stage & verify 4 payload files) + 4payloads + per-target (close + patch each appDir + verify)
            int appDirCount = 0;
            foreach (var t in targets) appDirCount += Math.Max(1, t.AppDirs.Count);
            int totalSteps = 1 + PayloadFiles.Length + targets.Count + appDirCount + targets.Count + (relaunchAfter ? targets.Count : 0);
            int step = 0;

            string distBackup = Path.Combine(paths.InstallerDir, "dist-prev");
            var patchedDirs = new List<AppDirRollback>();

            try
            {
                ct.ThrowIfCancellationRequested();

                Report(onProgress, InstallStage.Preparing, step, totalSteps,
                    isRepair ? "status.preparingRepair" : (outcome.WasUpdate ? "status.preparingUpdate" : "status.preparingInstall"),
                    null, null, false, false, false);

                // Step 1: Close running target Discord processes
                foreach (var t in targets)
                {
                    ct.ThrowIfCancellationRequested();
                    if (IsProcessRunning(t))
                    {
                        Report(onProgress, InstallStage.ClosingDiscord, step, totalSteps,
                            "status.closingClient", new object[] { t.DisplayName },
                            "Closing running process: " + t.ExeName, false, false, false);
                        CloseDiscordProcess(t.ExeName, ct);
                    }
                    step++;
                }

                // Step 2: Stage payload files and verify integrity before touching Dist
                if (Directory.Exists(paths.StagingDir))
                    FileOps.DeleteDirectory(paths.StagingDir, ct);
                Directory.CreateDirectory(paths.StagingDir);

                for (int i = 0; i < PayloadFiles.Length; i++)
                {
                    ct.ThrowIfCancellationRequested();
                    string file = PayloadFiles[i];
                    string stagedFile = Path.Combine(paths.StagingDir, file);
                    Report(onProgress, InstallStage.ExtractingPayload, step, totalSteps,
                        "status.extractingAsset", new object[] { file },
                        "Extracting " + file + " -> staging", false, false, false);

                    ExtractPayloadAsset(file, stagedFile, ct);
                    if (FileOps.SizeOf(stagedFile) <= 0)
                        throw new InstallerException(FailureKind.PayloadMissing, "Extracted payload is empty: " + file, file);

                    if (string.Equals(file, "renderer.js", StringComparison.OrdinalIgnoreCase))
                    {
                        try { KnownPlugins.RegisterFromRendererJs(FileOps.ReadText(stagedFile)); } catch { }
                    }
                    step++;
                }

                // Swap staged payload into %APPDATA%\Endcord\dist with rollback backup
                if (Directory.Exists(distBackup))
                    FileOps.DeleteDirectory(distBackup, ct);
                if (Directory.Exists(paths.Dist))
                    FileOps.CopyDirectory(paths.Dist, distBackup, ct);

                Directory.CreateDirectory(paths.Dist);
                foreach (var file in PayloadFiles)
                {
                    string src = Path.Combine(paths.StagingDir, file);
                    string dst = Path.Combine(paths.Dist, file);
                    FileOps.Retry(() => File.Copy(src, dst, true), dst, ct);
                }
                FileOps.DeleteDirectory(paths.StagingDir, ct);
                SyncClientLanguageSetting(paths, EndcordInstaller.Localization.Loc.CurrentLanguage);
                step++;

                // Step 3: Patch each target Discord installation
                foreach (var t in targets)
                {
                    ct.ThrowIfCancellationRequested();
                    if (t.AppDirs.Count == 0)
                        throw new InstallerException(FailureKind.DiscordDamaged, "No app-* version directories found in " + t.RootPath, t.DisplayName);

                    foreach (var appDir in t.AppDirs)
                    {
                        ct.ThrowIfCancellationRequested();

                        if (appDir.ForeignMods.Count > 0)
                        {
                            Report(onProgress, InstallStage.CleaningConflicts, step, totalSteps,
                                "status.cleaningForeignMod", new object[] { appDir.ForeignMods[0].DisplayName, t.DisplayName },
                                "Unhooking " + appDir.ForeignMods[0].DisplayName + " from " + t.DisplayName + " (" + appDir.VersionText + ")",
                                false, false, false);
                        }
                        else
                        {
                            Report(onProgress, InstallStage.PatchingClient, step, totalSteps,
                                "status.patchingClient", new object[] { t.DisplayName, appDir.VersionText },
                                "Patching " + t.DisplayName + " (" + appDir.VersionText + ")",
                                false, false, false);
                        }

                        var rb = PatchSingleAppDir(paths, t, appDir, ct);
                        patchedDirs.Add(rb);
                        step++;
                    }

                    // Step 4: Verify installation on disk
                    ct.ThrowIfCancellationRequested();
                    Report(onProgress, InstallStage.Verifying, step, totalSteps,
                        "status.verifyingClient", new object[] { t.DisplayName },
                        "Verifying Endcord loader in " + t.DisplayName, false, false, false);

                    var refreshed = DiscordLocator.Refresh(t);
                    if (refreshed == null || !refreshed.HasEndcord)
                        throw new InstallerException(FailureKind.VerificationFailed, "Verification failed for " + t.DisplayName, t.DisplayName);

                    outcome.AffectedInstalls.Add(refreshed);
                    step++;
                }

                // Cleanup temporary rollback snapshots after full verification
                foreach (var rb in patchedDirs) rb.Commit(ct);
                if (Directory.Exists(distBackup))
                    FileOps.DeleteDirectory(distBackup, CancellationToken.None);

                // Step 5: Relaunch if requested
                if (relaunchAfter)
                {
                    foreach (var t in outcome.AffectedInstalls)
                    {
                        ct.ThrowIfCancellationRequested();
                        Report(onProgress, InstallStage.Relaunching, step, totalSteps,
                            "status.relaunchingClient", new object[] { t.DisplayName },
                            "Launching " + t.DisplayName, false, false, false);
                        LaunchDiscord(t);
                        step++;
                    }
                }

                Report(onProgress, InstallStage.Completed, totalSteps, totalSteps,
                    isRepair ? "status.repairComplete" : (outcome.WasUpdate ? "status.updateComplete" : "status.installComplete"),
                    null, "Operation completed successfully.", false, false, true);

                outcome.Success = true;
                return outcome;
            }
            catch (OperationCanceledException)
            {
                outcome.Cancelled = true;
                outcome.FailureKind = FailureKind.Cancelled;
                Report(onProgress, InstallStage.RollingBack, step, totalSteps,
                    "status.rollingBack", null, "Cancelled by user. Rolling back changes...", true, false, false);
                RollbackInstall(paths, distBackup, patchedDirs, outcome);
                return outcome;
            }
            catch (InstallerException iex)
            {
                outcome.FailureKind = iex.Kind;
                outcome.FailureSubject = iex.Subject;
                outcome.ErrorDetail = iex.Message;
                Report(onProgress, InstallStage.RollingBack, step, totalSteps,
                    "status.rollingBack", null, "Error: " + iex.Message + ". Rolling back...", false, true, false);
                RollbackInstall(paths, distBackup, patchedDirs, outcome);
                return outcome;
            }
            catch (Exception ex)
            {
                outcome.FailureKind = FailureKind.Unknown;
                outcome.ErrorDetail = ex.Message;
                Report(onProgress, InstallStage.RollingBack, step, totalSteps,
                    "status.rollingBack", null, "Unexpected error: " + ex.Message + ". Rolling back...", false, true, false);
                RollbackInstall(paths, distBackup, patchedDirs, outcome);
                return outcome;
            }
        }

        static void RollbackInstall(InstallerPaths paths, string distBackup, List<AppDirRollback> patchedDirs, OperationOutcome outcome)
        {
            try
            {
                for (int i = patchedDirs.Count - 1; i >= 0; i--)
                    patchedDirs[i].Rollback();

                if (Directory.Exists(distBackup))
                {
                    if (Directory.Exists(paths.Dist))
                        FileOps.DeleteDirectory(distBackup == paths.Dist ? "" : paths.Dist, CancellationToken.None);
                    FileOps.CopyDirectory(distBackup, paths.Dist, CancellationToken.None);
                    FileOps.DeleteDirectory(distBackup, CancellationToken.None);
                }
                if (Directory.Exists(paths.StagingDir))
                    FileOps.DeleteDirectory(paths.StagingDir, CancellationToken.None);
                outcome.RolledBack = true;
            }
            catch { }
        }

        public static OperationOutcome RunUninstall(
            InstallerPaths paths,
            IList<DiscordInstall> targets,
            bool relaunchAfter,
            Action<InstallProgressEvent> onProgress,
            CancellationToken ct)
        {
            var outcome = new OperationOutcome { Operation = InstallOperationKind.Uninstall };
            if (targets == null || targets.Count == 0)
            {
                outcome.FailureKind = FailureKind.NoTargets;
                return outcome;
            }

            int appDirCount = 0;
            foreach (var t in targets) appDirCount += Math.Max(1, t.AppDirs.Count);
            int totalSteps = targets.Count + appDirCount + targets.Count + (relaunchAfter ? targets.Count : 0);
            int step = 0;

            try
            {
                foreach (var t in targets)
                {
                    ct.ThrowIfCancellationRequested();
                    if (IsProcessRunning(t))
                    {
                        Report(onProgress, InstallStage.ClosingDiscord, step, totalSteps,
                            "status.closingClient", new object[] { t.DisplayName },
                            "Closing running process: " + t.ExeName, false, false, false);
                        CloseDiscordProcess(t.ExeName, ct);
                    }
                    step++;
                }

                foreach (var t in targets)
                {
                    ct.ThrowIfCancellationRequested();
                    foreach (var appDir in t.AppDirs)
                    {
                        ct.ThrowIfCancellationRequested();
                        Report(onProgress, InstallStage.RestoringClient, step, totalSteps,
                            "status.restoringClient", new object[] { t.DisplayName, appDir.VersionText },
                            "Restoring vanilla Discord in " + t.DisplayName + " (" + appDir.VersionText + ")",
                            false, false, false);

                        RestoreVanillaAppDir(appDir, ct);
                        step++;
                    }

                    var refreshed = DiscordLocator.Refresh(t);
                    if (refreshed != null) outcome.AffectedInstalls.Add(refreshed);
                    step++;
                }

                // Only remove %APPDATA%\Endcord\dist if no remaining Discord installations on the machine use Endcord
                var allAfter = DiscordLocator.FindAll(paths);
                bool anyStillInstalled = false;
                foreach (var d in allAfter) if (d.HasEndcord) anyStillInstalled = true;
                if (!anyStillInstalled && Directory.Exists(paths.Dist))
                    FileOps.DeleteDirectory(paths.Dist, ct);

                if (relaunchAfter)
                {
                    foreach (var t in outcome.AffectedInstalls)
                    {
                        ct.ThrowIfCancellationRequested();
                        Report(onProgress, InstallStage.Relaunching, step, totalSteps,
                            "status.relaunchingClient", new object[] { t.DisplayName },
                            "Launching " + t.DisplayName, false, false, false);
                        LaunchDiscord(t);
                        step++;
                    }
                }

                Report(onProgress, InstallStage.Completed, totalSteps, totalSteps,
                    "status.uninstallComplete", null, "Endcord uninstalled cleanly. User settings preserved.", false, false, true);

                outcome.Success = true;
                return outcome;
            }
            catch (OperationCanceledException)
            {
                outcome.Cancelled = true;
                outcome.FailureKind = FailureKind.Cancelled;
                return outcome;
            }
            catch (InstallerException iex)
            {
                outcome.FailureKind = iex.Kind;
                outcome.FailureSubject = iex.Subject;
                outcome.ErrorDetail = iex.Message;
                return outcome;
            }
            catch (Exception ex)
            {
                outcome.FailureKind = FailureKind.Unknown;
                outcome.ErrorDetail = ex.Message;
                return outcome;
            }
        }

        /// <summary>
        /// Safely unhooks a previous client mod after explicit user confirmation.
        /// Never deletes user settings/themes or standalone applications.
        /// </summary>
        public static void CleanupPreviousClient(
            InstallerPaths paths,
            DetectedClient client,
            IEnumerable<DiscordInstall> installs,
            bool removeInjectorBinaries,
            CancellationToken ct)
        {
            if (client == null || client.Mod == null || client.Mod.IsEndcord || client.IsStandalone)
                return;

            // 1. Clean remaining discord_desktop_core hooks for this mod, but only on installs that now run
            //    Endcord. Other Discord flavours keep whatever the user put on them.
            if (installs != null)
            {
                foreach (var inst in installs)
                {
                    if (!inst.HasEndcord) continue;
                    foreach (var appDir in inst.AppDirs)
                    {
                        foreach (var coreIndex in DiscordLocator.FindDesktopCoreIndices(appDir.Path))
                        {
                            string text = FileOps.ReadSmall(coreIndex, 512 * 1024);
                            if (text != null && ModCatalog.Match(text) == client.Mod)
                                CleanDesktopCoreFile(coreIndex, ct);
                        }
                    }
                }
            }

            // 2. Optionally remove only the previous injector's dist binaries (never settings or themes!).
            //    Skip it while any Discord install still loads them, or that install would fail to start.
            if (removeInjectorBinaries && client.DistDir != null && !IsStillLoaded(client, installs))
            {
                if (FileOps.IsStrictlyInside(client.DistDir, paths.Roaming))
                    FileOps.DeleteDirectory(client.DistDir, ct);
            }
        }

        /// <summary>True if some Discord install's loader (app.asar stub, app folder or desktop core) still points at this mod.</summary>
        public static bool IsStillLoaded(DetectedClient client, IEnumerable<DiscordInstall> installs)
        {
            if (installs == null) return false;
            string distLower = client.DistDir != null ? client.DistDir.Replace('/', '\\').TrimEnd('\\').ToLowerInvariant() : null;
            foreach (var inst in installs)
            {
                foreach (var appDir in inst.AppDirs)
                {
                    if (appDir.LoaderMod == client.Mod || appDir.CoreMods.Contains(client.Mod))
                        return true;
                    if (distLower == null) continue;
                    foreach (var loader in new[] { appDir.AppAsar, System.IO.Path.Combine(appDir.AppFolder, "index.js") })
                    {
                        string text = FileOps.ReadSmall(loader, 64 * 1024);
                        if (text != null && text.Replace("\\\\", "\\").Replace('/', '\\').ToLowerInvariant().Contains(distLower))
                            return true;
                    }
                }
            }
            return false;
        }

        sealed class AppDirRollback
        {
            public AppDirInfo AppDir;
            public string SavedAppFolder;
            public string SavedStubAsar;
            public Dictionary<string, string> SavedCoreFiles = new Dictionary<string, string>();

            public void Rollback()
            {
                try
                {
                    if (Directory.Exists(AppDir.AppFolder))
                        FileOps.DeleteDirectory(AppDir.AppFolder, CancellationToken.None);

                    if (!string.IsNullOrEmpty(SavedAppFolder) && Directory.Exists(SavedAppFolder))
                    {
                        FileOps.Move(SavedAppFolder, AppDir.AppFolder, CancellationToken.None);
                    }
                    else if (string.IsNullOrEmpty(SavedStubAsar) && File.Exists(AppDir.BackupAsar) && !File.Exists(AppDir.AppAsar))
                    {
                        FileOps.Move(AppDir.BackupAsar, AppDir.AppAsar, CancellationToken.None);
                    }

                    if (!string.IsNullOrEmpty(SavedStubAsar) && FileOps.Exists(SavedStubAsar))
                    {
                        if (FileOps.Exists(AppDir.AppAsar))
                            FileOps.DeletePath(AppDir.AppAsar, CancellationToken.None);
                        FileOps.Move(SavedStubAsar, AppDir.AppAsar, CancellationToken.None);
                    }

                    foreach (var kv in SavedCoreFiles)
                    {
                        try { FileOps.WriteAllTextAtomic(kv.Key, kv.Value); } catch { }
                    }
                }
                catch { }
            }

            public void Commit(CancellationToken ct)
            {
                try
                {
                    if (!string.IsNullOrEmpty(SavedAppFolder) && Directory.Exists(SavedAppFolder))
                        FileOps.DeleteDirectory(SavedAppFolder, ct);
                    if (!string.IsNullOrEmpty(SavedStubAsar) && FileOps.Exists(SavedStubAsar))
                        FileOps.DeletePath(SavedStubAsar, ct);
                }
                catch { }
            }
        }

        static AppDirRollback PatchSingleAppDir(InstallerPaths paths, DiscordInstall install, AppDirInfo appDir, CancellationToken ct)
        {
            if (!appDir.HasOriginalAsar)
                throw new InstallerException(FailureKind.DiscordDamaged,
                    "Original Discord app.asar is missing in " + appDir.ResourcesPath, install.DisplayName);

            var rb = new AppDirRollback { AppDir = appDir };

            // 1. Clean any discord_desktop_core injections (e.g. BetterDiscord or legacy mods)
            foreach (var coreIndex in DiscordLocator.FindDesktopCoreIndices(appDir.Path))
            {
                if (File.Exists(coreIndex))
                    rb.SavedCoreFiles[coreIndex] = FileOps.ReadText(coreIndex);
                CleanDesktopCoreFile(coreIndex, ct);
            }

            // 2. Preserve existing resources/app for rollback if present
            if (Directory.Exists(appDir.AppFolder))
            {
                string prevApp = Path.Combine(appDir.ResourcesPath, "app.endcord-prev");
                if (Directory.Exists(prevApp)) FileOps.DeleteDirectory(prevApp, ct);
                FileOps.Move(appDir.AppFolder, prevApp, ct);
                rb.SavedAppFolder = prevApp;
            }

            // 3. Handle app.asar (could be vanilla archive, foreign stub file, or foreign stub folder)
            if (Directory.Exists(appDir.AppAsar))
            {
                string prevStub = Path.Combine(appDir.ResourcesPath, "app.asar.endcord-prev");
                if (FileOps.Exists(prevStub)) FileOps.DeletePath(prevStub, ct);
                FileOps.Move(appDir.AppAsar, prevStub, ct);
                rb.SavedStubAsar = prevStub;
            }
            else if (File.Exists(appDir.AppAsar))
            {
                long sz = FileOps.SizeOf(appDir.AppAsar);
                if (sz >= DiscordLocator.OriginalAsarMinSize)
                {
                    // Genuine vanilla app.asar -> move to _app.asar
                    if (File.Exists(appDir.BackupAsar) && FileOps.SizeOf(appDir.BackupAsar) >= DiscordLocator.OriginalAsarMinSize)
                    {
                        FileOps.DeleteFile(appDir.AppAsar, ct);
                    }
                    else
                    {
                        if (FileOps.Exists(appDir.BackupAsar)) FileOps.DeletePath(appDir.BackupAsar, ct);
                        FileOps.Move(appDir.AppAsar, appDir.BackupAsar, ct);
                    }
                }
                else
                {
                    // Foreign stub file (e.g. Vencord/Equicord Stub app.asar)
                    string prevStub = Path.Combine(appDir.ResourcesPath, "app.asar.endcord-prev");
                    if (FileOps.Exists(prevStub)) FileOps.DeletePath(prevStub, ct);
                    FileOps.Move(appDir.AppAsar, prevStub, ct);
                    rb.SavedStubAsar = prevStub;
                }
            }

            // 4. Write Endcord loader into resources/app
            FileOps.Retry(() => Directory.CreateDirectory(appDir.AppFolder), appDir.AppFolder, ct);

            string pkgJson = "{\n  \"name\": \"discord\",\n  \"main\": \"index.js\"\n}\n";
            string pkgPath = Path.Combine(appDir.AppFolder, "package.json");
            FileOps.Retry(() => FileOps.WriteAllTextAtomic(pkgPath, pkgJson), pkgPath, ct);

            string loaderJs =
                "// Endcord Loader\n" +
                "const { join } = require('path');\n" +
                "const appData = process.env.ENDCORD_INSTALLER_ROAMING || process.env.APPDATA || (process.platform === 'darwin' ? join(process.env.HOME, 'Library/Application Support') : join(process.env.HOME, '.config'));\n" +
                "const patcherPath = join(appData, 'Endcord', 'dist', 'patcher.js');\n" +
                "try {\n" +
                "    require(patcherPath);\n" +
                "} catch (e) {\n" +
                "    console.error('[Endcord] Failed to load patcher.js, falling back to vanilla _app.asar:', e);\n" +
                "    require(join(__dirname, '..', '_app.asar'));\n" +
                "}\n";
            string indexPath = Path.Combine(appDir.AppFolder, "index.js");
            FileOps.Retry(() => FileOps.WriteAllTextAtomic(indexPath, loaderJs), indexPath, ct);

            return rb;
        }

        static void RestoreVanillaAppDir(AppDirInfo appDir, CancellationToken ct)
        {
            foreach (var coreIndex in DiscordLocator.FindDesktopCoreIndices(appDir.Path))
                CleanDesktopCoreFile(coreIndex, ct);

            if (Directory.Exists(appDir.AppFolder))
                FileOps.DeleteDirectory(appDir.AppFolder, ct);

            if (Directory.Exists(appDir.AppAsar))
                FileOps.DeleteDirectory(appDir.AppAsar, ct);

            if (File.Exists(appDir.BackupAsar) && FileOps.SizeOf(appDir.BackupAsar) >= DiscordLocator.OriginalAsarMinSize)
            {
                if (File.Exists(appDir.AppAsar))
                    FileOps.DeleteFile(appDir.AppAsar, ct);
                FileOps.Move(appDir.BackupAsar, appDir.AppAsar, ct);
            }
        }

        static void CleanDesktopCoreFile(string indexJs, CancellationToken ct)
        {
            string bakPath = indexJs + ".bak";
            if (File.Exists(bakPath))
            {
                try
                {
                    string bak = FileOps.ReadText(bakPath);
                    if (ModCatalog.Match(bak) == null && bak.Contains("core.asar"))
                    {
                        FileOps.Retry(() => FileOps.WriteAllTextAtomic(indexJs, bak), indexJs, ct);
                        FileOps.DeleteFile(bakPath, ct);
                        return;
                    }
                }
                catch { }
                FileOps.DeleteFile(bakPath, ct);
            }

            FileOps.Retry(() => FileOps.WriteAllTextAtomic(indexJs, "module.exports = require('./core.asar');\r\n"), indexJs, ct);
        }

        static void ExtractPayloadAsset(string name, string dest, CancellationToken ct)
        {
            // 1. Check CustomPayloadDirectory or local dist folder if available
            string[] candidates =
            {
                !string.IsNullOrEmpty(CustomPayloadDirectory) ? Path.Combine(CustomPayloadDirectory, name) : null,
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dist", name),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, name)
            };

            foreach (var c in candidates)
            {
                if (!string.IsNullOrEmpty(c) && File.Exists(c) && FileOps.SizeOf(c) > 0)
                {
                    FileOps.Retry(() => File.Copy(c, dest, true), dest, ct);
                    return;
                }
            }

            // 1b. Check local dist_compressed/*.gz if available
            string[] gzCandidates =
            {
                !string.IsNullOrEmpty(CustomPayloadDirectory) ? Path.Combine(CustomPayloadDirectory, name + ".gz") : null,
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dist_compressed", name + ".gz")
            };

            foreach (var gz in gzCandidates)
            {
                if (!string.IsNullOrEmpty(gz) && File.Exists(gz) && FileOps.SizeOf(gz) > 0)
                {
                    FileOps.Retry(() =>
                    {
                        using (var fs = File.OpenRead(gz))
                        using (var gzs = new System.IO.Compression.GZipStream(fs, System.IO.Compression.CompressionMode.Decompress))
                        using (var outFs = new FileStream(dest, FileMode.Create, FileAccess.Write, FileShare.None))
                        {
                            gzs.CopyTo(outFs);
                        }
                    }, dest, ct);
                    return;
                }
            }

            // 2. Embedded resource in EndcordInstaller.exe (supports raw or .gz)
            var asm = Assembly.GetExecutingAssembly();
            string match = null;
            bool isGz = false;
            foreach (var resName in asm.GetManifestResourceNames())
            {
                if (string.Equals(resName, name, StringComparison.OrdinalIgnoreCase) ||
                    resName.EndsWith("." + name, StringComparison.OrdinalIgnoreCase) ||
                    resName.EndsWith(name, StringComparison.OrdinalIgnoreCase))
                {
                    match = resName;
                    isGz = false;
                    break;
                }
                if (string.Equals(resName, name + ".gz", StringComparison.OrdinalIgnoreCase) ||
                    resName.EndsWith("." + name + ".gz", StringComparison.OrdinalIgnoreCase) ||
                    resName.EndsWith(name + ".gz", StringComparison.OrdinalIgnoreCase))
                {
                    match = resName;
                    isGz = true;
                    break;
                }
            }

            if (match == null)
                throw new InstallerException(FailureKind.PayloadMissing, "Embedded resource not found: " + name, name);

            FileOps.Retry(() =>
            {
                using (var s = asm.GetManifestResourceStream(match))
                using (var f = new FileStream(dest, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    if (isGz)
                    {
                        using (var gzs = new System.IO.Compression.GZipStream(s, System.IO.Compression.CompressionMode.Decompress))
                        {
                            gzs.CopyTo(f);
                        }
                    }
                    else
                    {
                        s.CopyTo(f);
                    }
                }
            }, dest, ct);
        }

        static void Report(
            Action<InstallProgressEvent> cb,
            InstallStage stage,
            int completed,
            int total,
            string key,
            object[] args,
            string log,
            bool warn,
            bool err,
            bool ok)
        {
            if (cb == null) return;
            cb(new InstallProgressEvent
            {
                Stage = stage,
                CompletedSteps = completed,
                TotalSteps = total,
                StatusKey = key,
                StatusArgs = args,
                LogMessage = log,
                IsWarning = warn,
                IsError = err,
                IsSuccess = ok
            });
        }

        public static void SyncClientLanguageSetting(InstallerPaths paths, string langCode)
        {
            if (paths == null || string.IsNullOrEmpty(langCode)) return;
            try
            {
                string norm = langCode.Trim().ToLowerInvariant();
                if (norm.Length >= 2) norm = norm.Substring(0, 2);
                if (norm != "en" && norm != "tr" && norm != "ru" && norm != "es" && norm != "fr")
                    norm = "en";

                Directory.CreateDirectory(paths.SettingsDir);
                JsonObject root;
                if (File.Exists(paths.SettingsFile))
                {
                    try { root = Json.ParseObject(FileOps.ReadText(paths.SettingsFile)); }
                    catch { root = new JsonObject(); }
                }
                else
                {
                    root = new JsonObject();
                }

                root["language"] = norm;
                string serialized = Json.Serialize(root) + "\n";
                FileOps.WriteAllTextAtomic(paths.SettingsFile, serialized);

                string stateFile = Path.Combine(paths.EndcordRoot, "installer-state.json");
                var stateObj = new JsonObject();
                stateObj["language"] = norm;
                FileOps.WriteAllTextAtomic(stateFile, Json.Serialize(stateObj) + "\n");
            }
            catch { }
        }
    }
}
