using System;
using System.Collections.Generic;

namespace EndcordInstaller.Core
{
    public enum SettingsFormat
    {
        /// <summary>Settings can't be read by Endcord at all.</summary>
        None,
        /// <summary>Vencord-style settings/settings.json, quickCss.css and themes/ (Vencord and its forks).</summary>
        VencordFamily,
        /// <summary>BetterDiscord: only the *.theme.css files are reusable.</summary>
        BetterDiscord
    }

    public enum ModKind
    {
        /// <summary>Injected into the official Discord app (can conflict with Endcord).</summary>
        Injector,
        /// <summary>A separate desktop app (Vesktop, Equibop). Never touched, only used as a settings source.</summary>
        Standalone
    }

    public sealed class KnownMod
    {
        public string Id { get; private set; }
        public string DisplayName { get; private set; }
        /// <summary>Lower-case strings that identify this mod inside Discord's loader files.</summary>
        public string[] Markers { get; private set; }
        /// <summary>Folder names under %APPDATA% that hold this mod's data.</summary>
        public string[] DataDirNames { get; private set; }
        public SettingsFormat Format { get; private set; }
        public ModKind Kind { get; private set; }

        public KnownMod(string id, string name, string[] markers, string[] dataDirs, SettingsFormat format, ModKind kind)
        {
            Id = id; DisplayName = name; Markers = markers; DataDirNames = dataDirs; Format = format; Kind = kind;
        }

        public bool IsEndcord { get { return Id == "endcord"; } }
        public bool IsUnknown { get { return Id == "unknown"; } }
        public override string ToString() { return DisplayName; }
    }

    public static class ModCatalog
    {
        public static readonly KnownMod Endcord = new KnownMod("endcord", "Endcord",
            new[] { "endcord" }, new[] { "Endcord" }, SettingsFormat.VencordFamily, ModKind.Injector);

        /// <summary>Something replaced Discord's loader but we can't tell what.</summary>
        public static readonly KnownMod Unknown = new KnownMod("unknown", "?",
            new string[0], new string[0], SettingsFormat.None, ModKind.Injector);

        // Order matters for marker matching: forks are checked before "vencord" because
        // their loaders sometimes mention Vencord too.
        public static readonly KnownMod[] All =
        {
            Endcord,
            new KnownMod("equicord", "Equicord", new[] { "equicord" }, new[] { "Equicord" }, SettingsFormat.VencordFamily, ModKind.Injector),
            new KnownMod("nightcord", "Nightcord", new[] { "nightcord" }, new[] { "Nightcord" }, SettingsFormat.VencordFamily, ModKind.Injector),
            new KnownMod("mallcord", "Mallcord", new[] { "mallcord" }, new[] { "Mallcord" }, SettingsFormat.VencordFamily, ModKind.Injector),
            new KnownMod("suncord", "Suncord", new[] { "suncord" }, new[] { "Suncord" }, SettingsFormat.VencordFamily, ModKind.Injector),
            new KnownMod("betterdiscord", "BetterDiscord", new[] { "betterdiscord" }, new[] { "BetterDiscord" }, SettingsFormat.BetterDiscord, ModKind.Injector),
            new KnownMod("replugged", "Replugged", new[] { "replugged" }, new[] { "replugged" }, SettingsFormat.None, ModKind.Injector),
            new KnownMod("moonlight", "Moonlight", new[] { "moonlight" }, new[] { "moonlight-mod" }, SettingsFormat.None, ModKind.Injector),
            new KnownMod("vencord", "Vencord", new[] { "vencord" }, new[] { "Vencord" }, SettingsFormat.VencordFamily, ModKind.Injector),
            new KnownMod("vesktop", "Vesktop", new string[0], new[] { "vesktop" }, SettingsFormat.VencordFamily, ModKind.Standalone),
            new KnownMod("equibop", "Equibop", new string[0], new[] { "equibop" }, SettingsFormat.VencordFamily, ModKind.Standalone),
        };

        public static KnownMod ById(string id)
        {
            foreach (var m in All) if (m.Id == id) return m;
            return id == Unknown.Id ? Unknown : null;
        }

        /// <summary>Returns the first mod whose marker appears in <paramref name="text"/>, or null.</summary>
        public static KnownMod Match(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            string lower = text.ToLowerInvariant();
            foreach (var m in All)
                foreach (var marker in m.Markers)
                    if (lower.Contains(marker)) return m;
            return null;
        }

        public static IEnumerable<KnownMod> SettingsSources()
        {
            foreach (var m in All)
                if (!m.IsEndcord && m.Format != SettingsFormat.None) yield return m;
        }
    }
}
