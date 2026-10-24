using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;

namespace EndcordInstaller.Core
{
    public enum FailureKind
    {
        None,
        Cancelled,
        PermissionDenied,
        FilesLocked,
        DiscordStillRunning,
        DiscordDamaged,
        NoTargets,
        PayloadMissing,
        MigrationFailed,
        VerificationFailed,
        Unknown
    }

    public sealed class InstallerException : Exception
    {
        public FailureKind Kind { get; private set; }
        /// <summary>File, folder or app name the failure is about (shown to the user).</summary>
        public string Subject { get; private set; }

        public InstallerException(FailureKind kind, string message, string subject, Exception inner)
            : base(message, inner)
        {
            Kind = kind;
            Subject = subject;
        }

        public InstallerException(FailureKind kind, string message, string subject)
            : this(kind, message, subject, null) { }
    }

    public static class FileOps
    {
        public static readonly Encoding Utf8 = new UTF8Encoding(false);

        /// <summary>Raised whenever a locked file forces a retry (lets the UI explain the pause).</summary>
        public static event Action<string> RetryingLocked;

        /// <summary>
        /// Runs a filesystem action, retrying sharing violations (Discord / antivirus briefly holding files).
        /// Converts the final failure into an <see cref="InstallerException"/> with a user-meaningful kind.
        /// </summary>
        public static void Retry(Action action, string subject, CancellationToken ct)
        {
            int[] delays = { 150, 300, 600, 1000, 1500 };
            int deniedCount = 0;
            for (int attempt = 0; ; attempt++)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    action();
                    return;
                }
                catch (FileNotFoundException) { throw; }
                catch (DirectoryNotFoundException) { throw; }
                catch (PathTooLongException) { throw; }
                catch (UnauthorizedAccessException ex)
                {
                    // Antivirus scanners can briefly report "access denied"; give it two quick retries.
                    deniedCount++;
                    if (deniedCount > 2)
                        throw new InstallerException(FailureKind.PermissionDenied, ex.Message, subject, ex);
                }
                catch (IOException ex)
                {
                    if (attempt >= delays.Length)
                        throw new InstallerException(FailureKind.FilesLocked, ex.Message, subject, ex);
                    var h = RetryingLocked;
                    if (h != null) h(subject);
                }

