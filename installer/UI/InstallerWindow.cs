using System;
using System.Collections.Generic;
using System.IO;
using Path = System.Windows.Shapes.Path;
using System.Reflection;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;
using EndcordInstaller.Core;
using EndcordInstaller.Localization;

namespace EndcordInstaller.UI
{
    public enum WizardScreen
    {
        IntroSplash = 0,
        LanguageSelect = 1,
        MigrationPrompt = 2,
        ClientTargets = 3,
        Installing = 4,
        Completed = 5
    }

    // Palette and type, taken from the logo: ice-blue pixel letters, a cobalt shade, panda black and white.
    static class Ink
    {
        public static readonly Color Night = Color.FromRgb(0x10, 0x18, 0x2A);
        public static readonly Color Panel = Color.FromRgb(0x16, 0x21, 0x37);
        public static readonly Color PanelHi = Color.FromRgb(0x1D, 0x2B, 0x46);
        public static readonly Color Line = Color.FromRgb(0x25, 0x34, 0x52);
        public static readonly Color Ice = Color.FromRgb(0x9C, 0xCB, 0xFF);
        public static readonly Color Cobalt = Color.FromRgb(0x3D, 0x74, 0xE0);
        public static readonly Color CobaltHi = Color.FromRgb(0x52, 0x88, 0xF0);
        public static readonly Color Paper = Color.FromRgb(0xF3, 0xF6, 0xFB);
        public static readonly Color Mist = Color.FromRgb(0x8D, 0x9B, 0xB5);
        public static readonly Color Dim = Color.FromRgb(0x5A, 0x69, 0x85);
        public static readonly Color Bamboo = Color.FromRgb(0x74, 0xD4, 0x9A);
        public static readonly Color Ember = Color.FromRgb(0xF0, 0x77, 0x6B);
        public static readonly Color Honey = Color.FromRgb(0xF2, 0xC1, 0x4E);

        public static readonly FontFamily Display = new FontFamily("Bahnschrift, Segoe UI");
        public static readonly FontFamily Body = new FontFamily("Segoe UI");

        public static SolidColorBrush Brush(Color c)
        {
            var b = new SolidColorBrush(c);
            return b;
        }

        public static SolidColorBrush Frozen(Color c)
        {
            var b = new SolidColorBrush(c);
            b.Freeze();
            return b;
        }

        public static Color WithAlpha(Color c, byte a)
        {
            return Color.FromArgb(a, c.R, c.G, c.B);
        }
    }

    static class Motion
    {
        public static readonly IEasingFunction Out = Freeze(new QuinticEase { EasingMode = EasingMode.EaseOut });
        public static readonly IEasingFunction OutSoft = Freeze(new CubicEase { EasingMode = EasingMode.EaseOut });
        public static readonly IEasingFunction InOut = Freeze(new CubicEase { EasingMode = EasingMode.EaseInOut });
        public static readonly IEasingFunction Pop = Freeze(new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.35 });

        static IEasingFunction Freeze(EasingFunctionBase e)
        {
            e.Freeze();
            return e;
        }

        public static bool Disabled;

        public static void To(IAnimatable target, DependencyProperty prop, double to, double ms, IEasingFunction ease, double delayMs = 0)
        {
            if (Disabled)
            {
                target.BeginAnimation(prop, null);
                var d = target as DependencyObject;
                if (d != null) d.SetValue(prop, to);
                return;
            }
            var a = new DoubleAnimation(to, TimeSpan.FromMilliseconds(ms)) { EasingFunction = ease, BeginTime = TimeSpan.FromMilliseconds(delayMs) };
            target.BeginAnimation(prop, a, HandoffBehavior.SnapshotAndReplace);
        }

        public static void FromTo(IAnimatable target, DependencyProperty prop, double from, double to, double ms, IEasingFunction ease, double delayMs = 0)
        {
            if (Disabled)
            {
                target.BeginAnimation(prop, null);
                var d = target as DependencyObject;
                if (d != null) d.SetValue(prop, to);
                return;
            }
            var a = new DoubleAnimation(from, to, TimeSpan.FromMilliseconds(ms)) { EasingFunction = ease, BeginTime = TimeSpan.FromMilliseconds(delayMs), FillBehavior = FillBehavior.HoldEnd };
            target.BeginAnimation(prop, a, HandoffBehavior.SnapshotAndReplace);
        }

