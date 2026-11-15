using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace EndcordInstaller.Core
{
    /// <summary>
    /// The signed release manifest every Endcord updates from (version.json in the Endcord repository). The installer
    /// reads it for one thing: to tell whether an Endcord it finds already installed is a release of Endcord's own
    /// before leaving it in place. The payload and the key are those of src/main/updater/http.ts; nothing unsigned
    /// is trusted, and without a manifest the installer's own files are installed.
    /// </summary>
    public static class ReleaseManifest
    {
        public const string Url = "https://raw.githubusercontent.com/Endcord/Endcord/main/version.json";
        /// <summary>Endcord Desktop's manifest, signed with the same key (scripts/uploadRelease.mjs)</summary>
        public const string DesktopUrl = "https://raw.githubusercontent.com/Endcord/EndcordDesktop/main/version.json";
        // The release signing key's public half (src/main/updater/updateKey.pem), as its DER SubjectPublicKeyInfo
        const string PublicKeyBase64 = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJi37GlwG/uPNC4oQicUcI1bPlnri1pXQGzUzDQwBnxQ1+F7tFtUkOjancC1eScKb9H9eASOz7iUA3CiGgXtHaw==";
        const int FetchTimeoutMs = 6000;
        const int MaxManifestBytes = 64 * 1024;

        /// <summary>Where the manifest text comes from: GitHub, or in the self-tests a string of their own. Null means there is none</summary>
        public static Func<string> Fetch = () => FetchText(Url);
        /// <summary>The same for Endcord Desktop's manifest</summary>
        public static Func<string> FetchDesktop = () => FetchText(DesktopUrl);
        /// <summary>The key a manifest must be signed with: the P-256 point's X then Y, 64 bytes</summary>
        public static byte[] PublicKey = PointOf(Convert.FromBase64String(PublicKeyBase64));

        public sealed class Release
        {
            public string Version;
            public string Hash;
            /// <summary>Lower-case SHA-256 of the release's download: the Windows installer, or Endcord Desktop's runtime zip</summary>
            public string InstallerSha256;
            /// <summary>Lower-case SHA-256 of each released file, by name</summary>
            public readonly Dictionary<string, string> Assets = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>The current release, when the manifest can be fetched and carries the release key's signature; null otherwise</summary>
        public static Release Current()
        {
            try
            {
                string text = Fetch();
                return text == null ? null : Verify(text);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>The release a manifest describes, or null when it isn't a manifest or isn't signed by the release key</summary>
        public static Release Verify(string json)
        {
            return Verify(json, InstallationEngine.PayloadFiles);
        }

        /// <summary>The same, for a release whose files are exactly <paramref name="files"/></summary>
        public static Release Verify(string json, string[] files)
        {
            try
            {
                var m = Json.ParseObject(json);
                string version = m["version"] as string;
                string hash = m["hash"] as string;
                string installerSha256 = m["installerSha256"] as string;
                string signature = m["signature"] as string;
                var updatedAt = m["updatedAt"] as JsonNumber;
                var assets = m["assets"] as List<object>;
                if (version == null || hash == null || installerSha256 == null || signature == null || updatedAt == null || assets == null) return null;
                // The signed text is these fields joined by line breaks, so each must keep to its own line, and the release
                // is Endcord's files and nothing else. Kept in step with isSignedManifest in src/main/updater/http.ts
                if (!IsToken(version) || !IsToken(hash) || !IsHash(installerSha256)) return null;
                if (assets.Count != files.Length) return null;

                var release = new Release { Version = version, Hash = hash, InstallerSha256 = installerSha256.ToLowerInvariant() };
                var assetLines = new List<string>();
                foreach (var item in assets)
                {
                    var asset = item as JsonObject;
                    string name = asset == null ? null : asset["name"] as string;
                    string sha256 = asset == null ? null : asset["sha256"] as string;
                    if (name == null || sha256 == null || !IsHash(sha256)) return null;
                    assetLines.Add(name + " " + sha256);
                    release.Assets[name] = sha256.ToLowerInvariant();
                }

                foreach (var name in files)
                {
                    if (!release.Assets.ContainsKey(name)) return null;
                }

                // Kept in step with signManifest in scripts/uploadRelease.mjs. JavaScript sorts by code unit, as CompareOrdinal does,
                // and writes the number as it stands in the file
                assetLines.Sort(string.CompareOrdinal);
                var payload = new List<string> { version, hash, updatedAt.Raw, installerSha256 };
                payload.AddRange(assetLines);
                byte[] data = Encoding.UTF8.GetBytes(string.Join("\n", payload.ToArray()));

                return VerifySignature(data, Convert.FromBase64String(signature), PublicKey) ? release : null;
            }
            catch
            {
                return null;
            }
        }

        static bool IsHash(string value)
        {
            if (value.Length != 64) return false;
            foreach (char c in value)
            {
                if (!Uri.IsHexDigit(c)) return false;
            }
            return true;
        }

        static bool IsToken(string value)
        {
            if (value.Length == 0 || value.Length > 64) return false;
            foreach (char c in value)
            {
                bool allowed = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-' || c == '+';
                if (!allowed) return false;
            }
            return true;
        }

        /// <summary>Whether every payload file in the folder is byte for byte the release's</summary>
        public static bool MatchesInstalled(Release release, string distDir)
        {
            if (release == null) return false;
            foreach (var name in InstallationEngine.PayloadFiles)
            {
                string expected;
                if (!release.Assets.TryGetValue(name, out expected)) return false;
                try
                {
                    if (!string.Equals(FileOps.Sha256(Path.Combine(distDir, name)), expected, StringComparison.OrdinalIgnoreCase)) return false;
                }
                catch
                {
                    return false;
                }
            }
            return true;
        }

        static string FetchText(string url)
        {
            // Older Windows defaults to TLS 1.0, which GitHub turns away
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var request = (HttpWebRequest)WebRequest.Create(url + "?t=" + DateTime.UtcNow.Ticks);
            request.Timeout = FetchTimeoutMs;
            request.ReadWriteTimeout = FetchTimeoutMs;
            request.UserAgent = "EndcordInstaller";
            request.AllowAutoRedirect = false;
            using (var response = (HttpWebResponse)request.GetResponse())
            {
                if (response.StatusCode != HttpStatusCode.OK) return null;
                using (var stream = response.GetResponseStream())
                using (var buffer = new MemoryStream())
                {
                    var chunk = new byte[8192];
                    int read;
                    while ((read = stream.Read(chunk, 0, chunk.Length)) > 0)
                    {
                        if (buffer.Length + read > MaxManifestBytes) return null;
                        buffer.Write(chunk, 0, read);
                    }
                    return Encoding.UTF8.GetString(buffer.ToArray());
                }
            }
        }

        /// <summary>ECDSA P-256 over SHA-256, with the signature as Node writes it (DER) and the key as X then Y</summary>
        public static bool VerifySignature(byte[] data, byte[] derSignature, byte[] publicKey)
        {
            byte[] raw = RawSignature(derSignature);
            if (data == null || raw == null || publicKey == null || publicKey.Length != 64) return false;

            // A CNG public key blob: the magic of a P-256 ECDSA public key ("ECS1"), the key length in bytes, then X and Y
            var blob = new byte[8 + 64];
            blob[0] = (byte)'E';
            blob[1] = (byte)'C';
            blob[2] = (byte)'S';
            blob[3] = (byte)'1';
            blob[4] = 32;
            Buffer.BlockCopy(publicKey, 0, blob, 8, 64);
            try
            {
                using (var key = CngKey.Import(blob, CngKeyBlobFormat.EccPublicBlob))
                using (var ecdsa = new ECDsaCng(key))
                {
                    ecdsa.HashAlgorithm = CngAlgorithm.Sha256;
                    return ecdsa.VerifyData(data, raw);
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>r then s, 32 bytes each, from a DER SEQUENCE of two INTEGERs; null when it isn't one</summary>
        static byte[] RawSignature(byte[] der)
        {
            try
            {
                int at = 0;
                if (der[at++] != 0x30) return null;
                if (ReadLength(der, ref at) != der.Length - at) return null;

                var raw = new byte[64];
                for (int part = 0; part < 2; part++)
                {
                    if (der[at++] != 0x02) return null;
                    int n = ReadLength(der, ref at);
                    // A zero in front only keeps a number whose top bit is set from reading as negative
                    while (n > 32 && der[at] == 0)
                    {
                        at++;
                        n--;
                    }
                    if (n > 32) return null;
                    Buffer.BlockCopy(der, at, raw, part * 32 + 32 - n, n);
                    at += n;
                }
                return at == der.Length ? raw : null;
            }
            catch
            {
                return null;
            }
        }

        static int ReadLength(byte[] der, ref int at)
        {
            int first = der[at++];
            if (first < 0x80) return first;
            int bytes = first & 0x7F;
            if (bytes < 1 || bytes > 2) throw new FormatException("Bad DER length");
            int length = 0;
            for (int i = 0; i < bytes; i++) length = (length << 8) | der[at++];
            return length;
        }

        /// <summary>X then Y from a P-256 SubjectPublicKeyInfo, whose last 65 bytes are the uncompressed point; null for anything else</summary>
        static byte[] PointOf(byte[] spki)
        {
            if (spki == null || spki.Length != 91 || spki[26] != 0x04) return null;
            var point = new byte[64];
            Buffer.BlockCopy(spki, 27, point, 0, 64);
            return point;
        }
    }
}