                int wait = delays[Math.Min(attempt, delays.Length - 1)];
                if (ct.WaitHandle.WaitOne(wait)) ct.ThrowIfCancellationRequested();
            }
        }

        public static void Retry(Action action, string subject)
        {
            Retry(action, subject, CancellationToken.None);
        }

        /// <summary>Writes through a temp file so a crash never leaves a half-written settings file.</summary>
        public static void WriteAllTextAtomic(string path, string content)
        {
            string dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            string tmp = path + ".endcord-tmp";
            File.WriteAllText(tmp, content, Utf8);
            if (File.Exists(path))
            {
                ClearReadOnly(path);
                File.Replace(tmp, path, null, true);
            }
            else
            {
                File.Move(tmp, path);
            }
        }

        public static string ReadText(string path)
        {
            return File.ReadAllText(path, Utf8);
        }

        /// <summary>Reads at most <paramref name="maxBytes"/> as Latin-1 (safe for binary stubs like asar files).</summary>
        public static string ReadSmall(string path, int maxBytes)
        {
            try
            {
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    int len = (int)Math.Min(fs.Length, maxBytes);
                    var buf = new byte[len];
                    int read = 0;
                    while (read < len)
                    {
                        int n = fs.Read(buf, read, len - read);
                        if (n <= 0) break;
                        read += n;
                    }
                    return Encoding.GetEncoding(28591).GetString(buf, 0, read);
                }
            }
            catch
            {
                return null;
            }
        }

        public static long SizeOf(string path)
        {
            try { return File.Exists(path) ? new FileInfo(path).Length : -1; }
            catch { return -1; }
        }

        public static void ClearReadOnly(string path)
        {
            try
            {
                var attr = File.GetAttributes(path);
                if ((attr & FileAttributes.ReadOnly) != 0)
                    File.SetAttributes(path, attr & ~FileAttributes.ReadOnly);
            }
            catch { }
        }

        public static void CopyDirectory(string src, string dst, CancellationToken ct)
        {
            Directory.CreateDirectory(dst);
            foreach (var file in Directory.GetFiles(src))
            {
                ct.ThrowIfCancellationRequested();
                string target = Path.Combine(dst, Path.GetFileName(file));
                string f = file;
                Retry(() => File.Copy(f, target, true), target, ct);
            }
            foreach (var dir in Directory.GetDirectories(src))
                CopyDirectory(dir, Path.Combine(dst, Path.GetFileName(dir)), ct);
        }

        public static void DeleteFile(string path, CancellationToken ct)
        {
            if (!File.Exists(path)) return;
            Retry(() =>
            {
                ClearReadOnly(path);
                File.Delete(path);
            }, path, ct);
        }

        public static void DeleteDirectory(string path, CancellationToken ct)
        {
            if (!Directory.Exists(path)) return;
            Retry(() =>
            {
                foreach (var f in Directory.GetFiles(path, "*", SearchOption.AllDirectories)) ClearReadOnly(f);
                Directory.Delete(path, true);
            }, path, ct);
        }

        public static void Move(string src, string dst, CancellationToken ct)
        {
            Retry(() =>
            {
                if (Directory.Exists(src)) Directory.Move(src, dst);
                else File.Move(src, dst);
            }, src, ct);
        }

        public static bool Exists(string path)
        {
            return File.Exists(path) || Directory.Exists(path);
        }

        public static void DeletePath(string path, CancellationToken ct)
        {
            if (Directory.Exists(path)) DeleteDirectory(path, ct);
            else DeleteFile(path, ct);
        }

        /// <summary>True when <paramref name="path"/> is strictly inside <paramref name="root"/>.</summary>
        public static bool IsStrictlyInside(string path, string root)
        {
            try
            {
                string p = Path.GetFullPath(path).TrimEnd('\\', '/') + "\\";
                string r = Path.GetFullPath(root).TrimEnd('\\', '/') + "\\";
                return p.Length > r.Length && p.StartsWith(r, StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        /// <summary>Most recent write time of any file in a folder tree (MinValue if none).</summary>
        public static DateTime LatestWrite(params string[] paths)
        {
            DateTime best = DateTime.MinValue;
            foreach (var p in paths)
            {
                try
                {
                    if (File.Exists(p))
                    {
                        var t = File.GetLastWriteTime(p);
                        if (t > best) best = t;
                    }
                    else if (Directory.Exists(p))
                    {
                        foreach (var f in Directory.GetFiles(p, "*", SearchOption.AllDirectories))
                        {
                            var t = File.GetLastWriteTime(f);
                            if (t > best) best = t;
                        }
                    }
                }
                catch { }
            }
            return best;
        }
    }

    /// <summary>Tiny key=value file format used for preferences and backup manifests.</summary>
    public static class Ini
    {
        public static Dictionary<string, string> Read(string path)
        {
            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                if (!File.Exists(path)) return d;
                foreach (var raw in File.ReadAllLines(path, FileOps.Utf8))
                {
                    string line = raw.Trim();
                    if (line.Length == 0 || line[0] == '#' || line[0] == ';') continue;
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    d[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
                }
            }
            catch { }
            return d;
        }

        public static void Write(string path, IDictionary<string, string> values)
        {
            var sb = new StringBuilder();
            foreach (var kv in values)
            {
                string v = (kv.Value ?? "").Replace("\r", " ").Replace("\n", " ");
                sb.Append(kv.Key).Append('=').Append(v).Append("\r\n");
            }
            FileOps.WriteAllTextAtomic(path, sb.ToString());
        }
    }
}
