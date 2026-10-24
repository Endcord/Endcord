using System;
using System.IO;

namespace EndcordInstaller.Core
{
    /// <summary>
    /// All filesystem roots used by the installer. Everything goes through this class so the
    /// test-suite can redirect the installer into a sandbox (ENDCORD_INSTALLER_ROAMING / _LOCAL).
    /// </summary>
    public sealed class InstallerPaths
    {
        public string Roaming { get; private set; }
        public string Local { get; private set; }

        public InstallerPaths(string roaming, string local)
        {
            if (string.IsNullOrEmpty(roaming)) throw new ArgumentNullException("roaming");
            if (string.IsNullOrEmpty(local)) throw new ArgumentNullException("local");
            Roaming = roaming;
            Local = local;
        }

        public static InstallerPaths FromEnvironment()
        {
            string roaming = Environment.GetEnvironmentVariable("ENDCORD_INSTALLER_ROAMING");
            if (string.IsNullOrEmpty(roaming))
                roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);

            string local = Environment.GetEnvironmentVariable("ENDCORD_INSTALLER_LOCAL");
            if (string.IsNullOrEmpty(local))
                local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            return new InstallerPaths(roaming, local);
        }

        public string EndcordRoot { get { return Path.Combine(Roaming, "Endcord"); } }
        public string Dist { get { return Path.Combine(EndcordRoot, "dist"); } }
        public string SettingsDir { get { return Path.Combine(EndcordRoot, "settings"); } }
        public string SettingsFile { get { return Path.Combine(SettingsDir, "settings.json"); } }
        public string NativeSettingsFile { get { return Path.Combine(SettingsDir, "native-settings.json"); } }
        public string QuickCssFile { get { return Path.Combine(SettingsDir, "quickCss.css"); } }
        public string ThemesDir { get { return Path.Combine(EndcordRoot, "themes"); } }
        public string InstallerDir { get { return Path.Combine(EndcordRoot, "installer"); } }
        public string BackupsDir { get { return Path.Combine(EndcordRoot, "backups"); } }
        public string PrefsFile { get { return Path.Combine(InstallerDir, "prefs.ini"); } }
        public string LogFile { get { return Path.Combine(InstallerDir, "last-run.log"); } }
        public string StagingDir { get { return Path.Combine(InstallerDir, "staging"); } }
        public bool IsSandboxed
        {
            get
            {
                string defaultLocal = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                return !string.Equals(Local, defaultLocal, StringComparison.OrdinalIgnoreCase);
            }
        }
    }
}