        public static void Color(SolidColorBrush brush, Color to, double ms)
        {
            if (brush.IsFrozen) return;
            if (Disabled) { brush.BeginAnimation(SolidColorBrush.ColorProperty, null); brush.Color = to; return; }
            var a = new ColorAnimation(to, TimeSpan.FromMilliseconds(ms)) { EasingFunction = OutSoft };
            brush.BeginAnimation(SolidColorBrush.ColorProperty, a, HandoffBehavior.SnapshotAndReplace);
        }
    }

    // A flat button with stepped "pixel" corners, like the letters in the logo.
    sealed class PixelButton : Grid
    {
        readonly Path _shape;
        readonly SolidColorBrush _fill;
        readonly SolidColorBrush _textBrush;
        readonly TextBlock _label;
        readonly ScaleTransform _scale = new ScaleTransform(1, 1);
        readonly TranslateTransform _rise = new TranslateTransform();
        Color _base, _hover, _baseText;
        bool _enabled = true;
        bool _pressed;

        public event Action Click;

        public PixelButton(string text, Color fill, Color hover, Color textColor, double height)
        {
            Height = height;
            Cursor = Cursors.Hand;
            SnapsToDevicePixels = true;
            Focusable = true;
            FocusVisualStyle = null;
            RenderTransformOrigin = new Point(0.5, 0.5);
            var group = new TransformGroup();
            group.Children.Add(_scale);
            group.Children.Add(_rise);
            RenderTransform = group;

            _base = fill;
            _hover = hover;
            _baseText = textColor;
            _fill = Ink.Brush(fill);
            _textBrush = Ink.Brush(textColor);

            _shape = new Path { Fill = _fill, Stretch = Stretch.None };
            Children.Add(_shape);

            _label = new TextBlock
            {
                Text = text,
                FontFamily = Ink.Display,
                FontSize = 15,
                FontWeight = FontWeights.SemiBold,
                Foreground = _textBrush,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                TextTrimming = TextTrimming.CharacterEllipsis,
                Margin = new Thickness(12, 0, 12, 1)
            };
            Children.Add(_label);

            SizeChanged += (s, e) => _shape.Data = SteppedRect(e.NewSize.Width, e.NewSize.Height, 3);
            MouseEnter += (s, e) => { if (_enabled) { Motion.Color(_fill, _hover, 140); Motion.To(_rise, TranslateTransform.YProperty, -1.5, 280, Motion.Out); } };
            MouseLeave += (s, e) =>
            {
                _pressed = false;
                if (_enabled) Motion.Color(_fill, _base, 220);
                Motion.To(_rise, TranslateTransform.YProperty, 0, 300, Motion.Out);
                Press(false);
            };
            MouseLeftButtonDown += (s, e) => { if (!_enabled) return; _pressed = true; Press(true); e.Handled = true; };
            MouseLeftButtonUp += (s, e) =>
            {
                if (!_enabled || !_pressed) return;
                _pressed = false;
                Press(false);
                e.Handled = true;
                if (Click != null) Click();
            };
            KeyDown += (s, e) =>
            {
                if (_enabled && (e.Key == Key.Enter || e.Key == Key.Space) && Click != null) { e.Handled = true; Click(); }
            };
        }

        public string Text
        {
            get { return _label.Text; }
            set { _label.Text = value; }
        }

        public void SetColors(Color fill, Color hover, Color text)
        {
            _base = fill;
            _hover = hover;
            _baseText = text;
            if (_enabled)
            {
                Motion.Color(_fill, IsMouseOver ? hover : fill, 260);
                Motion.Color(_textBrush, text, 260);
            }
        }

        public bool Enabled
        {
            get { return _enabled; }
            set
            {
                _enabled = value;
                Cursor = value ? Cursors.Hand : Cursors.Arrow;
                Motion.Color(_fill, value ? (IsMouseOver ? _hover : _base) : Ink.Panel, 200);
                Motion.Color(_textBrush, value ? _baseText : Ink.Dim, 200);
            }
        }

        void Press(bool down)
        {
            Motion.To(_scale, ScaleTransform.ScaleXProperty, down ? 0.975 : 1, down ? 70 : 260, down ? Motion.OutSoft : Motion.Pop);
            Motion.To(_scale, ScaleTransform.ScaleYProperty, down ? 0.95 : 1, down ? 70 : 260, down ? Motion.OutSoft : Motion.Pop);
        }

        public static Geometry SteppedRect(double w, double h, double s)
        {
            if (w < s * 4 || h < s * 4) return new RectangleGeometry(new Rect(0, 0, Math.Max(0, w), Math.Max(0, h)));
            var g = new StreamGeometry();
            using (var c = g.Open())
            {
                c.BeginFigure(new Point(s * 2, 0), true, true);
                c.PolyLineTo(new[]
                {
                    new Point(w - s * 2, 0), new Point(w - s * 2, s), new Point(w - s, s), new Point(w - s, s * 2), new Point(w, s * 2),
                    new Point(w, h - s * 2), new Point(w - s, h - s * 2), new Point(w - s, h - s), new Point(w - s * 2, h - s), new Point(w - s * 2, h),
                    new Point(s * 2, h), new Point(s * 2, h - s), new Point(s, h - s), new Point(s, h - s * 2), new Point(0, h - s * 2),
                    new Point(0, s * 2), new Point(s, s * 2), new Point(s, s), new Point(s * 2, s)
                }, false, false);
            }
            g.Freeze();
            return g;
        }
    }

    // Square pixel checkbox; pops when toggled.
    sealed class PixelCheck : Grid
    {
        readonly Border _box;
        readonly Path _tick;
        readonly SolidColorBrush _boxFill;
        readonly SolidColorBrush _boxLine;
        readonly ScaleTransform _scale = new ScaleTransform(1, 1);
        bool _checked;

        public PixelCheck(bool isChecked)
        {
            Width = 18;
            Height = 18;
            RenderTransformOrigin = new Point(0.5, 0.5);
            RenderTransform = _scale;
            _boxFill = Ink.Brush(Ink.Night);
            _boxLine = Ink.Brush(Ink.Line);
            _box = new Border { CornerRadius = new CornerRadius(3), Background = _boxFill, BorderBrush = _boxLine, BorderThickness = new Thickness(1.5) };
            Children.Add(_box);
            _tick = new Path
            {
                Data = Geometry.Parse("M 4.5,9.5 L 7.5,12.5 L 13.5,5.5"),
                Stroke = Ink.Frozen(Ink.Night),
                StrokeThickness = 2.4,
                StrokeStartLineCap = PenLineCap.Square,
                StrokeEndLineCap = PenLineCap.Square,
                StrokeLineJoin = PenLineJoin.Miter,
                Opacity = 0
            };
            Children.Add(_tick);
            Set(isChecked, false);
        }

        public bool IsChecked { get { return _checked; } }

        public void Set(bool value, bool animate)
        {
            _checked = value;
            if (!animate)
            {
                _boxFill.Color = value ? Ink.Ice : Ink.Night;
                _boxLine.Color = value ? Ink.Ice : Ink.Line;
                _tick.Opacity = value ? 1 : 0;
                return;
            }
            Motion.Color(_boxFill, value ? Ink.Ice : Ink.Night, 160);
            Motion.Color(_boxLine, value ? Ink.Ice : Ink.Line, 160);
            Motion.To(_tick, OpacityProperty, value ? 1 : 0, 140, Motion.OutSoft);
            Motion.FromTo(_scale, ScaleTransform.ScaleXProperty, 0.78, 1, 320, Motion.Pop);
            Motion.FromTo(_scale, ScaleTransform.ScaleYProperty, 0.78, 1, 320, Motion.Pop);
        }
    }

    public sealed class InstallerWindow : Window
    {
        const double WinW = 560;
        const double WinH = 580;

        readonly InstallerPaths _paths;
        readonly Prefs _prefs;
        readonly BitmapSource _logo;

        readonly Grid _root;
        readonly Grid _stage;
        readonly Grid _overlay;
        readonly StackPanel _headerLeft;
        readonly TextBlock _langBadge;
        readonly Border _langPill;
        readonly ScaleTransform _windowScale = new ScaleTransform(1, 1);

        FrameworkElement _current;
        WizardScreen _screen = WizardScreen.IntroSplash;

        // Detection & workflow state
        DetectionResult _detection = new DetectionResult();
        readonly List<bool> _selectedInstalls = new List<bool>();
        readonly Dictionary<string, bool> _running = new Dictionary<string, bool>();
        DetectedClient _migrationClient;
        MigrationPlan _migrationPlan;
        string _migrationSummaryNotice;
        bool _migrationNoticeIsError;
        List<BackupSnapshot> _backups = new List<BackupSnapshot>();
        int _selectedBackupIdx;
        int _mainTab;
        bool _inspectExpanded;

        CancellationTokenSource _cts;
        bool _isRunningOp;
        bool _closeAfterOp;
        OperationOutcome _lastOutcome;
        bool _cleanupPrevClientChecked = true;
        int _opMode;

        // Live widgets on the installing screen
        TextBlock _progStatus;
        TextBlock _progPercent;
        PixelProgress _progBar;
        Streamlines _streams;
        double _shownProgress;

        readonly DispatcherTimer _runningPoll;

        public InstallerWindow() : this(false) { }

        InstallerWindow(bool previewMode)
        {
            _paths = InstallerPaths.FromEnvironment();
            _prefs = new Prefs(_paths);
            Loc.Initialize(_prefs.Language);
            _logo = LoadLogo();

            Title = "Endcord Installer";
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
            TextOptions.SetTextRenderingMode(this, TextRenderingMode.ClearType);

            _root = new Grid
            {
                Background = Ink.Frozen(Ink.Night),
                ClipToBounds = true,
                RenderTransformOrigin = new Point(0.5, 0.5),
                RenderTransform = new TransformGroup { Children = { _windowScale, _dragLag } }
            };
            LocationChanged += OnDragLocationChanged;
            _root.Clip = new RectangleGeometry(new Rect(0, 0, WinW, WinH), 14, 14);
            _root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(58) });
            _root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            // Faint pixel grid; gives the flat background some texture without moving.
            _root.Children.Add(MakePixelGrid());

            // Header: wordmark on the left, language + window controls on the right.
            var header = new Grid { Background = Brushes.Transparent };
            header.MouseLeftButtonDown += (s, e) => { if (e.ClickCount == 1) DragWithLift(); };
            Grid.SetRow(header, 0);
            _root.Children.Add(header);

            _headerLeft = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(22, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
            if (_logo != null)
            {
                var mark = new Image { Source = _logo, Width = 34, Height = 34, Margin = new Thickness(-6, 0, 2, 0) };
                RenderOptions.SetBitmapScalingMode(mark, BitmapScalingMode.HighQuality);
                var markHop = new TranslateTransform();
                mark.RenderTransform = markHop;
                mark.MouseEnter += (s, e) =>
                {
                    if (Motion.Disabled) return;
                    var hop = new DoubleAnimationUsingKeyFrames();
                    hop.KeyFrames.Add(new EasingDoubleKeyFrame(-4, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(180)), Motion.OutSoft));
                    hop.KeyFrames.Add(new EasingDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(560)), Motion.Out));
                    markHop.BeginAnimation(TranslateTransform.YProperty, hop);
                };
                _headerLeft.Children.Add(mark);
            }
            _headerLeft.Children.Add(new TextBlock
            {
                Text = "Endcord",
                FontFamily = Ink.Display,
                FontSize = 17,
                FontWeight = FontWeights.SemiBold,
                Foreground = Ink.Frozen(Ink.Paper),
                VerticalAlignment = VerticalAlignment.Center
            });
            header.Children.Add(_headerLeft);

            var controls = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 12, 0) };
            _langBadge = new TextBlock { FontFamily = Ink.Display, FontSize = 12.5, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(Ink.Mist), VerticalAlignment = VerticalAlignment.Center };
            _langPill = MakeChromeButton(_langBadge, 44, () => { if (!_isRunningOp) NavigateTo(WizardScreen.LanguageSelect, -1); }, false);
            _langPill.Margin = new Thickness(0, 0, 6, 0);
            controls.Children.Add(_langPill);
            controls.Children.Add(MakeChromeButton(new Path { Data = Geometry.Parse("M 0,0 L 10,0"), Stroke = Ink.Frozen(Ink.Mist), StrokeThickness = 1.6, Margin = new Thickness(0, 6, 0, 0) }, 34, AnimateMinimize, false));
            controls.Children.Add(MakeChromeButton(new Path { Data = Geometry.Parse("M 0,0 L 9,9 M 9,0 L 0,9"), Stroke = Ink.Frozen(Ink.Mist), StrokeThickness = 1.6 }, 34, RequestClose, true));
            header.Children.Add(controls);

            _stage = new Grid();
            Grid.SetRow(_stage, 1);
            _root.Children.Add(_stage);

            _overlay = new Grid { Visibility = Visibility.Collapsed };
            Grid.SetRowSpan(_overlay, 2);
            _root.Children.Add(_overlay);

            Content = _root;

            Loc.LanguageChanged += OnLanguageChanged;
            FileOps.RetryingLocked += subject => Dispatcher.BeginInvoke(new Action(() =>
            {
                if (_progStatus != null) _progStatus.Text = Loc.F("status.waitingLockedFile", System.IO.Path.GetFileName(subject));
            }));

            RefreshDetectionData();
            UpdateHeader();

            // Process state is polled every couple of seconds instead of on every frame.
            _runningPoll = new DispatcherTimer(DispatcherPriority.Background) { Interval = TimeSpan.FromSeconds(2.5) };
            _runningPoll.Tick += (s, e) => { if (_screen == WizardScreen.ClientTargets && !_isRunningOp && IsActive) PollRunning(true); };

            if (previewMode) return;

            _runningPoll.Start();
            Opacity = 0;
            Loaded += (s, e) =>
            {
                Motion.FromTo(this, OpacityProperty, 0, 1, 260, Motion.OutSoft);
                Motion.FromTo(_windowScale, ScaleTransform.ScaleXProperty, 0.965, 1, 420, Motion.Out);
                Motion.FromTo(_windowScale, ScaleTransform.ScaleYProperty, 0.965, 1, 420, Motion.Out);
                ShowScreen(WizardScreen.IntroSplash, 1, false);
            };
            StateChanged += (s, e) =>
            {
                if (WindowState == WindowState.Normal)
                {
                    Motion.FromTo(this, OpacityProperty, 0.4, 1, 200, Motion.OutSoft);
                    Motion.FromTo(_windowScale, ScaleTransform.ScaleXProperty, 0.97, 1, 300, Motion.Out);
                    Motion.FromTo(_windowScale, ScaleTransform.ScaleYProperty, 0.97, 1, 300, Motion.Out);
                }
            };
            Closing += OnClosing;
            Closed += (s, e) => { _runningPoll.Stop(); Loc.LanguageChanged -= OnLanguageChanged; };
        }

        // ═════════════════════════════ CHROME ═════════════════════════════

        Border MakeChromeButton(UIElement content, double width, Action onClick, bool danger)
        {
            var bg = Ink.Brush(Ink.WithAlpha(Ink.PanelHi, 0));
            var b = new Border
            {
                Width = width,
                Height = 30,
                CornerRadius = new CornerRadius(6),
                Background = bg,
                Cursor = Cursors.Hand,
                Child = content
            };
            var fe = content as FrameworkElement;
            if (fe != null) { fe.HorizontalAlignment = HorizontalAlignment.Center; fe.VerticalAlignment = VerticalAlignment.Center; }
            Color hover = danger ? Ink.Ember : Ink.PanelHi;
            b.MouseEnter += (s, e) => Motion.Color(bg, hover, 120);
            b.MouseLeave += (s, e) => Motion.Color(bg, Ink.WithAlpha(hover, 0), 200);
            var squish = new ScaleTransform(1, 1);
            b.RenderTransformOrigin = new Point(0.5, 0.5);
            b.RenderTransform = squish;
            b.MouseLeftButtonDown += (s, e) =>
            {
                e.Handled = true;
                Motion.To(squish, ScaleTransform.ScaleXProperty, 0.92, 100, Motion.OutSoft);
                Motion.To(squish, ScaleTransform.ScaleYProperty, 0.92, 100, Motion.OutSoft);
            };
            b.MouseLeftButtonUp += (s, e) =>
            {
                e.Handled = true;
                Motion.To(squish, ScaleTransform.ScaleXProperty, 1, 300, Motion.Pop);
                Motion.To(squish, ScaleTransform.ScaleYProperty, 1, 300, Motion.Pop);
                onClick();
            };
            return b;
        }

        void DragWithLift()
        {
            Motion.To(_windowScale, ScaleTransform.ScaleXProperty, 0.99, 220, Motion.OutSoft);
            Motion.To(_windowScale, ScaleTransform.ScaleYProperty, 0.99, 220, Motion.OutSoft);
            Motion.To(this, OpacityProperty, 0.95, 220, Motion.OutSoft);
            BeginDragMotion();
            // DragMove blocks until the mouse button is released.
            try { DragMove(); } catch { }
            _dragging = false;
            Motion.To(_windowScale, ScaleTransform.ScaleXProperty, 1, 480, Motion.Out);
            Motion.To(_windowScale, ScaleTransform.ScaleYProperty, 1, 480, Motion.Out);
            Motion.To(this, OpacityProperty, 1, 260, Motion.OutSoft);
        }

        // ---- Motion blur while the window is dragged ----
        // The blur radius and a small trailing offset follow how fast the window moves, and ease
        // back to a sharp, centred window as soon as it slows down or is let go.
        const double MaxBlur = 5.5;
        const double MaxLag = 7;
        readonly BlurEffect _motionBlur = new BlurEffect { Radius = 0, KernelType = KernelType.Gaussian, RenderingBias = RenderingBias.Performance };
        readonly TranslateTransform _dragLag = new TranslateTransform();
        readonly System.Diagnostics.Stopwatch _dragClock = new System.Diagnostics.Stopwatch();
        bool _dragging, _dragFrameHooked;
        double _lastLeft, _lastTop, _lastMoveMs, _velX, _velY;

        void BeginDragMotion()
        {
            if (Motion.Disabled) return;
            _dragging = true;
            _lastLeft = Left;
            _lastTop = Top;
            _velX = _velY = 0;
            _dragClock.Restart();
            _lastMoveMs = 0;
            _root.Effect = _motionBlur;
            if (!_dragFrameHooked)
            {
                _dragFrameHooked = true;
                CompositionTarget.Rendering += OnDragFrame;
            }
        }

        void OnDragLocationChanged(object sender, EventArgs e)
        {
            if (!_dragging) return;
            double now = _dragClock.Elapsed.TotalMilliseconds;
            double dt = Math.Max(now - _lastMoveMs, 1);
            // px per ms, smoothed so a single jittery event does not flash the blur
            _velX = _velX * 0.55 + (Left - _lastLeft) / dt * 0.45;
            _velY = _velY * 0.55 + (Top - _lastTop) / dt * 0.45;
            _lastLeft = Left;
            _lastTop = Top;
            _lastMoveMs = now;
        }

        void OnDragFrame(object sender, EventArgs e)
        {
            // Holding still mid-drag or releasing: let the speed fall away
            if (!_dragging || _dragClock.Elapsed.TotalMilliseconds - _lastMoveMs > 45)
            {
                _velX *= 0.78;
                _velY *= 0.78;
            }

            double speed = Math.Sqrt(_velX * _velX + _velY * _velY);
            _motionBlur.Radius = Math.Min(MaxBlur, speed * 1.5);
            _dragLag.X = Math.Max(-MaxLag, Math.Min(MaxLag, -_velX * 2.4));
            _dragLag.Y = Math.Max(-MaxLag, Math.Min(MaxLag, -_velY * 2.4));

            if (!_dragging && speed < 0.02)
            {
                _motionBlur.Radius = 0;
                _dragLag.X = _dragLag.Y = 0;
                _root.Effect = null; // keeps text ClearType-sharp when idle
                CompositionTarget.Rendering -= OnDragFrame;
                _dragFrameHooked = false;
            }
        }

        void UpdateHeader()
        {
            _langBadge.Text = Loc.CurrentOption.ShortBadge;
            Motion.To(_headerLeft, OpacityProperty, _screen == WizardScreen.IntroSplash ? 0 : 1, 360, Motion.OutSoft);
            bool showLang = _screen != WizardScreen.IntroSplash && _screen != WizardScreen.LanguageSelect && !_isRunningOp;
            Motion.To(_langPill, OpacityProperty, showLang ? 1 : 0, 200, Motion.OutSoft);
            _langPill.IsHitTestVisible = showLang;
        }

        void AnimateMinimize()
        {
            if (Motion.Disabled) { WindowState = WindowState.Minimized; return; }
            var a = new DoubleAnimation(0, TimeSpan.FromMilliseconds(170)) { EasingFunction = Motion.InOut };
            a.Completed += (s, e) =>
            {
                WindowState = WindowState.Minimized;
                BeginAnimation(OpacityProperty, null);
                Opacity = 1;
            };
            Motion.To(_windowScale, ScaleTransform.ScaleXProperty, 0.94, 170, Motion.InOut);
            Motion.To(_windowScale, ScaleTransform.ScaleYProperty, 0.94, 170, Motion.InOut);
            BeginAnimation(OpacityProperty, a);
        }

        void RequestClose()
        {
            // Never walk away from a half-patched Discord: cancel, let the engine roll back, then close.
            if (_isRunningOp)
            {
                _closeAfterOp = true;
                if (_cts != null) { try { _cts.Cancel(); } catch { } }
                if (_progStatus != null) _progStatus.Text = Loc.T("status.rollingBack");
                return;
            }
            Close();
        }

        bool _closingAnimated;
        void OnClosing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            if (_isRunningOp)
            {
                e.Cancel = true;
                RequestClose();
                return;
            }
            if (_closingAnimated || Motion.Disabled) return;
            e.Cancel = true;
            _closingAnimated = true;
            var a = new DoubleAnimation(0, TimeSpan.FromMilliseconds(160)) { EasingFunction = Motion.InOut };
            a.Completed += (s, ev) => Close();
            Motion.To(_windowScale, ScaleTransform.ScaleXProperty, 0.96, 160, Motion.InOut);
            Motion.To(_windowScale, ScaleTransform.ScaleYProperty, 0.96, 160, Motion.InOut);
            BeginAnimation(OpacityProperty, a);
        }

        void OnLanguageChanged()
        {
            UpdateHeader();
            if (_screen != WizardScreen.Installing) ShowScreen(_screen, 0, true);
        }

        // ═════════════════════════════ NAVIGATION ═════════════════════════════

        void NavigateTo(WizardScreen target, int direction)
        {
            if (_screen == target) return;
            ShowScreen(target, direction, false);
        }

        void ShowScreen(WizardScreen target, int direction, bool inPlace)
        {
            _screen = target;
            UpdateHeader();

            var next = BuildScreen(target);
            var old = _current;
            _current = next;

            if (old != null)
            {
                old.IsHitTestVisible = false;
                if (inPlace || Motion.Disabled)
                {
                    _stage.Children.Remove(old);
                }
                else
                {
                    var tt = new TranslateTransform();
                    old.RenderTransform = tt;
                    Motion.To(tt, TranslateTransform.XProperty, -direction * 36, 220, Motion.InOut);
                    var fade = new DoubleAnimation(0, TimeSpan.FromMilliseconds(180)) { EasingFunction = Motion.InOut };
                    fade.Completed += (s, e) => _stage.Children.Remove(old);
                    old.BeginAnimation(OpacityProperty, fade);
                }
            }

            _stage.Children.Add(next);
            if (Motion.Disabled) return;
            if (inPlace)
            {
                Motion.FromTo(next, OpacityProperty, 0.55, 1, 220, Motion.OutSoft);
                return;
            }

            var nt = new TranslateTransform(direction * 44, 0);
            next.RenderTransform = nt;
            next.Opacity = 0;
            Motion.To(nt, TranslateTransform.XProperty, 0, 580, Motion.Out, 90);
            Motion.To(next, OpacityProperty, 1, 340, Motion.OutSoft, 90);
        }

        FrameworkElement BuildScreen(WizardScreen scr)
        {
            switch (scr)
            {
                case WizardScreen.IntroSplash: return BuildSplash();
                case WizardScreen.LanguageSelect: return BuildLanguage();
                case WizardScreen.MigrationPrompt: return _migrationClient != null ? BuildMigration() : BuildTargets();
                case WizardScreen.ClientTargets: return BuildTargets();
                case WizardScreen.Installing: return BuildInstalling();
                default: return BuildCompleted();
            }
        }

        // ═════════════════════════════ SCREENS ═════════════════════════════

        // The logo resolves from a handful of big pixels into the full picture.
        FrameworkElement BuildSplash()
        {
            var g = new Grid { Margin = new Thickness(0, -58, 0, 0) };
            Grid.SetRowSpan(g, 2);

            var stack = new StackPanel { VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center };
            var logoHost = new Grid { Width = 300, Height = 300 };
            var img = new Image { Width = 300, Height = 300, Source = _logo };
            RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.NearestNeighbor);
            logoHost.Children.Add(img);
            stack.Children.Add(logoHost);

            var title = new TextBlock
            {
                Text = Loc.T("app.subtitle"),
                FontFamily = Ink.Body,
                FontSize = 13.5,
                Foreground = Ink.Frozen(Ink.Mist),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, -48, 0, 0),
                Opacity = 0
            };
            stack.Children.Add(title);
            g.Children.Add(stack);

            if (Motion.Disabled || _logo == null)
            {
                title.Opacity = 1;
                return g;
            }

            int[] steps = { 10, 16, 26, 42, 70, 120 };
            int i = 0;
            img.Source = Pixelate(_logo, steps[0]);
            img.Opacity = 0;
            Motion.To(img, OpacityProperty, 1, 160, Motion.OutSoft);
            var timer = new DispatcherTimer(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(85) };
            timer.Tick += (s, e) =>
            {
                i++;
                if (i < steps.Length)
                {
                    img.Source = Pixelate(_logo, steps[i]);
                    return;
                }
                timer.Stop();
                img.Source = _logo;
                RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.HighQuality);
                Motion.To(title, OpacityProperty, 1, 400, Motion.OutSoft);
                var tt = new TranslateTransform(0, 8);
                title.RenderTransform = tt;
                Motion.To(tt, TranslateTransform.YProperty, 0, 500, Motion.Out);

                var hold = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(900) };
                hold.Tick += (s2, e2) =>
                {
                    hold.Stop();
                    if (_screen == WizardScreen.IntroSplash)
                        NavigateTo(string.IsNullOrEmpty(_prefs.Language) ? WizardScreen.LanguageSelect : NextAfterLanguage(), 1);
                };
                hold.Start();
            };
            timer.Start();
            return g;
        }

        FrameworkElement BuildLanguage()
        {
            var g = ScreenGrid();
            var head = Heading(Loc.T("lang.welcome"), Loc.T("lang.choosePrompt"));
            g.Children.Add(head);

            var list = new StackPanel { Margin = new Thickness(0, 22, 0, 0) };
            Grid.SetRow(list, 1);
            foreach (var lang in Loc.SupportedLanguages)
            {
                var code = lang.Code;
                bool selected = Loc.CurrentLanguage == code;
                var row = SelectRow(lang.NativeName, lang.Subtitle, selected, null, () =>
                {
                    Loc.SetLanguage(code);
                    _prefs.Language = code;
                    _prefs.Save();
                });
                list.Children.Add(row);
            }
            g.Children.Add(list);

            var cta = new PixelButton(Loc.T("lang.btn.continue"), Ink.Cobalt, Ink.CobaltHi, Ink.Paper, 48);
            cta.Click += () =>
            {
                _prefs.Language = Loc.CurrentLanguage;
                _prefs.Save();
                RefreshDetectionData();
                NavigateTo(NextAfterLanguage(), 1);
            };
            g.Children.Add(Footer(cta));
            return g;
        }

        WizardScreen NextAfterLanguage()
        {
            return _migrationClient != null ? WizardScreen.MigrationPrompt : WizardScreen.ClientTargets;
        }

        FrameworkElement BuildMigration()
        {
            string clientName = _migrationClient.Mod.DisplayName;
            var g = ScreenGrid();
            g.Children.Add(Heading(Loc.T("mig.welcomeTitle"), Loc.F("mig.banner.prompt", clientName)));

            var body = new StackPanel { Margin = new Thickness(0, 20, 0, 0) };
            Grid.SetRow(body, 1);

            var sources = GetMigrationSources();
            if (sources.Count > 1)
            {
                var pills = new WrapPanel { Margin = new Thickness(0, 0, 0, 14) };
                foreach (var src in sources)
                {
                    var captured = src;
                    bool active = src == _migrationClient;
                    var pill = Pill(src.Mod.DisplayName, active, () =>
                    {
                        _migrationClient = captured;
                        _migrationPlan = MigrationEngine.Analyze(captured);
                        ShowScreen(WizardScreen.MigrationPrompt, 0, true);
                    });
                    pills.Children.Add(pill);
                }
                body.Children.Add(pills);
            }

            int plugins = _migrationPlan != null ? _migrationPlan.CompatiblePluginCount : 0;
            int themes = _migrationPlan != null ? _migrationPlan.ThemeCount : 0;
            int compTotal = _migrationPlan != null ? _migrationPlan.CompatibleItems.Count : 0;
            int skipTotal = _migrationPlan != null ? _migrationPlan.IncompatibleItems.Count : 0;

            var panel = new Border
            {
                Background = Ink.Frozen(Ink.Panel),
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(20, 18, 20, 14)
            };
            var inner = new StackPanel();
            panel.Child = inner;

            // Two big counters: what actually comes along.
            var stats = Loc.F("mig.card.stats", plugins, themes);
            inner.Children.Add(new TextBlock { Text = Loc.T("mig.card.title"), FontFamily = Ink.Display, FontSize = 16, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(Ink.Paper), Margin = new Thickness(0, 0, 0, 4) });
            inner.Children.Add(new TextBlock { Text = stats, FontFamily = Ink.Body, FontSize = 12.5, Foreground = Ink.Frozen(Ink.Mist), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 14) });

            var detail = new StackPanel();
            var detailScroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Hidden, MaxHeight = 112, Content = detail, Visibility = _inspectExpanded ? Visibility.Visible : Visibility.Collapsed, Margin = new Thickness(0, 4, 0, 6) };
            if (_migrationPlan != null)
            {
                var all = new List<MigrationPreviewItem>(_migrationPlan.CompatibleItems);
                all.AddRange(_migrationPlan.IncompatibleItems);
                foreach (var item in all)
                {
                    var row = new DockPanel { Margin = new Thickness(0, 2, 0, 2) };
                    var dot = new Rectangle { Width = 6, Height = 6, Fill = Ink.Frozen(item.Compatible ? Ink.Bamboo : Ink.Honey), Margin = new Thickness(0, 0, 10, 0), VerticalAlignment = VerticalAlignment.Center };
                    row.Children.Add(dot);
                    row.Children.Add(new TextBlock
                    {
                        Text = item.DisplayName + "  " + Loc.T(item.ReasonKey),
                        FontFamily = Ink.Body,
                        FontSize = 12,
                        Foreground = Ink.Frozen(item.Compatible ? Ink.Paper : Ink.Mist),
                        TextTrimming = TextTrimming.CharacterEllipsis
                    });
                    detail.Children.Add(row);
                }
            }
            inner.Children.Add(detailScroll);

            var toggle = LinkText(_inspectExpanded ? Loc.T("mig.card.hideInspect") : Loc.F("mig.card.inspectLink", compTotal, skipTotal), () =>
            {
                _inspectExpanded = !_inspectExpanded;
                ShowScreen(WizardScreen.MigrationPrompt, 0, true);
            });
            inner.Children.Add(toggle);
            body.Children.Add(panel);
            g.Children.Add(body);

            var import = new PixelButton(Loc.T("mig.btn.importSettings"), Ink.Cobalt, Ink.CobaltHi, Ink.Paper, 48);
            var fresh = new PixelButton(Loc.T("mig.btn.startFresh"), Ink.Panel, Ink.PanelHi, Ink.Paper, 48);
            var plan = _migrationPlan;
            var client = _migrationClient;
            import.Click += () =>
            {
                import.Enabled = false;
                fresh.Enabled = false;
                // Off the UI thread so the window keeps animating while settings are copied.
                RunInBackground(() => MigrationEngine.Execute(_paths, plan, CancellationToken.None), res =>
                {
                    _prefs.MarkMigrated(client.Mod.Id);
                    _prefs.Save();
                    _migrationSummaryNotice = Loc.F("done.banner.migrated", res.MigratedPlugins, res.MigratedCoreSettings, res.MigratedThemes, clientName);
                    _migrationNoticeIsError = false;
                    RefreshDetectionData();
                    NavigateTo(WizardScreen.ClientTargets, 1);
                }, ex =>
                {
                    _migrationSummaryNotice = ex.Message;
                    _migrationNoticeIsError = true;
                    NavigateTo(WizardScreen.ClientTargets, 1);
                });
            };
            fresh.Click += () =>
            {
                import.Enabled = false;
                fresh.Enabled = false;
                RunInBackground(() => MigrationEngine.StartFresh(_paths, CancellationToken.None), _ =>
                {
                    _prefs.MarkMigrated(client.Mod.Id);
                    _prefs.Save();
                    RefreshDetectionData();
                    NavigateTo(WizardScreen.ClientTargets, 1);
                }, ex =>
                {
                    _prefs.MarkMigrated(client.Mod.Id);
                    _prefs.Save();
                    RefreshDetectionData();
                    NavigateTo(WizardScreen.ClientTargets, 1);
                });
            };
            g.Children.Add(Footer(fresh, import));
            return g;
        }

        FrameworkElement BuildTargets()
        {
            PollRunning(false);
            var g = ScreenGrid();
            string sub = Loc.T("main.subtitle");
            var head = Heading(Loc.T("main.title"), sub);
            g.Children.Add(head);

            var body = new Grid { Margin = new Thickness(0, 18, 0, 0) };
            body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            body.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            Grid.SetRow(body, 1);
            g.Children.Add(body);

            if (!string.IsNullOrEmpty(_migrationSummaryNotice))
            {
                var notice = new TextBlock
                {
                    Text = _migrationSummaryNotice,
                    FontFamily = Ink.Body,
                    FontSize = 12,
                    Foreground = Ink.Frozen(_migrationNoticeIsError ? Ink.Ember : Ink.Bamboo),
                    TextWrapping = TextWrapping.Wrap,
                    Margin = new Thickness(0, 0, 0, 12)
                };
                body.Children.Add(notice);
            }

            var tabs = new TabStrip(new[] { Loc.T("tab.install"), Loc.T("tab.repair"), Loc.T("tab.uninstall"), Loc.T("tab.backups") }, _mainTab);
            Grid.SetRow(tabs, 1);
            body.Children.Add(tabs);

            var content = new Grid { Margin = new Thickness(0, 14, 0, 0) };
            Grid.SetRow(content, 2);
            body.Children.Add(content);

            PixelButton cta = null;
            Action fill = null;
            fill = () =>
            {
                content.Children.Clear();
                var view = _mainTab == 3 ? BuildBackupsView() : BuildInstallList(() => UpdateCta(cta));
                content.Children.Add(view);
                if (!Motion.Disabled)
                {
                    var tt = new TranslateTransform(0, 6);
                    view.RenderTransform = tt;
                    view.Opacity = 0;
                    Motion.To(view, OpacityProperty, 1, 220, Motion.OutSoft);
                    Motion.To(tt, TranslateTransform.YProperty, 0, 320, Motion.Out);
                }
            };

            if (_mainTab == 3)
            {
                g.Children.Add(BuildBackupFooter());
            }
            else
            {
                cta = new PixelButton("", Ink.Cobalt, Ink.CobaltHi, Ink.Paper, 48);
                cta.Click += StartSelectedOperation;
                UpdateCta(cta);
                g.Children.Add(Footer(cta));

                var opts = new DockPanel { Margin = new Thickness(0, 10, 0, 0), LastChildFill = false };
                Grid.SetRow(opts, 3);
                var relaunch = CheckRow(Loc.T("chk.relaunch"), _prefs.Relaunch, v => { _prefs.Relaunch = v; _prefs.Save(); });
                DockPanel.SetDock(relaunch, Dock.Left);
                opts.Children.Add(relaunch);
                var refresh = LinkText(Loc.T("btn.refresh"), () => { RefreshDetectionData(); fill(); UpdateCta(cta); });
                DockPanel.SetDock(refresh, Dock.Right);
                opts.Children.Add(refresh);
                var add = LinkText(Loc.T("btn.addCustomPath"), () => { BrowseCustomDiscordPath(); fill(); UpdateCta(cta); });
                add.Margin = new Thickness(0, 0, 18, 0);
                DockPanel.SetDock(add, Dock.Right);
                opts.Children.Add(add);
                body.Children.Add(opts);
            }

            tabs.Changed += idx =>
            {
                bool backupsChanged = (idx == 3) != (_mainTab == 3);
                _mainTab = idx;
                if (backupsChanged) { ShowScreen(WizardScreen.ClientTargets, 0, true); return; }
                UpdateCta(cta);
            };

            fill();
            return g;
        }

        FrameworkElement BuildInstallList(Action onSelectionChanged)
        {
            if (_detection.Installs.Count == 0)
            {
                var empty = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 0, 30) };
                empty.Children.Add(new TextBlock { Text = Loc.T("empty.noDiscord.title"), FontFamily = Ink.Display, FontSize = 18, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(Ink.Honey) });
                empty.Children.Add(new TextBlock { Text = Loc.T("empty.noDiscord.desc"), FontFamily = Ink.Body, FontSize = 13, Foreground = Ink.Frozen(Ink.Mist), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) });
                return empty;
            }

            var list = new StackPanel();
            for (int i = 0; i < _detection.Installs.Count; i++)
            {
                int idx = i;
                var inst = _detection.Installs[i];
                bool sel = idx < _selectedInstalls.Count && _selectedInstalls[idx];
                bool running;
                _running.TryGetValue(inst.Id ?? inst.DisplayName, out running);

                string statusText;
                Color statusColor;
                GetInstallStatus(inst, out statusText, out statusColor);

                string meta = "app-" + inst.VersionText + "   " + (running ? Loc.T("card.running") : Loc.T("card.closed"));
                var row = SelectRow(inst.DisplayName, meta, sel, StatusTag(statusText, statusColor), () =>
                {
                    if (idx < _selectedInstalls.Count) _selectedInstalls[idx] = !_selectedInstalls[idx];
                    onSelectionChanged();
                }, true);
                list.Children.Add(row);
            }
            return new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Hidden, Content = list, Focusable = false };
        }

        FrameworkElement BuildBackupsView()
        {
            if (_backups.Count == 0)
            {
                return new TextBlock { Text = Loc.T("backup.empty"), FontFamily = Ink.Body, FontSize = 13, Foreground = Ink.Frozen(Ink.Mist), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 0) };
            }
            var list = new StackPanel();
            for (int i = 0; i < _backups.Count; i++)
            {
                int idx = i;
                var b = _backups[i];
                var row = SelectRow(b.CreatedAt.ToString("yyyy-MM-dd  HH:mm"), b.SourceModName + "  " + b.Reason, idx == _selectedBackupIdx, null, () =>
                {
                    _selectedBackupIdx = idx;
                    ShowScreen(WizardScreen.ClientTargets, 0, true);
                });
                list.Children.Add(row);
            }
            return new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Hidden, Content = list, Focusable = false };
        }

        FrameworkElement BuildBackupFooter()
        {
            var create = new PixelButton(Loc.T("backup.createBtn"), Ink.Panel, Ink.PanelHi, Ink.Paper, 48);
            var restore = new PixelButton(Loc.T("backup.restoreBtn"), Ink.Cobalt, Ink.CobaltHi, Ink.Paper, 48);
            restore.Enabled = _backups.Count > 0;
            create.Click += () =>
            {
                create.Enabled = false;
                restore.Enabled = false;
                RunInBackground(() => MigrationEngine.CreateBackup(_paths, "Endcord", "manual", CancellationToken.None), _ =>
                {
                    _backups = MigrationEngine.ListBackups(_paths);
                    _selectedBackupIdx = 0;
                    ShowScreen(WizardScreen.ClientTargets, 0, true);
                }, ex => { _migrationSummaryNotice = ex.Message; _migrationNoticeIsError = true; ShowScreen(WizardScreen.ClientTargets, 0, true); });
            };
            restore.Click += () =>
            {
                if (_selectedBackupIdx < 0 || _selectedBackupIdx >= _backups.Count) return;
                var snap = _backups[_selectedBackupIdx];
                create.Enabled = false;
                restore.Enabled = false;
                RunInBackground(() => { MigrationEngine.RestoreBackup(_paths, snap, CancellationToken.None); return true; }, _ =>
                {
                    create.Enabled = true;
                    restore.Enabled = true;
                    Burst(restore, Ink.Bamboo);
                }, ex => { _migrationSummaryNotice = ex.Message; _migrationNoticeIsError = true; ShowScreen(WizardScreen.ClientTargets, 0, true); });
            };
            return Footer(create, restore);
        }

        void UpdateCta(PixelButton cta)
        {
            if (cta == null) return;
            var targets = GetSelectedTargets();
            bool allEndcord = targets.Count > 0;
            foreach (var t in targets) if (!t.HasEndcord) allEndcord = false;
            string key = _mainTab == 2 ? "action.uninstall" : (_mainTab == 1 ? "action.repair" : (allEndcord ? "action.update" : "action.install"));
            cta.Text = Loc.T(key);
            if (_mainTab == 2) cta.SetColors(Ink.Ember, Color.FromRgb(0xF5, 0x8D, 0x83), Ink.Night);
            else cta.SetColors(Ink.Cobalt, Ink.CobaltHi, Ink.Paper);
            cta.Enabled = targets.Count > 0;
        }

        // The one big moment: speed lines stream into the logo, pixel blocks fill in, the panda keeps sleeping.
        FrameworkElement BuildInstalling()
        {
            var g = new Grid();
            g.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            g.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            g.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            var stageArea = new Grid { Margin = new Thickness(0, -10, 0, 0) };
            _streams = new Streamlines(WinW, 220);
            _streams.VerticalAlignment = VerticalAlignment.Center;
            stageArea.Children.Add(_streams);
            if (_logo != null)
            {
                var img = new Image { Source = _logo, Width = 260, Height = 260, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center };
                RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.HighQuality);
                stageArea.Children.Add(img);
                if (!Motion.Disabled)
                {
                    // Slow breathing, as if the panda is asleep on the letters.
                    var st = new ScaleTransform(1, 1);
                    img.RenderTransformOrigin = new Point(0.5, 0.55);
                    img.RenderTransform = st;
                    var breathe = new DoubleAnimation(1, 1.018, TimeSpan.FromMilliseconds(1700)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = Motion.InOut };
                    st.BeginAnimation(ScaleTransform.ScaleYProperty, breathe);
                }
            }
            stageArea.Children.Add(new Snore());
            g.Children.Add(stageArea);

            var info = new StackPanel { Margin = new Thickness(36, 0, 36, 0) };
            Grid.SetRow(info, 1);
            var titleRow = new DockPanel();
            _progPercent = new TextBlock { FontFamily = Ink.Display, FontSize = 30, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(Ink.Ice), Text = "0%" };
            DockPanel.SetDock(_progPercent, Dock.Right);
            titleRow.Children.Add(_progPercent);
            string titleKey = _opMode == 2 ? "prog.uninstallingTitle" : (_opMode == 1 ? "prog.repairingTitle" : (AllSelectedHaveEndcord() ? "prog.updatingTitle" : "prog.installingTitle"));
            titleRow.Children.Add(new TextBlock { Text = Loc.T(titleKey), FontFamily = Ink.Display, FontSize = 24, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(Ink.Paper), VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 0, 3), TextTrimming = TextTrimming.CharacterEllipsis });
            info.Children.Add(titleRow);
            _progStatus = new TextBlock { Text = Loc.T("status.preparingInstall"), FontFamily = Ink.Body, FontSize = 13, Foreground = Ink.Frozen(Ink.Mist), TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(0, 2, 0, 14) };
            info.Children.Add(_progStatus);
            _progBar = new PixelProgress(WinW - 72, 30);
            info.Children.Add(_progBar);
            g.Children.Add(info);

            var cancel = new PixelButton(Loc.T("action.cancel"), Ink.Panel, Ink.PanelHi, Ink.Mist, 40) { Width = 150, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 22, 0, 26) };
            cancel.Click += () =>
            {
                if (_cts != null) { try { _cts.Cancel(); } catch { } }
                cancel.Enabled = false;
                _progStatus.Text = Loc.T("status.rollingBack");
            };
            Grid.SetRow(cancel, 2);
            g.Children.Add(cancel);
            _shownProgress = 0;
            return g;
        }

        FrameworkElement BuildCompleted()
        {
            bool ok = _lastOutcome != null && _lastOutcome.Success;
            string title, body;
            GetOutcomeStrings(_lastOutcome, out title, out body);

            var g = new Grid();
            g.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            g.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            g.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            // Same stage as the progress screen, so the logo stays put and the panda gets to react.
            var stageArea = new Grid { Margin = new Thickness(0, -10, 0, 0) };
            FrameworkElement hero;
            if (ok && _logo != null)
            {
                var img = new Image { Source = _logo, Width = 260, Height = 260, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center };
                RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.HighQuality);
                hero = img;
            }
            else
            {
                Color tone = (_lastOutcome != null && _lastOutcome.Cancelled) ? Ink.Honey : Ink.Ember;
                var tile = new Grid { Width = 72, Height = 72, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
                tile.Children.Add(new Path { Data = PixelButton.SteppedRect(72, 72, 4), Fill = Ink.Frozen(Ink.WithAlpha(tone, 52)) });
                tile.Children.Add(new TextBlock { Text = "!", FontFamily = Ink.Display, FontSize = 36, FontWeight = FontWeights.Bold, Foreground = Ink.Frozen(tone), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 0, 3) });
                hero = tile;
            }
            stageArea.Children.Add(hero);
            g.Children.Add(stageArea);

            var info = new StackPanel { Margin = new Thickness(36, 0, 36, 0) };
            Grid.SetRow(info, 1);
            info.Children.Add(new TextBlock { Text = title, FontFamily = Ink.Display, FontSize = 28, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(Ink.Paper), TextWrapping = TextWrapping.Wrap });
            if (!string.IsNullOrEmpty(body))
                info.Children.Add(new TextBlock { Text = body, FontFamily = Ink.Body, FontSize = 13.5, Foreground = Ink.Frozen(Ink.Mist), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 0), MaxHeight = 90, TextTrimming = TextTrimming.CharacterEllipsis });

            DetectedClient cleanup = GetCleanupCandidateClient();
            if (ok && cleanup != null)
            {
                var row = CheckRow(Loc.F("done.cleanupOffer", cleanup.Mod.DisplayName), _cleanupPrevClientChecked, v => _cleanupPrevClientChecked = v);
                row.Margin = new Thickness(0, 14, 0, 0);
                info.Children.Add(row);
            }
            g.Children.Add(info);

            var home = new PixelButton(Loc.T("done.btn.finish"), Ink.Panel, Ink.PanelHi, Ink.Paper, 48);
            var close = new PixelButton(Loc.T("done.btn.closeApp"), ok ? Ink.Cobalt : Ink.Panel, ok ? Ink.CobaltHi : Ink.PanelHi, Ink.Paper, 48);
            home.Click += () =>
            {
                home.Enabled = false;
                close.Enabled = false;
                RunInBackground(() => { ApplyConfirmedCleanupIfChecked(cleanup); return true; }, _ =>
                {
                    RefreshDetectionData();
                    NavigateTo(WizardScreen.ClientTargets, -1);
                }, ex => { RefreshDetectionData(); NavigateTo(WizardScreen.ClientTargets, -1); });
            };
            close.Click += () =>
            {
                home.Enabled = false;
                close.Enabled = false;
                RunInBackground(() => { ApplyConfirmedCleanupIfChecked(cleanup); return true; }, _ => Close(), ex => Close());
            };
            var footer = TwoColumns(home, close);
            footer.Margin = new Thickness(36, 22, 36, 26);
            Grid.SetRow(footer, 2);
            g.Children.Add(footer);

            if (Motion.Disabled) return g;

            if (ok)
            {
                // The panda hops: a quick squash, up, a soft landing, then pixels fly.
                var tt = new TranslateTransform();
                var st = new ScaleTransform(1, 1);
                var grp = new TransformGroup();
                grp.Children.Add(st);
                grp.Children.Add(tt);
                hero.RenderTransformOrigin = new Point(0.5, 0.8);
                hero.RenderTransform = grp;
                var hop = new DoubleAnimationUsingKeyFrames { BeginTime = TimeSpan.FromMilliseconds(260) };
                hop.KeyFrames.Add(new EasingDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(0))));
                hop.KeyFrames.Add(new EasingDoubleKeyFrame(-26, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(260)), Motion.OutSoft));
                hop.KeyFrames.Add(new EasingDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(560)), new QuadraticEase { EasingMode = EasingMode.EaseIn }));
                var squashY = new DoubleAnimationUsingKeyFrames { BeginTime = TimeSpan.FromMilliseconds(120) };
                squashY.KeyFrames.Add(new EasingDoubleKeyFrame(0.92, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(140)), Motion.OutSoft));
                squashY.KeyFrames.Add(new EasingDoubleKeyFrame(1.04, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(320)), Motion.OutSoft));
                squashY.KeyFrames.Add(new EasingDoubleKeyFrame(0.95, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(700)), Motion.OutSoft));
                squashY.KeyFrames.Add(new EasingDoubleKeyFrame(1, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(980)), Motion.Pop));
                var squashX = new DoubleAnimationUsingKeyFrames { BeginTime = TimeSpan.FromMilliseconds(120) };
                squashX.KeyFrames.Add(new EasingDoubleKeyFrame(1.05, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(140)), Motion.OutSoft));
                squashX.KeyFrames.Add(new EasingDoubleKeyFrame(0.98, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(320)), Motion.OutSoft));
                squashX.KeyFrames.Add(new EasingDoubleKeyFrame(1.04, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(700)), Motion.OutSoft));
                squashX.KeyFrames.Add(new EasingDoubleKeyFrame(1, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(980)), Motion.Pop));
                tt.BeginAnimation(TranslateTransform.YProperty, hop);
                st.BeginAnimation(ScaleTransform.ScaleYProperty, squashY);
                st.BeginAnimation(ScaleTransform.ScaleXProperty, squashX);
                var burstAt = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(520) };
                burstAt.Tick += (s, e) => { burstAt.Stop(); Burst(hero, Ink.Ice); };
                burstAt.Start();
            }
            else
            {
                // A short shake says this did not work, without more words.
                var tt = new TranslateTransform();
                hero.RenderTransform = tt;
                var shake = new DoubleAnimationUsingKeyFrames { BeginTime = TimeSpan.FromMilliseconds(200) };
                double[] xs = { -8, 7, -5, 3, 0 };
                for (int i = 0; i < xs.Length; i++)
                    shake.KeyFrames.Add(new EasingDoubleKeyFrame(xs[i], KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(70 * (i + 1))), Motion.OutSoft));
                tt.BeginAnimation(TranslateTransform.XProperty, shake);
            }

            // Text arrives after the logo has had its moment.
            var it = new TranslateTransform(0, 10);
            info.RenderTransform = it;
            info.Opacity = 0;
            Motion.To(info, OpacityProperty, 1, 360, Motion.OutSoft, ok ? 420 : 120);
            Motion.To(it, TranslateTransform.YProperty, 0, 520, Motion.Out, ok ? 420 : 120);
            return g;
        }

        // ═════════════════════════════ CONFLICT DIALOG ═════════════════════════════

        void ShowConflictDialog(string mods, string targets)
        {
            _overlay.Children.Clear();
            var dim = new Border { Background = Ink.Frozen(Color.FromArgb(200, 0x0A, 0x10, 0x1C)) };
            _overlay.Children.Add(dim);

            var card = new Border
            {
                Background = Ink.Frozen(Ink.Panel),
                CornerRadius = new CornerRadius(12),
                BorderBrush = Ink.Frozen(Ink.WithAlpha(Ink.Honey, 120)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(24, 22, 24, 20),
                Margin = new Thickness(36, 0, 36, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            var sp = new StackPanel();
            sp.Children.Add(new TextBlock { Text = Loc.F("conflict.title", mods), FontFamily = Ink.Display, FontSize = 19, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(Ink.Paper), TextWrapping = TextWrapping.Wrap });
            sp.Children.Add(new TextBlock { Text = Loc.F("conflict.message", mods, targets), FontFamily = Ink.Body, FontSize = 13, Foreground = Ink.Frozen(Ink.Mist), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 20) });
            var cancel = new PixelButton(Loc.T("conflict.btn.cancel"), Ink.PanelHi, Ink.Line, Ink.Paper, 44);
            var confirm = new PixelButton(Loc.T("conflict.btn.confirm"), Ink.Cobalt, Ink.CobaltHi, Ink.Paper, 44);
            var row = TwoColumns(cancel, confirm);
            sp.Children.Add(row);
            card.Child = sp;
            _overlay.Children.Add(card);

            Action hide = () =>
            {
                var a = new DoubleAnimation(0, TimeSpan.FromMilliseconds(160));
                a.Completed += (s, e) => { _overlay.Visibility = Visibility.Collapsed; _overlay.Children.Clear(); };
                _overlay.BeginAnimation(OpacityProperty, a);
            };
            cancel.Click += hide;
            confirm.Click += () => { hide(); ExecuteOperationCore(); };

            _overlay.Visibility = Visibility.Visible;
            _overlay.Opacity = 0;
            Motion.To(_overlay, OpacityProperty, 1, 180, Motion.OutSoft);
            var st = new ScaleTransform(0.94, 0.94);
            card.RenderTransformOrigin = new Point(0.5, 0.5);
            card.RenderTransform = st;
            Motion.To(st, ScaleTransform.ScaleXProperty, 1, 420, Motion.Pop);
            Motion.To(st, ScaleTransform.ScaleYProperty, 1, 420, Motion.Pop);
        }

        // ═════════════════════════════ BUILDING BLOCKS ═════════════════════════════

        static Grid ScreenGrid()
        {
            var g = new Grid { Margin = new Thickness(36, 6, 36, 0) };
            g.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            g.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            g.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            return g;
        }

        static FrameworkElement Heading(string title, string sub)
        {
            var sp = new StackPanel();
            sp.Children.Add(new TextBlock { Text = title, FontFamily = Ink.Display, FontSize = 27, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(Ink.Paper), TextWrapping = TextWrapping.Wrap });
            if (!string.IsNullOrEmpty(sub))
                sp.Children.Add(new TextBlock { Text = sub, FontFamily = Ink.Body, FontSize = 13.5, Foreground = Ink.Frozen(Ink.Mist), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 5, 0, 0), MaxWidth = 470, HorizontalAlignment = HorizontalAlignment.Left });
            return sp;
        }

        static FrameworkElement Footer(params UIElement[] buttons)
        {
            FrameworkElement content = buttons.Length == 1 ? (FrameworkElement)buttons[0] : TwoColumns(buttons[0], buttons[1]);
            content.Margin = new Thickness(0, 16, 0, 26);
            Grid.SetRow(content, 2);
            return content;
        }

        static Grid TwoColumns(UIElement a, UIElement b)
        {
            var g = new Grid();
            g.ColumnDefinitions.Add(new ColumnDefinition());
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(12) });
            g.ColumnDefinitions.Add(new ColumnDefinition());
            Grid.SetColumn(a, 0);
            Grid.SetColumn(b, 2);
            g.Children.Add(a);
            g.Children.Add(b);
            return g;
        }

        // A list row: square check on the left, two lines of text, an optional tag on the right.
        FrameworkElement SelectRow(string title, string sub, bool selected, FrameworkElement tag, Action onClick, bool multi = false)
        {
            var bg = Ink.Brush(selected ? Ink.Panel : Ink.WithAlpha(Ink.Panel, 0));
            var border = new Border
            {
                Background = bg,
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(14, 10, 16, 10),
                Margin = new Thickness(0, 0, 0, 6),
                Cursor = Cursors.Hand
            };
            var dock = new DockPanel();
            border.Child = dock;

            FrameworkElement marker;
            PixelCheck check = null;
            if (multi)
            {
                check = new PixelCheck(selected) { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 14, 0) };
                marker = check;
            }
            else
            {
                // Single choice: a pixel bar that lights up on the left edge.
                marker = new Rectangle { Width = 4, Height = 26, Fill = Ink.Frozen(selected ? Ink.Ice : Ink.Line), Margin = new Thickness(0, 0, 14, 0), VerticalAlignment = VerticalAlignment.Center };
            }
            DockPanel.SetDock(marker, Dock.Left);
            dock.Children.Add(marker);
            if (tag != null)
            {
                DockPanel.SetDock(tag, Dock.Right);
                tag.VerticalAlignment = VerticalAlignment.Center;
                dock.Children.Add(tag);
            }
            var texts = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            texts.Children.Add(new TextBlock { Text = title, FontFamily = Ink.Display, FontSize = 15, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(Ink.Paper), TextTrimming = TextTrimming.CharacterEllipsis });
            if (!string.IsNullOrEmpty(sub))
                texts.Children.Add(new TextBlock { Text = sub, FontFamily = Ink.Body, FontSize = 12, Foreground = Ink.Frozen(Ink.Mist), TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(0, 1, 0, 0) });
            dock.Children.Add(texts);
            var lean = new TranslateTransform();
            texts.RenderTransform = lean;

            bool sel = selected;
            border.MouseEnter += (s, e) =>
            {
                Motion.Color(bg, sel ? Ink.PanelHi : Ink.WithAlpha(Ink.Panel, 255), 120);
                Motion.To(lean, TranslateTransform.XProperty, 2, 320, Motion.Out);
            };
            border.MouseLeave += (s, e) =>
            {
                Motion.Color(bg, sel ? Ink.Panel : Ink.WithAlpha(Ink.Panel, 0), 220);
                Motion.To(lean, TranslateTransform.XProperty, 0, 320, Motion.Out);
            };
            border.MouseLeftButtonUp += (s, e) =>
            {
                if (check != null)
                {
                    sel = !sel;
                    check.Set(sel, true);
                    Motion.Color(bg, sel ? Ink.PanelHi : Ink.Panel, 160);
                }
                else
                {
                    var bar = marker as Rectangle;
                    if (bar != null)
                    {
                        var st = new ScaleTransform(1, 0.4);
                        bar.RenderTransformOrigin = new Point(0.5, 0.5);
                        bar.RenderTransform = st;
                        bar.Fill = Ink.Frozen(Ink.Ice);
                        Motion.To(st, ScaleTransform.ScaleYProperty, 1, 380, Motion.Pop);
                    }
                }
                onClick();
            };
            return border;
        }

        static FrameworkElement StatusTag(string text, Color color)
        {
            var sp = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(12, 0, 0, 0) };
            sp.Children.Add(new Rectangle { Width = 6, Height = 6, Fill = Ink.Frozen(color), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 1, 7, 0) });
            sp.Children.Add(new TextBlock { Text = text, FontFamily = Ink.Display, FontSize = 12.5, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(color), VerticalAlignment = VerticalAlignment.Center });
            return sp;
        }

        FrameworkElement CheckRow(string text, bool value, Action<bool> changed)
        {
            var sp = new StackPanel { Orientation = Orientation.Horizontal, Cursor = Cursors.Hand, Background = Brushes.Transparent };
            var check = new PixelCheck(value) { Margin = new Thickness(0, 0, 10, 0), VerticalAlignment = VerticalAlignment.Center };
            sp.Children.Add(check);
            sp.Children.Add(new TextBlock { Text = text, FontFamily = Ink.Body, FontSize = 12.5, Foreground = Ink.Frozen(Ink.Mist), VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis, MaxWidth = 300 });
            sp.MouseLeftButtonUp += (s, e) =>
            {
                bool v = !check.IsChecked;
                check.Set(v, true);
                changed(v);
            };
            return sp;
        }

        static TextBlock LinkText(string text, Action onClick)
        {
            var brush = Ink.Brush(Ink.Mist);
            var t = new TextBlock { Text = text, FontFamily = Ink.Display, FontSize = 13, FontWeight = FontWeights.SemiBold, Foreground = brush, Cursor = Cursors.Hand, VerticalAlignment = VerticalAlignment.Center, Background = Brushes.Transparent };
            var lift = new TranslateTransform();
            t.RenderTransform = lift;
            t.MouseEnter += (s, e) => { Motion.Color(brush, Ink.Ice, 120); Motion.To(lift, TranslateTransform.YProperty, -1.5, 200, Motion.Out); };
            t.MouseLeave += (s, e) => { Motion.Color(brush, Ink.Mist, 200); Motion.To(lift, TranslateTransform.YProperty, 0, 260, Motion.Out); };
            t.MouseLeftButtonUp += (s, e) => onClick();
            return t;
        }

        static FrameworkElement Pill(string text, bool active, Action onClick)
        {
            var b = new Border
            {
                Background = Ink.Frozen(active ? Ink.Ice : Ink.Panel),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(12, 5, 12, 6),
                Margin = new Thickness(0, 0, 8, 8),
                Cursor = Cursors.Hand,
                Child = new TextBlock { Text = text, FontFamily = Ink.Display, FontSize = 13, FontWeight = FontWeights.SemiBold, Foreground = Ink.Frozen(active ? Ink.Night : Ink.Mist) }
            };
            b.MouseLeftButtonUp += (s, e) => onClick();
            return b;
        }

        static FrameworkElement MakePixelGrid()
        {
            var brush = new DrawingBrush
            {
                TileMode = TileMode.Tile,
                Viewport = new Rect(0, 0, 24, 24),
                ViewportUnits = BrushMappingMode.Absolute,
                Viewbox = new Rect(0, 0, 24, 24),
                ViewboxUnits = BrushMappingMode.Absolute,
                Drawing = new GeometryDrawing(Ink.Frozen(Color.FromArgb(14, 0x9C, 0xCB, 0xFF)), null, new RectangleGeometry(new Rect(0, 0, 2, 2)))
            };
            brush.Freeze();
            var r = new Rectangle { Fill = brush, IsHitTestVisible = false };
            // Fade the dots out toward the bottom so the controls sit on a calm background.
            var mask = new LinearGradientBrush(Color.FromArgb(255, 0, 0, 0), Color.FromArgb(0, 0, 0, 0), 90);
            mask.Freeze();
            r.OpacityMask = mask;
            Grid.SetRowSpan(r, 2);
            return r;
        }

        // Burst of pixel squares from the centre of an element.
        void Burst(FrameworkElement from, Color tint)
        {
            if (Motion.Disabled || !from.IsLoaded) return;
            Point c;
            try { c = from.TransformToAncestor(_root).Transform(new Point(from.ActualWidth / 2, from.ActualHeight / 2)); }
            catch { return; }
            var canvas = new Canvas { IsHitTestVisible = false };
            Grid.SetRowSpan(canvas, 2);
            _root.Children.Add(canvas);
            var rng = new Random();
            var parts = new List<double[]>();
            var rects = new List<Rectangle>();
            Color[] tints = { tint, Ink.Paper, Ink.Bamboo, Ink.Cobalt };
            for (int i = 0; i < 46; i++)
            {
                double ang = rng.NextDouble() * Math.PI * 2;
                double sp = 120 + rng.NextDouble() * 320;
                double size = 3 + rng.Next(0, 3) * 2;
                var r = new Rectangle { Width = size, Height = size, Fill = Ink.Frozen(tints[i % tints.Length]) };
                canvas.Children.Add(r);
                rects.Add(r);
                parts.Add(new[] { c.X, c.Y, Math.Cos(ang) * sp, Math.Sin(ang) * sp - 140, 1.0 });
            }
            var last = DateTime.UtcNow;
            var startT = last;
            EventHandler tick = null;
            tick = (s, e) =>
            {
                var now = DateTime.UtcNow;
                double dt = Math.Min(0.05, (now - last).TotalSeconds);
                last = now;
                double life = (now - startT).TotalSeconds;
                for (int i = 0; i < parts.Count; i++)
                {
                    var p = parts[i];
                    p[2] *= Math.Pow(0.2, dt);
                    p[3] = p[3] * Math.Pow(0.2, dt) + 520 * dt;
                    p[0] += p[2] * dt;
                    p[1] += p[3] * dt;
                    // Snap to a 2px grid so the particles read as pixels, not blur.
                    Canvas.SetLeft(rects[i], Math.Round(p[0] / 2) * 2);
                    Canvas.SetTop(rects[i], Math.Round(p[1] / 2) * 2);
                    rects[i].Opacity = Math.Max(0, 1 - life / 1.3);
                }
                if (life > 1.3)
                {
                    CompositionTarget.Rendering -= tick;
                    _root.Children.Remove(canvas);
                }
            };
            CompositionTarget.Rendering += tick;
        }

        // ═════════════════════════════ WORKFLOW ═════════════════════════════

        List<DetectedClient> GetMigrationSources()
        {
            var list = new List<DetectedClient>();
            foreach (var c in _detection.MigrationSources)
                if (!_prefs.WasMigrated(c.Mod.Id)) list.Add(c);
            return list;
        }

        void RefreshDetectionData()
        {
            _detection = ClientDetector.Detect(_paths, _prefs.CustomPaths);
            _selectedInstalls.Clear();
            foreach (var inst in _detection.Installs)
                _selectedInstalls.Add(!inst.IsDamaged);

            // Only offer clients that have settings to bring over and that were not handled on an earlier run.
            var sources = GetMigrationSources();
            if (sources.Count > 0)
            {
                if (_migrationClient == null || !sources.Contains(_migrationClient))
                    _migrationClient = sources[0];
                try { _migrationPlan = MigrationEngine.Analyze(_migrationClient); }
                catch { _migrationClient = null; _migrationPlan = null; }
            }
            else
            {
                _migrationClient = null;
                _migrationPlan = null;
            }

            _backups = MigrationEngine.ListBackups(_paths);
            if (_selectedBackupIdx >= _backups.Count) _selectedBackupIdx = 0;
            PollRunning(false);
        }

        void PollRunning(bool refreshIfChanged)
        {
            bool changed = false;
            foreach (var inst in _detection.Installs)
            {
                string key = inst.Id ?? inst.DisplayName;
                bool now = InstallationEngine.IsProcessRunning(inst);
                bool before;
                if (!_running.TryGetValue(key, out before) || before != now) changed = true;
                _running[key] = now;
            }
            if (changed && refreshIfChanged && _mainTab != 3 && _overlay.Visibility != Visibility.Visible)
                ShowScreen(WizardScreen.ClientTargets, 0, true);
        }

        List<DiscordInstall> GetSelectedTargets()
        {
            var list = new List<DiscordInstall>();
            for (int i = 0; i < _detection.Installs.Count && i < _selectedInstalls.Count; i++)
                if (_selectedInstalls[i]) list.Add(_detection.Installs[i]);
            return list;
        }

        bool AllSelectedHaveEndcord()
        {
            var t = GetSelectedTargets();
            if (t.Count == 0) return false;
            foreach (var d in t) if (!d.HasEndcord) return false;
            return true;
        }

        void StartSelectedOperation()
        {
            var targets = GetSelectedTargets();
            if (targets.Count == 0 || _isRunningOp) return;

            if (_mainTab == 0 || _mainTab == 1)
            {
                var conflicts = InstallationEngine.FindConflicts(targets);
                if (conflicts.Count > 0)
                {
                    var mods = new List<string>();
                    var insts = new List<string>();
                    foreach (var c in conflicts)
                    {
                        if (!insts.Contains(c.Install.DisplayName)) insts.Add(c.Install.DisplayName);
                        foreach (var m in c.ForeignMods)
                            if (!mods.Contains(m.DisplayName)) mods.Add(m.DisplayName);
                    }
                    ShowConflictDialog(string.Join(", ", mods.ToArray()), string.Join(", ", insts.ToArray()));
                    return;
                }
            }
            ExecuteOperationCore();
        }

        void ExecuteOperationCore()
        {
            var targets = GetSelectedTargets();
            if (targets.Count == 0 || _isRunningOp) return;

            _opMode = _mainTab;
            int mode = _mainTab;
            _isRunningOp = true;
            _cts = new CancellationTokenSource();
            var token = _cts.Token;
            bool relaunch = _prefs.Relaunch;

            NavigateTo(WizardScreen.Installing, 1);
            SetProgress(3, null);

            ThreadPool.QueueUserWorkItem(_ =>
            {
                OperationOutcome outcome;
                try
                {
                    outcome = mode == 2
                        ? InstallationEngine.RunUninstall(_paths, targets, relaunch, OnInstallProgress, token)
                        : InstallationEngine.RunInstall(_paths, targets, mode == 1, relaunch, OnInstallProgress, token);
                }
                catch (Exception ex)
                {
                    outcome = new OperationOutcome { Success = false, ErrorDetail = ex.Message };
                }

                Dispatcher.BeginInvoke(new Action(() =>
                {
                    if (outcome.Success) SetProgress(100, null);
                    var settle = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(outcome.Success && !Motion.Disabled ? 650 : 0) };
                    settle.Tick += (s, e) =>
                    {
                        settle.Stop();
                        _isRunningOp = false;
                        _lastOutcome = outcome;
                        _cleanupPrevClientChecked = true;
                        if (_streams != null) _streams.Stop();
                        if (_closeAfterOp) { Close(); return; }
                        RefreshDetectionData();
                        NavigateTo(WizardScreen.Completed, outcome.Success ? 0 : 1);
                    };
                    settle.Start();
                }));
            });
        }

        void OnInstallProgress(InstallProgressEvent ev)
        {
            Dispatcher.BeginInvoke(new Action(() =>
            {
                string status = (ev.StatusArgs != null && ev.StatusArgs.Length > 0) ? Loc.F(ev.StatusKey, ev.StatusArgs) : Loc.T(ev.StatusKey);
                SetProgress(Math.Max(4, ev.Percentage), _closeAfterOp ? Loc.T("status.rollingBack") : status);
            }));
        }

        void SetProgress(double pct, string status)
        {
            if (status != null && _progStatus != null) _progStatus.Text = status;
            if (_progBar == null) return;
            double from = _shownProgress;
            _shownProgress = Math.Max(_shownProgress, pct);
            _progBar.SetValue(_shownProgress / 100.0);
            if (_streams != null) _streams.Intensity = 0.35 + 0.65 * (_shownProgress / 100.0);

            if (Motion.Disabled) { _progPercent.Text = ((int)_shownProgress) + "%"; return; }
            // Roll the percentage number up rather than jumping.
            var target = _shownProgress;
            var start = DateTime.UtcNow;
            var t = new DispatcherTimer(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(16) };
            t.Tick += (s, e) =>
            {
                double p = Math.Min(1, (DateTime.UtcNow - start).TotalMilliseconds / 450.0);
                double v = from + (target - from) * (1 - Math.Pow(1 - p, 3));
                if (_progPercent != null && target >= _shownProgress - 0.01) _progPercent.Text = ((int)Math.Round(v)) + "%";
                if (p >= 1) t.Stop();
            };
            t.Start();
        }

        DetectedClient GetCleanupCandidateClient()
        {
            if (_migrationClient != null && !_migrationClient.IsStandalone &&
                (_migrationClient.DistDir != null || _migrationClient.InjectedInto.Count > 0))
                return _migrationClient;
            if (_lastOutcome != null && _lastOutcome.ReplacedMods.Count > 0)
            {
                var found = _detection.Find(_lastOutcome.ReplacedMods[0].Id);
                if (found != null && !found.IsStandalone && found.DistDir != null)
                    return found;
            }
            return null;
        }

        void ApplyConfirmedCleanupIfChecked(DetectedClient candidate)
        {
            if (!_cleanupPrevClientChecked || candidate == null) return;
            try { InstallationEngine.CleanupPreviousClient(_paths, candidate, _detection.Installs, true, CancellationToken.None); }
            catch { }
        }

        void BrowseCustomDiscordPath()
        {
            using (var fbd = new System.Windows.Forms.FolderBrowserDialog())
            {
                if (fbd.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
                var d = DiscordLocator.OpenCustom(fbd.SelectedPath);
                if (d == null) return;
                var paths = _prefs.CustomPaths;
                if (!paths.Contains(d.RootPath))
                {
                    paths.Add(d.RootPath);
                    _prefs.CustomPaths = paths;
                    _prefs.Save();
                }
                RefreshDetectionData();
            }
        }

        void RunInBackground<T>(Func<T> work, Action<T> done, Action<Exception> failed)
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                T result = default(T);
                Exception error = null;
                try { result = work(); }
                catch (Exception ex) { error = ex; }
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    if (error != null) failed(error);
                    else done(result);
                }));
            });
        }

        static void GetInstallStatus(DiscordInstall d, out string text, out Color col)
        {
            if (d.IsDamaged) { text = Loc.T("card.status.damaged"); col = Ink.Ember; return; }
            if (d.HasEndcord) { text = Loc.T("card.status.endcord"); col = Ink.Bamboo; return; }
            if (d.ForeignMods.Count > 0) { text = d.ForeignMods[0].DisplayName; col = Ink.Honey; return; }
            text = Loc.T("card.status.vanilla");
            col = Ink.Ice;
        }

        static void GetOutcomeStrings(OperationOutcome o, out string title, out string body)
        {
            if (o == null) { title = Loc.T("err.generic.title"); body = ""; return; }
            if (o.Success)
            {
                title = o.Operation == InstallOperationKind.Uninstall
                    ? Loc.T("status.uninstallComplete")
                    : (o.Operation == InstallOperationKind.Repair
                        ? Loc.T("status.repairComplete")
                        : (o.WasUpdate ? Loc.T("status.updateComplete") : Loc.T("status.installComplete")));
                body = Loc.F("done.banner.installed", o.AffectedInstalls.Count);
                return;
            }
            switch (o.FailureKind)
            {
                case FailureKind.Cancelled: title = Loc.T("err.cancelled.title"); body = Loc.T("err.cancelled.body"); break;
                case FailureKind.PermissionDenied: title = Loc.T("err.permission.title"); body = Loc.F("err.permission.body", o.FailureSubject ?? ""); break;
                case FailureKind.FilesLocked: title = Loc.T("err.locked.title"); body = Loc.F("err.locked.body", o.FailureSubject ?? ""); break;
                case FailureKind.DiscordDamaged: title = Loc.T("err.damaged.title"); body = Loc.F("err.damaged.body", o.FailureSubject ?? "Discord"); break;
                default: title = Loc.T("err.generic.title"); body = o.ErrorDetail ?? ""; break;
            }
        }

        // ═════════════════════════════ IMAGES ═════════════════════════════

        static BitmapSource LoadLogo()
        {
            try
            {
                var asm = Assembly.GetExecutingAssembly();
                foreach (var name in asm.GetManifestResourceNames())
                {
                    if (name.EndsWith("app_logo.png", StringComparison.OrdinalIgnoreCase) ||
                        name.EndsWith("logonobg.png", StringComparison.OrdinalIgnoreCase))
                    {
                        using (var s = asm.GetManifestResourceStream(name))
                        {
                            if (s == null) continue;
                            var bmp = new BitmapImage();
                            bmp.BeginInit();
                            bmp.CacheOption = BitmapCacheOption.OnLoad;
                            bmp.StreamSource = s;
                            bmp.EndInit();
                            bmp.Freeze();
                            return bmp;
                        }
                    }
                }
            }
            catch { }
            try
            {
                string local = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app_logo.png");
                if (File.Exists(local))
                {
                    var bmp = new BitmapImage(new Uri(local));
                    bmp.Freeze();
                    return bmp;
                }
            }
            catch { }
            return null;
        }

        static BitmapSource Pixelate(BitmapSource src, int size)
        {
            var scaled = new TransformedBitmap(src, new ScaleTransform((double)size / src.PixelWidth, (double)size / src.PixelHeight));
            scaled.Freeze();
            return scaled;
        }

        // ═════════════════════════════ PREVIEWS ═════════════════════════════

        public static void RenderPreviewSuite(string outDir)
        {
            Directory.CreateDirectory(outDir);
            Motion.Disabled = true;
            var w = new InstallerWindow(true);

            if (w._migrationClient == null)
            {
                w._migrationClient = new DetectedClient
                {
                    Mod = ModCatalog.ById("vencord"),
                    Settings = new SettingsSource { Mod = ModCatalog.ById("vencord"), EnabledPluginCount = 14, ThemeCount = 3, HasQuickCss = true }
                };
                w._migrationPlan = new MigrationPlan { Source = w._migrationClient, CompatiblePluginCount = 14, ThemeCount = 3, HasQuickCss = true };
                w._migrationPlan.CompatibleItems.Add(new MigrationPreviewItem { DisplayName = "AlwaysAnimate", Compatible = true, ReasonKey = "mig.reason.compatiblePlugin" });
                w._migrationPlan.IncompatibleItems.Add(new MigrationPreviewItem { DisplayName = "VencordCloudAuth", Compatible = false, ReasonKey = "mig.reason.cloudAuth" });
            }

            Action<string, WizardScreen, string> snap = (file, scr, lang) =>
            {
                if (lang != null) Loc.SetLanguage(lang);
                w._screen = scr;
                w.ShowScreen(scr, 0, true);
                if (scr == WizardScreen.Installing) { w.SetProgress(68, Loc.F("status.patchingClient", "Discord", "1.0.9264")); }
                w.UpdateHeader();
                w._root.Measure(new Size(WinW, WinH));
                w._root.Arrange(new Rect(0, 0, WinW, WinH));
                w._root.UpdateLayout();
                var rtb = new RenderTargetBitmap((int)WinW, (int)WinH, 96, 96, PixelFormats.Pbgra32);
                rtb.Render(w._root);
                var enc = new PngBitmapEncoder();
                enc.Frames.Add(BitmapFrame.Create(rtb));
                using (var fs = File.Create(System.IO.Path.Combine(outDir, file))) enc.Save(fs);
            };

            try
            {
                snap("1_intro.png", WizardScreen.IntroSplash, null);
                snap("2_language.png", WizardScreen.LanguageSelect, null);
                snap("3_migration.png", WizardScreen.MigrationPrompt, null);
                snap("4_targets.png", WizardScreen.ClientTargets, null);
                snap("5_installing.png", WizardScreen.Installing, null);
                w._lastOutcome = new OperationOutcome { Success = true, Operation = InstallOperationKind.InstallOrUpdate };
                w._lastOutcome.AffectedInstalls.Add(new DiscordInstall { DisplayName = "Discord" });
                snap("6_completed.png", WizardScreen.Completed, null);
                w._lastOutcome = new OperationOutcome { Success = false, FailureKind = FailureKind.FilesLocked, FailureSubject = "app.asar" };
                snap("7_failed.png", WizardScreen.Completed, null);
                snap("8_targets_tr.png", WizardScreen.ClientTargets, "tr");
            }
            catch (Exception ex)
            {
                File.WriteAllText(System.IO.Path.Combine(outDir, "err.txt"), ex.ToString());
            }
        }
    }

    // Segmented tabs with an underline that glides to the active tab.
    sealed class TabStrip : Grid
    {
        readonly List<TextBlock> _labels = new List<TextBlock>();
        readonly Rectangle _bar;
        readonly TranslateTransform _barX = new TranslateTransform();
        int _active;

        public event Action<int> Changed;

        public TabStrip(string[] names, int active)
        {
            _active = active;
            Height = 36;
            var row = new Grid();
            for (int i = 0; i < names.Length; i++)
            {
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                int idx = i;
                var t = new TextBlock
                {
                    Text = names[i],
                    FontFamily = Ink.Display,
                    FontSize = 14.5,
                    FontWeight = FontWeights.SemiBold,
                    Foreground = Ink.Brush(i == active ? Ink.Paper : Ink.Dim),
                    Margin = new Thickness(0, 0, 22, 0),
                    Cursor = Cursors.Hand,
                    Background = Brushes.Transparent,
                    VerticalAlignment = VerticalAlignment.Top
                };
                Grid.SetColumn(t, i);
                t.MouseLeftButtonUp += (s, e) => Select(idx);
                t.MouseEnter += (s, e) => { if (idx != _active) Motion.Color((SolidColorBrush)t.Foreground, Ink.Mist, 120); };
                t.MouseLeave += (s, e) => { if (idx != _active) Motion.Color((SolidColorBrush)t.Foreground, Ink.Dim, 200); };
                _labels.Add(t);
                row.Children.Add(t);
            }
            Children.Add(row);

            var rail = new Rectangle { Height = 1, Fill = Ink.Frozen(Ink.Line), VerticalAlignment = VerticalAlignment.Bottom };
            Children.Add(rail);
            _bar = new Rectangle { Height = 3, Width = 10, Fill = Ink.Frozen(Ink.Ice), VerticalAlignment = VerticalAlignment.Bottom, HorizontalAlignment = HorizontalAlignment.Left, RenderTransform = _barX, Margin = new Thickness(0, 0, 0, -1) };
            Children.Add(_bar);
            Loaded += (s, e) => MoveBar(false);
            LayoutUpdated += (s, e) => { if (_bar.Width <= 10 && _labels[_active].ActualWidth > 0) MoveBar(false); };
        }

        void Select(int idx)
        {
            if (idx == _active) return;
            Motion.Color((SolidColorBrush)_labels[_active].Foreground, Ink.Dim, 200);
            _active = idx;
            Motion.Color((SolidColorBrush)_labels[_active].Foreground, Ink.Paper, 200);
            MoveBar(true);
            if (Changed != null) Changed(idx);
        }

        void MoveBar(bool animate)
        {
            var label = _labels[_active];
            if (label.ActualWidth <= 0) return;
            double x = label.TranslatePoint(new Point(0, 0), this).X;
            if (!animate || Motion.Disabled)
            {
                _barX.BeginAnimation(TranslateTransform.XProperty, null);
                _barX.X = x;
                _bar.BeginAnimation(WidthProperty, null);
                _bar.Width = label.ActualWidth;
                return;
            }
            Motion.To(_barX, TranslateTransform.XProperty, x, 380, Motion.Out);
            Motion.To(_bar, WidthProperty, label.ActualWidth, 380, Motion.Out);
        }
    }

    // Progress as a row of pixel blocks that pop in one by one.
    sealed class PixelProgress : Grid
    {
        readonly List<Rectangle> _cells = new List<Rectangle>();
        int _lit;

        public PixelProgress(double width, int count)
        {
            Height = 14;
            double gap = 4;
            double cell = (width - gap * (count - 1)) / count;
            var row = new StackPanel { Orientation = Orientation.Horizontal };
            for (int i = 0; i < count; i++)
            {
                var r = new Rectangle
                {
                    Width = cell,
                    Height = 14,
                    Fill = Ink.Brush(Ink.Panel),
                    Margin = new Thickness(0, 0, i == count - 1 ? 0 : gap, 0),
                    RenderTransformOrigin = new Point(0.5, 1),
                    RenderTransform = new ScaleTransform(1, 1)
                };
                _cells.Add(r);
                row.Children.Add(r);
            }
            Children.Add(row);
        }

        public void SetValue(double ratio)
        {
            int target = (int)Math.Round(Math.Max(0, Math.Min(1, ratio)) * _cells.Count);
            for (int i = _lit; i < target; i++)
            {
                var r = _cells[i];
                double delay = (i - _lit) * 28;
                double t = (double)i / Math.Max(1, _cells.Count - 1);
                // Blocks shade from cobalt into ice as the row fills, like the logo letters.
                var c = Color.FromRgb((byte)(Ink.Cobalt.R + (Ink.Ice.R - Ink.Cobalt.R) * t), (byte)(Ink.Cobalt.G + (Ink.Ice.G - Ink.Cobalt.G) * t), (byte)(Ink.Cobalt.B + (Ink.Ice.B - Ink.Cobalt.B) * t));
                var brush = (SolidColorBrush)r.Fill;
                if (Motion.Disabled) { brush.Color = c; continue; }
                var ca = new ColorAnimation(c, TimeSpan.FromMilliseconds(160)) { BeginTime = TimeSpan.FromMilliseconds(delay) };
                brush.BeginAnimation(SolidColorBrush.ColorProperty, ca);
                var st = (ScaleTransform)r.RenderTransform;
                st.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(0.3, 1, TimeSpan.FromMilliseconds(380)) { BeginTime = TimeSpan.FromMilliseconds(delay), EasingFunction = Motion.Pop });
            }
            if (target > _lit) _lit = target;
        }
    }

    // The dashed "speed lines" from either side of the logo, streaming toward the centre while work happens.
    sealed class Streamlines : Canvas
    {
        sealed class Dash
        {
            public Rectangle Shape;
            public double X, Y, Speed, Len;
            public int Side;
        }

        readonly List<Dash> _dashes = new List<Dash>();
        readonly double _w, _h;
        readonly Random _rng = new Random(7);
        DateTime _last;
        bool _running;
        public double Intensity = 0.35;

        public Streamlines(double width, double height)
        {
            _w = width;
            _h = height;
            Width = width;
            Height = height;
            IsHitTestVisible = false;
            ClipToBounds = true;
            for (int i = 0; i < 34; i++)
            {
                var d = new Dash();
                Reset(d, true);
                d.Shape = new Rectangle { Height = d.Len < 18 ? 3 : 4, Width = d.Len, Fill = Ink.Frozen(i % 4 == 0 ? Ink.Ice : (i % 3 == 0 ? Ink.Paper : Ink.Cobalt)), Opacity = 0.75 };
                Children.Add(d.Shape);
                _dashes.Add(d);
                Place(d);
            }
            Loaded += (s, e) => Start();
            Unloaded += (s, e) => Stop();
        }

        void Reset(Dash d, bool anywhere)
        {
            d.Side = _rng.Next(2);
            d.Len = 6 + _rng.Next(0, 6) * 6;
            d.Speed = 70 + _rng.NextDouble() * 140;
            // Rows on a 6px grid, kept to the band beside the letters.
            d.Y = _h * 0.5 + (_rng.Next(-8, 9) * 6);
            double edge = _w * 0.5 - 92;
            d.X = anywhere ? _rng.NextDouble() * edge : -d.Len - _rng.NextDouble() * 60;
        }

        void Place(Dash d)
        {
            double x = d.Side == 0 ? d.X : _w - d.X - d.Len;
            SetLeft(d.Shape, Math.Round(x / 2) * 2);
            SetTop(d.Shape, d.Y);
            double edge = _w * 0.5 - 92;
            double fade = Math.Min(1, Math.Max(0, (edge - d.X - d.Len) / 60));
            d.Shape.Opacity = 0.85 * fade;
        }

        public void Start()
        {
            if (_running || Motion.Disabled) return;
            _running = true;
            _last = DateTime.UtcNow;
            CompositionTarget.Rendering += OnFrame;
        }

        public void Stop()
        {
            if (!_running) return;
            _running = false;
            CompositionTarget.Rendering -= OnFrame;
        }

        void OnFrame(object sender, EventArgs e)
        {
            var now = DateTime.UtcNow;
            double dt = Math.Min(0.05, (now - _last).TotalSeconds);
            _last = now;
            double edge = _w * 0.5 - 92;
            foreach (var d in _dashes)
            {
                d.X += d.Speed * (0.4 + Intensity * 1.6) * dt;
                if (d.X > edge) Reset(d, false);
                Place(d);
            }
        }
    }

    // Pixel "z"s drifting up from the sleeping panda.
    sealed class Snore : Canvas
    {
        public Snore()
        {
            IsHitTestVisible = false;
            Width = 120;
            Height = 120;
            HorizontalAlignment = HorizontalAlignment.Center;
            VerticalAlignment = VerticalAlignment.Center;
            Margin = new Thickness(78, -168, 0, 0);
            for (int i = 0; i < 3; i++)
            {
                var z = new TextBlock { Text = "z", FontFamily = Ink.Display, FontWeight = FontWeights.Bold, FontSize = 13 + i * 4, Foreground = Ink.Frozen(Ink.Ice), Opacity = 0 };
                SetLeft(z, 10 + i * 14);
                SetTop(z, 80);
                Children.Add(z);
                if (Motion.Disabled) { z.Opacity = 0.8 - i * 0.2; SetTop(z, 70 - i * 18); continue; }
                var begin = TimeSpan.FromMilliseconds(i * 700);
                var dur = new Duration(TimeSpan.FromMilliseconds(2100));
                var up = new DoubleAnimation(80, 20, dur) { BeginTime = begin, RepeatBehavior = RepeatBehavior.Forever };
                var fade = new DoubleAnimationUsingKeyFrames { BeginTime = begin, RepeatBehavior = RepeatBehavior.Forever, Duration = dur };
                fade.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(0)));
                fade.KeyFrames.Add(new LinearDoubleKeyFrame(0.9, KeyTime.FromPercent(0.25)));
                fade.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(1)));
                z.BeginAnimation(TopProperty, up);
                z.BeginAnimation(OpacityProperty, fade);
            }
        }
    }
}
