using System;
using System.Globalization;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using EndcordInstaller.Core;
using EndcordInstaller.Localization;
using Path = System.Windows.Shapes.Path;

namespace EndcordInstaller.UI
{
    /// <summary>
    /// Endcord Desktop's setup: the same exe as the installer, started as EndcordDesktopSetup.exe (or with --desktop).
    /// One screen at a time, in the installer's colors: install or update, the work, done or what went wrong, and removal
    /// when Settings > Apps starts it with --uninstall-desktop
    /// </summary>
    public sealed class DesktopSetupWindow : Window
    {
        const double WinW = 460;
        const double WinH = 430;
        const double Inner = WinW - 64;

        readonly DesktopEngine _engine;
        readonly Grid _body;
        bool _busy;
        bool _closeWhenDone;
        CancellationTokenSource _cts = new CancellationTokenSource();
        TextBlock _status;
        TextBlock _percent;
        PixelProgress _bar;

        public DesktopSetupWindow(bool removing)
        {
            var paths = InstallerPaths.FromEnvironment();
            _engine = new DesktopEngine(paths);
            string language = new Prefs(paths).Language;
            Loc.Initialize(string.IsNullOrEmpty(language) ? CultureInfo.CurrentUICulture.TwoLetterISOLanguageName : language);

            Title = "Endcord Desktop";
            Width = WinW;
            Height = WinH;
            ResizeMode = ResizeMode.CanMinimize;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);

            var root = new Grid { Background = Ink.Frozen(Ink.Night), ClipToBounds = true };
            root.Clip = new RectangleGeometry(new Rect(0, 0, WinW, WinH), 14, 14);
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(58) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.Children.Add(InstallerWindow.MakePixelGrid());

            var header = new Grid { Background = Brushes.Transparent };
            header.MouseLeftButtonDown += (s, e) => { try { DragMove(); } catch { } };
            var left = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(22, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
            BitmapSource logo = InstallerWindow.LoadLogo();
            if (logo != null)
            {
                var mark = new Image { Source = logo, Width = 34, Height = 34, Margin = new Thickness(-6, 0, 2, 0) };
                RenderOptions.SetBitmapScalingMode(mark, BitmapScalingMode.HighQuality);
                left.Children.Add(mark);
            }
            left.Children.Add(new TextBlock { Text = "Endcord", FontFamily = Ink.Display, FontSize = 17, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(Ink.Paper), VerticalAlignment = VerticalAlignment.Center });
            header.Children.Add(left);
            header.Children.Add(MakeCloseButton());
            root.Children.Add(header);

            _body = new Grid { Margin = new Thickness(32, 8, 32, 28) };
            Grid.SetRow(_body, 1);
            root.Children.Add(_body);
            Content = root;

            if (removing) ShowRemoveConfirm();
            else ShowWelcome();

            // Alt+F4 and the taskbar's Close would otherwise end the process mid-swap: stop the work at a safe point, then close
            Closing += (s, e) =>
            {
                if (!_busy) return;
                e.Cancel = true;
                _closeWhenDone = true;
                try { _cts.Cancel(); } catch { }
            };
        }

        // #region Screens

        void ShowWelcome()
        {
            var panel = Screen();
            panel.Children.Add(Heading("Endcord Desktop", Ink.Paper));
            panel.Children.Add(Paragraph(Loc.T("desktop.tagline"), Ink.Mist, 14, 10));
            panel.Children.Add(Paragraph(Loc.T("desktop.note"), Ink.Dim, 12.5, 8));
            panel.Children.Add(Paragraph(Loc.T("privacy.note"), Ink.Dim, 11.5, 8));
            var buttons = Bottom(panel);
            var install = Primary(Loc.T(_engine.IsInstalled ? "desktop.btn.update" : "desktop.btn.install"));
            install.Click += RunInstall;
            buttons.Children.Add(install);
            if (_engine.IsInstalled)
            {
                var remove = Secondary(Loc.T("desktop.btn.remove"));
                remove.Margin = new Thickness(0, 10, 0, 0);
                remove.Click += ShowRemoveConfirm;
                buttons.Children.Add(remove);
            }
        }

