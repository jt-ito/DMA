using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

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
        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        private Process nodeProcess;
        private WebView2 webView;

        public LauncherForm()
        {
            this.Text = "Docker Manager Server";
            this.Size = new Size(800, 500);
            this.StartPosition = FormStartPosition.CenterScreen;
            try {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            } catch {
                this.Icon = SystemIcons.Application;
            }
            this.BackColor = Color.FromArgb(24, 24, 27); // Dark zinc fallback

            // Apply dark mode to the native window title bar
            int dark = 1;
            DwmSetWindowAttribute(this.Handle, 20, ref dark, sizeof(int)); // Windows 11 and later Win10
            DwmSetWindowAttribute(this.Handle, 19, ref dark, sizeof(int)); // Older Win10
            
            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            this.Controls.Add(webView);

            this.Load += LauncherForm_Load;
            this.FormClosing += LauncherForm_FormClosing;
        }

        private async void LauncherForm_Load(object sender, EventArgs e)
        {
            try {
                // Initialize WebView2
                string userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DockerManagerLauncher");
                var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await webView.EnsureCoreWebView2Async(env);
                
                // Disable dev tools and context menu for a clean app feel
                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                
                // Listen for messages from the UI (Open Browser, Stop Server)
                webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

                // Load the modern HTML UI
                string uiPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launcher-ui.html");
                if (File.Exists(uiPath)) {
                    webView.CoreWebView2.Navigate("file:///" + uiPath.Replace("\\", "/"));
                } else {
                    MessageBox.Show("Could not find launcher-ui.html!", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                
                StartNodeServer();
            } catch (Exception ex) {
                MessageBox.Show("WebView2 Initialization Failed: " + ex.Message + "\n\nPlease ensure Microsoft Edge WebView2 Runtime is installed.", "Fatal Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
            }
        }

        private void CoreWebView2_WebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string msg = e.TryGetWebMessageAsString();
            if (msg == "OPEN_BROWSER") {
                Process.Start(new ProcessStartInfo("cmd", "/c start http://localhost:3000") { CreateNoWindow = true, UseShellExecute = false });
            } else if (msg == "STOP_SERVER") {
                if (nodeProcess != null && !nodeProcess.HasExited)
                {
                    try {
                        Process.Start(new ProcessStartInfo {
                            FileName = "taskkill",
                            Arguments = string.Format("/PID {0} /T /F", nodeProcess.Id),
                            CreateNoWindow = true,
                            UseShellExecute = false
                        });
                        SendLogToUI("\n=== Server Stopped ===");
                    } catch { }
                }
            }
        }

        private void SendLogToUI(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<string>(SendLogToUI), text);
                return;
            }

            if (webView.CoreWebView2 != null) {
                // Sanitize text for JSON string
                string safeText = text.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "");
                webView.CoreWebView2.PostWebMessageAsString(text);
            }
        }

        private void StartNodeServer()
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
            psi.EnvironmentVariables["NO_COLOR"] = "1";
            psi.EnvironmentVariables["FORCE_COLOR"] = "0";

            nodeProcess = new Process { StartInfo = psi };
            
            nodeProcess.OutputDataReceived += (s, ev) => {
                SendLogToUI(ev.Data);
            };
            
            nodeProcess.ErrorDataReceived += (s, ev) => {
                SendLogToUI("ERROR: " + ev.Data);
            };

            try {
                nodeProcess.Start();
                nodeProcess.BeginOutputReadLine();
                nodeProcess.BeginErrorReadLine();
            } catch (Exception ex) {
                SendLogToUI("Failed to start server: " + ex.Message);
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
