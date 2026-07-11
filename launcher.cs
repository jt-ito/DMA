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
        private Process nodeProcess;
        private RichTextBox logBox;
        private Button openBrowserBtn;
        private Button stopServerBtn;
        private bool isDarkMode = true;

        public LauncherForm()
        {
            // Determine Windows theme (Light/Dark)
            try {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")) {
                    if (key != null) {
                        object value = key.GetValue("AppsUseLightTheme");
                        if (value != null && (int)value == 1) isDarkMode = false;
                    }
                }
            } catch { }

            this.Text = "Docker Manager Server";
            this.Size = new Size(800, 500);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.Icon = SystemIcons.Application;
            
            Color bgColor = isDarkMode ? Color.FromArgb(24, 24, 27) : Color.FromArgb(250, 250, 250);
            Color fgColor = isDarkMode ? Color.FromArgb(250, 250, 250) : Color.FromArgb(24, 24, 27);
            Color logBgColor = isDarkMode ? Color.FromArgb(10, 10, 10) : Color.White;
            Color logFgColor = isDarkMode ? Color.FromArgb(0, 255, 0) : Color.Black;
            Color btnBgColor = isDarkMode ? Color.FromArgb(63, 63, 70) : Color.FromArgb(228, 228, 231);

            this.BackColor = bgColor;
            this.ForeColor = fgColor;
            
            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.RowCount = 2;
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 50F));
            this.Controls.Add(layout);

            logBox = new RichTextBox();
            logBox.Dock = DockStyle.Fill;
            logBox.ReadOnly = true;
            logBox.BackColor = logBgColor;
            logBox.ForeColor = logFgColor;
            logBox.Font = new Font("Consolas", 10F, FontStyle.Regular);
            logBox.BorderStyle = BorderStyle.None;
            logBox.Margin = new Padding(10);
            layout.Controls.Add(logBox, 0, 0);

            FlowLayoutPanel btnPanel = new FlowLayoutPanel();
            btnPanel.Dock = DockStyle.Fill;
            btnPanel.FlowDirection = FlowDirection.RightToLeft;
            btnPanel.Padding = new Padding(10);
            layout.Controls.Add(btnPanel, 0, 1);

            openBrowserBtn = new Button();
            openBrowserBtn.Text = "Open in Browser";
            openBrowserBtn.Size = new Size(130, 30);
            openBrowserBtn.FlatStyle = FlatStyle.Flat;
            openBrowserBtn.BackColor = Color.FromArgb(37, 99, 235); // Blue
            openBrowserBtn.ForeColor = Color.White;
            openBrowserBtn.Cursor = Cursors.Hand;
            openBrowserBtn.Click += (s, e) => {
                Process.Start(new ProcessStartInfo("cmd", "/c start http://localhost:3000") { CreateNoWindow = true, UseShellExecute = false });
            };
            btnPanel.Controls.Add(openBrowserBtn);

            stopServerBtn = new Button();
            stopServerBtn.Text = "Stop Server";
            stopServerBtn.Size = new Size(100, 30);
            stopServerBtn.FlatStyle = FlatStyle.Flat;
            stopServerBtn.BackColor = btnBgColor;
            stopServerBtn.ForeColor = fgColor;
            stopServerBtn.Cursor = Cursors.Hand;
            stopServerBtn.Click += (s, e) => {
                this.Close();
            };
            btnPanel.Controls.Add(stopServerBtn);

            this.Load += LauncherForm_Load;
            this.FormClosing += LauncherForm_FormClosing;
        }

        private void AppendLog(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<string>(AppendLog), text);
                return;
            }

            logBox.AppendText(text + Environment.NewLine);
            logBox.SelectionStart = logBox.Text.Length;
            logBox.ScrollToCaret();

            // Auto-open browser on first ready
            if (text.Contains("Ready in") || text.Contains("localhost:3000") || text.Contains("Listening on")) {
                if (!autoOpened) {
                    autoOpened = true;
                    Process.Start(new ProcessStartInfo("cmd", "/c start http://localhost:3000") { CreateNoWindow = true, UseShellExecute = false });
                }
            }
        }
        
        private bool autoOpened = false;

        private void LauncherForm_Load(object sender, EventArgs e)
        {
            AppendLog("Starting Docker Manager...");
            
            // Kill existing port 3000 just in case
            try {
                Process.Start(new ProcessStartInfo {
                    FileName = "cmd.exe",
                    Arguments = "/c npx --yes kill-port 3000",
                    CreateNoWindow = true,
                    UseShellExecute = false
                }).WaitForExit();
            } catch { }

            AppendLog("Port 3000 cleared. Launching Node server...");

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
                AppendLog(ev.Data);
            };
            
            nodeProcess.ErrorDataReceived += (s, ev) => {
                AppendLog("ERROR: " + ev.Data);
            };

            try {
                nodeProcess.Start();
                nodeProcess.BeginOutputReadLine();
                nodeProcess.BeginErrorReadLine();
            } catch (Exception ex) {
                AppendLog("Failed to start server: " + ex.Message);
            }
        }

        private void LauncherForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (nodeProcess != null && !nodeProcess.HasExited)
            {
                try {
                    Process.Start(new ProcessStartInfo {
                        FileName = "taskkill",
                        Arguments = string.Format("/PID {0} /T /F", nodeProcess.Id),
                        CreateNoWindow = true,
                        UseShellExecute = false
                    });
                } catch { }
            }
        }
    }
}
