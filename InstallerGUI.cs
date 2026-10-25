using System;
using System.Reflection;
using System.Runtime.InteropServices;
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
[assembly: AssemblyVersion("4.0.28.0")]
[assembly: AssemblyFileVersion("4.0.28.0")]
[assembly: AssemblyInformationalVersion("4.0.28")]
[assembly: ComVisible(false)]
[assembly: Guid("e8760626-8dd3-498f-abb9-eeac29266e0b")]
[assembly: System.Resources.NeutralResourcesLanguage("en-US")]


namespace EndcordInstaller
{
    static class Program
    {
        [DllImport("kernel32.dll")]
        static extern bool AttachConsole(int dwProcessId);
        const int ATTACH_PARENT_PROCESS = -1;

        [STAThread]
        static int Main(string[] args)
        {
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

            var app = new System.Windows.Application { ShutdownMode = System.Windows.ShutdownMode.OnMainWindowClose };
            app.Run(new InstallerWindow());
            return 0;
        }
    }
}
