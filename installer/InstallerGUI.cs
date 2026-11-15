using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using EndcordInstaller.Core;
using EndcordInstaller.Tests;
using EndcordInstaller.UI;

[assembly: AssemblyTitle("Endcord Installer")]
[assembly: AssemblyDescription("Official Endcord desktop installer & migration suite. Installs, updates, repairs, migrates settings, or removes the open-source Endcord Discord client modification.")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("Endcord")]
[assembly: AssemblyProduct("Endcord")]
[assembly: AssemblyCopyright("Copyright © 2026 Endcord. Licensed under GPL-3.0-or-later.")]
[assembly: AssemblyTrademark("")]
[assembly: AssemblyCulture("")]
[assembly: AssemblyVersion("4.1.1.0")]
[assembly: AssemblyFileVersion("4.1.1.0")]
[assembly: AssemblyInformationalVersion("4.1.1")]
[assembly: ComVisible(false)]
[assembly: Guid("e8760626-8dd3-498f-abb9-eeac29266e0b")]
[assembly: System.Resources.NeutralResourcesLanguage("en-US")]


namespace EndcordInstaller
{
    static class Program
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool SetDefaultDllDirectories(uint directoryFlags);
        const uint LOAD_LIBRARY_SEARCH_SYSTEM32 = 0x800;

        [DllImport("kernel32.dll")]
        static extern bool AttachConsole(int dwProcessId);
        const int ATTACH_PARENT_PROCESS = -1;

        [STAThread]
        static int Main(string[] args)
        {
            // Installers run from Downloads, where a drive-by download can sit next to them under a DLL's name
            SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32);

            if (args != null && args.Length > 0 && string.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase))
            {
                try { AttachConsole(ATTACH_PARENT_PROCESS); } catch { }
                string logOut = args.Length > 1 ? args[1] : null;
                return InstallerTestRunner.RunAll(logOut);
            }

            if (args != null && args.Length > 1 && string.Equals(args[0], "--render-previews", StringComparison.OrdinalIgnoreCase))
            {
                InstallerWindow.RenderPreviewSuite(args[1]);
                return 0;
            }

            // The same exe is Endcord Desktop's setup when it's named for it (the site's EndcordDesktopSetup.exe)
            string self = Assembly.GetExecutingAssembly().Location;
            bool removeDesktop = HasArg(args, "--uninstall-desktop");
            if (removeDesktop || HasArg(args, "--desktop") || Path.GetFileName(self).IndexOf("Desktop", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                if (removeDesktop && RelaunchOutsideInstall(self)) return 0;
                var setup = new System.Windows.Application { ShutdownMode = System.Windows.ShutdownMode.OnMainWindowClose };
                setup.Run(new DesktopSetupWindow(removeDesktop));
                if (HasArg(args, "--from-temp")) DeleteWhenClosed(self);
                return 0;
            }

            var app = new System.Windows.Application { ShutdownMode = System.Windows.ShutdownMode.OnMainWindowClose };
            app.Run(new InstallerWindow());
            return 0;
        }

        static bool HasArg(string[] args, string name)
        {
            if (args == null) return false;
            foreach (var arg in args)
            {
                if (string.Equals(arg, name, StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        /// <summary>
        /// Settings > Apps starts the copy inside the install folder, which can't remove the folder it runs from: it
        /// starts a copy of itself from the temp folder instead. True when that copy took over
        /// </summary>
        static bool RelaunchOutsideInstall(string self)
        {
            try
            {
                string installDir = new DesktopEngine(InstallerPaths.FromEnvironment()).InstallDir;
                if (!FileOps.IsStrictlyInside(self, installDir)) return false;
                string copy = Path.Combine(Path.GetTempPath(), "EndcordDesktopUninstall-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".exe");
                File.Copy(self, copy, true);
                Process.Start(new ProcessStartInfo(copy, "--uninstall-desktop --from-temp") { UseShellExecute = false });
                return true;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>The temp copy that removed the app deletes itself once it has exited</summary>
        static void DeleteWhenClosed(string self)
        {
            try
            {
                string cmd = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe");
                Process.Start(new ProcessStartInfo(cmd, "/c ping 127.0.0.1 -n 3 > nul & del /f /q \"" + self + "\"")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                });
            }
            catch { }
        }
    }
}