        void ShowWorking(string headingKey)
        {
            var panel = Screen();
            panel.Children.Add(Heading(Loc.T(headingKey), Ink.Paper));
            _status = Paragraph("", Ink.Mist, 13.5, 26);
            panel.Children.Add(_status);
            _bar = new PixelProgress(Inner, 24) { Margin = new Thickness(0, 14, 0, 0) };
            panel.Children.Add(_bar);
            _percent = Paragraph("0%", Ink.Dim, 12.5, 10);
            panel.Children.Add(_percent);
        }

        void ShowDone()
        {
            var panel = Screen();
            panel.Children.Add(Heading(Loc.T("desktop.done.title"), Ink.Bamboo));
            panel.Children.Add(Paragraph(Loc.T("desktop.done.body"), Ink.Mist, 14, 10));
            var buttons = Bottom(panel);
            var open = Primary(Loc.T("desktop.btn.open"));
            open.Click += () =>
            {
                try { _engine.Open(); } catch { }
                Close();
            };
            buttons.Children.Add(open);
            var close = Secondary(Loc.T("desktop.btn.close"));
            close.Margin = new Thickness(0, 10, 0, 0);
            close.Click += Close;
            buttons.Children.Add(close);
        }

        void ShowError(string message, Action retry)
        {
            var panel = Screen();
            panel.Children.Add(Heading(Loc.T("desktop.err.title"), Ink.Ember));
            panel.Children.Add(Paragraph(message, Ink.Mist, 13.5, 10));
            var buttons = Bottom(panel);
            var again = Primary(Loc.T("desktop.btn.retry"));
            again.Click += retry;
            buttons.Children.Add(again);
            var close = Secondary(Loc.T("desktop.btn.close"));
            close.Margin = new Thickness(0, 10, 0, 0);
            close.Click += Close;
            buttons.Children.Add(close);
        }

        void ShowRemoveConfirm()
        {
            var panel = Screen();
            panel.Children.Add(Heading(Loc.T("desktop.remove.title"), Ink.Paper));
            panel.Children.Add(Paragraph(Loc.T("desktop.remove.body"), Ink.Mist, 14, 10));

            var check = new PixelCheck(false) { VerticalAlignment = VerticalAlignment.Center };
            var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 18, 0, 0), Cursor = Cursors.Hand, Background = Brushes.Transparent };
            row.Children.Add(check);
            row.Children.Add(new TextBlock { Text = Loc.T("desktop.remove.data"), FontFamily = Ink.Body, FontSize = 13, Foreground = Ink.Frozen(Ink.Paper), Margin = new Thickness(10, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap, MaxWidth = Inner - 30 });
            row.MouseLeftButtonUp += (s, e) => check.Set(!check.IsChecked, true);
            panel.Children.Add(row);

            var buttons = Bottom(panel);
            var remove = new PixelButton(Loc.T("desktop.btn.remove"), Ink.Ember, Color.FromRgb(0xF5, 0x8C, 0x82), Ink.Night, 48);
            remove.Click += () => RunRemove(check.IsChecked);
            buttons.Children.Add(remove);
            var cancel = Secondary(Loc.T("desktop.btn.cancel"));
            cancel.Margin = new Thickness(0, 10, 0, 0);
            cancel.Click += () => { if (_engine.IsInstalled) ShowWelcome(); else Close(); };
            buttons.Children.Add(cancel);
        }

        void ShowRemoved()
        {
            var panel = Screen();
            panel.Children.Add(Heading(Loc.T("desktop.removed.title"), Ink.Paper));
            var buttons = Bottom(panel);
            var close = Primary(Loc.T("desktop.btn.close"));
            close.Click += Close;
            buttons.Children.Add(close);
        }

        // #endregion

        // #region Work

