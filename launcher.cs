using System;
using System.Diagnostics;
using System.Threading;

class Launcher
{
    static void Main()
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.Title = "Docker Manager Server";
        Console.WriteLine("========================================");
        Console.WriteLine("        Starting Docker Manager...      ");
        Console.WriteLine("========================================");
        Console.WriteLine("Please wait a moment while the server starts up.");
        Console.WriteLine("The application will automatically open in your browser.");
        Console.WriteLine("Keep this window open. Close it to stop the server.");
        Console.WriteLine();
        Console.WriteLine("Ensuring port 3000 is clear...");

        try {
            var killCmd = new ProcessStartInfo {
                FileName = "cmd.exe",
                Arguments = "/c npx --yes kill-port 3000",
                CreateNoWindow = true,
                UseShellExecute = false
            };
            Process.Start(killCmd).WaitForExit();
        } catch { }

        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = "/c npm run dev",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory
        };

        Process npm = new Process { StartInfo = psi };
        bool opened = false;
        
        npm.OutputDataReceived += (s, e) => {
            if (e.Data != null) {
                Console.WriteLine(e.Data);
                // When we see Next.js ready message, open browser
                if (!opened && (e.Data.Contains("Ready in") || e.Data.Contains("localhost:3000"))) {
                    opened = true;
                    Process.Start(new ProcessStartInfo("cmd", "/c start http://localhost:3000") { CreateNoWindow = true, UseShellExecute = false });
                }
            }
        };

        npm.ErrorDataReceived += (s, e) => {
            if (e.Data != null) Console.WriteLine(e.Data);
        };

        npm.Start();
        npm.BeginOutputReadLine();
        npm.BeginErrorReadLine();
        
        // Fallback: if we didn't detect the ready string for some reason, open after 5 seconds
        new Thread(() => {
            Thread.Sleep(5000);
            if (!opened) {
                opened = true;
                Process.Start(new ProcessStartInfo("cmd", "/c start http://localhost:3000") { CreateNoWindow = true, UseShellExecute = false });
            }
        }).Start();

        npm.WaitForExit();
        Console.WriteLine("\nServer process has stopped. Press ENTER to close this window.");
        Console.ReadLine();
    }
}
