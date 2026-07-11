using System;
using System.Diagnostics;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace DockerManagerLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }

    public class LauncherForm : Form
    {
        private Label statusLabel;
        private Process nodeProcess;
        private bool openedBrowser = false;
        private System.Windows.Forms.Timer timeoutTimer;
        private NotifyIcon trayIcon;

        public LauncherForm()
        {
            // Determine Windows theme (Light/Dark)
            bool isDarkMode = true;
            try {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")) {
                    if (key != null) {
                        object value = key.GetValue("AppsUseLightTheme");
                        if (value != null && (int)value == 1) isDarkMode = false;
                    }
                }
            } catch { }

            this.Text = "Docker Manager";
            this.Size = new Size(400, 200);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            
            if (isDarkMode) {
                this.BackColor = Color.FromArgb(24, 24, 27);
                this.ForeColor = Color.FromArgb(250, 250, 250);
            } else {
                this.BackColor = Color.FromArgb(250, 250, 250);
                this.ForeColor = Color.FromArgb(24, 24, 27);
            }
            
            statusLabel = new Label();
            statusLabel.Text = "Starting Docker Manager...\nChecking ports and launching server...";
            statusLabel.Font = new Font("Segoe UI", 11F, FontStyle.Regular);
            statusLabel.Dock = DockStyle.Fill;
            statusLabel.TextAlign = ContentAlignment.MiddleCenter;
            this.Controls.Add(statusLabel);

            this.Load += LauncherForm_Load;
            this.FormClosing += LauncherForm_FormClosing;
            
            // Set up System Tray Icon
            trayIcon = new NotifyIcon();
            trayIcon.Text = "Docker Manager";
            // Use standard application icon or a default system icon
            trayIcon.Icon = SystemIcons.Application;
            
            ContextMenu trayMenu = new ContextMenu();
            trayMenu.MenuItems.Add("Open in Browser", (s, e) => {
                Process.Start(new ProcessStartInfo("cmd", "/c start http://localhost:3000") { CreateNoWindow = true, UseShellExecute = false });
            });
            trayMenu.MenuItems.Add("Exit", (s, e) => {
                this.Close();
            });
            trayIcon.ContextMenu = trayMenu;
            trayIcon.DoubleClick += (s, e) => {
                Process.Start(new ProcessStartInfo("cmd", "/c start http://localhost:3000") { CreateNoWindow = true, UseShellExecute = false });
            };
        }

        private void LauncherForm_Load(object sender, EventArgs e)
        {
            // Kill existing port 3000 just in case
            try {
                Process.Start(new ProcessStartInfo {
                    FileName = "cmd.exe",
                    Arguments = "/c npx --yes kill-port 3000",
                    CreateNoWindow = true,
                    UseShellExecute = false
                }).WaitForExit();
            } catch { }

            var psi = new ProcessStartInfo
            {
                FileName = "node.exe",
                Arguments = "start.js",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory
            };

            nodeProcess = new Process { StartInfo = psi };
            
            nodeProcess.OutputDataReceived += (s, ev) => {
                if (ev.Data != null) {
                    if (!openedBrowser && (ev.Data.Contains("Ready in") || ev.Data.Contains("localhost:3000") || ev.Data.Contains("Listening on"))) {
                        OpenBrowserAndHide();
                    }
                }
            };
            
            nodeProcess.Start();
            nodeProcess.BeginOutputReadLine();
            nodeProcess.BeginErrorReadLine();

            timeoutTimer = new System.Windows.Forms.Timer();
            timeoutTimer.Interval = 5000;
            timeoutTimer.Tick += (s, ev) => {
                timeoutTimer.Stop();
                if (!openedBrowser) {
                    OpenBrowserAndHide();
                }
            };
            timeoutTimer.Start();
        }

        private void OpenBrowserAndHide()
        {
            if (openedBrowser) return;
            openedBrowser = true;
            
            Process.Start(new ProcessStartInfo("cmd", "/c start http://localhost:3000") { CreateNoWindow = true, UseShellExecute = false });
            
            this.Invoke((MethodInvoker)delegate {
                this.Hide();
                trayIcon.Visible = true;
                trayIcon.ShowBalloonTip(3000, "Docker Manager", "Server is running in the background. Right click to exit.", ToolTipIcon.Info);
            });
        }

        private void LauncherForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            trayIcon.Visible = false;
            if (nodeProcess != null && !nodeProcess.HasExited)
            {
                Process.Start(new ProcessStartInfo {
                    FileName = "taskkill",
                    Arguments = string.Format("/PID {0} /T /F", nodeProcess.Id),
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
            }
        }
    }
}