        void RunInstall()
        {
            ShowWorking(_engine.IsInstalled ? "desktop.btn.update" : "desktop.btn.install");
            RunInBackground(ct => _engine.Install(Report, ct), ShowDone, RunInstall);
        }

        void RunRemove(bool removeData)
        {
            ShowWorking("desktop.btn.remove");
            // Removal is short and has no way back once started, so closing waits for it
            RunInBackground(ct => _engine.Uninstall(removeData, Report, CancellationToken.None), ShowRemoved, () => RunRemove(removeData));
        }

        void Report(double ratio, string statusKey)
        {
            Dispatcher.BeginInvoke(new Action(() =>
            {
                if (_status == null) return;
                _status.Text = Loc.T(statusKey);
                _bar.SetValue(ratio);
                _percent.Text = ((int)Math.Round(ratio * 100)).ToString(CultureInfo.InvariantCulture) + "%";
            }));
        }

        void RunInBackground(Action<CancellationToken> work, Action done, Action retry)
        {
            _busy = true;
            _cts = new CancellationTokenSource();
            var token = _cts.Token;
            var thread = new Thread(() =>
            {
                Exception failure = null;
                try { work(token); }
                catch (Exception e) { failure = e; }
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    _busy = false;
                    if (_closeWhenDone) Close();
                    else if (failure == null) done();
                    else ShowError(Describe(failure), retry);
                }));
            });
            thread.IsBackground = true;
            thread.Start();
        }

        static string Describe(Exception e)
        {
            var setup = e as DesktopSetupException;
            if (setup == null) return Loc.F("desktop.err.failed", e.Message);
            return setup.MessageKey == "desktop.err.failed" ? Loc.F("desktop.err.failed", setup.Message) : Loc.T(setup.MessageKey);
        }

        // #endregion

        // #region Pieces

        StackPanel Screen()
        {
            _body.Children.Clear();
            _status = null;
            var panel = new StackPanel();
            _body.Children.Add(panel);
            return panel;
        }

        /// <summary>The buttons, held to the bottom of the window whatever the text above takes</summary>
        StackPanel Bottom(StackPanel panel)
        {
            var buttons = new StackPanel { VerticalAlignment = VerticalAlignment.Bottom };
            _body.Children.Add(buttons);
            return buttons;
        }

        static TextBlock Heading(string text, Color color)
        {
            return new TextBlock { Text = text, FontFamily = Ink.Display, FontSize = 24, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(color), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 0) };
        }

        static TextBlock Paragraph(string text, Color color, double size, double top)
        {
            return new TextBlock { Text = text, FontFamily = Ink.Body, FontSize = size, Foreground = Ink.Frozen(color), TextWrapping = TextWrapping.Wrap, LineHeight = size * 1.45, Margin = new Thickness(0, top, 0, 0) };
        }

        static PixelButton Primary(string text)
        {
            return new PixelButton(text, Ink.Cobalt, Ink.CobaltHi, Ink.Paper, 48);
        }

        static PixelButton Secondary(string text)
        {
            return new PixelButton(text, Ink.Panel, Ink.PanelHi, Ink.Paper, 42);
        }

        FrameworkElement MakeCloseButton()
        {
            var icon = new Path { Data = Geometry.Parse("M 0,0 L 9,9 M 9,0 L 0,9"), Stroke = Ink.Frozen(Ink.Mist), StrokeThickness = 1.6, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            var fill = Ink.Brush(Colors.Transparent);
            var button = new Border { Width = 34, Height = 30, CornerRadius = new CornerRadius(6), Background = fill, Child = icon, Cursor = Cursors.Hand, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 12, 0) };
            button.MouseEnter += (s, e) => fill.Color = Ink.WithAlpha(Ink.Ember, 60);
            button.MouseLeave += (s, e) => fill.Color = Colors.Transparent;
            button.MouseLeftButtonUp += (s, e) => Close();
            return button;
        }

        // #endregion
    }
}
