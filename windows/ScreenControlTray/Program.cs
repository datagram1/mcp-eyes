/**
 * ScreenControl Tray Application
 *
 * Entry point for the Windows Tray App.
 * Communicates with the ScreenControlService via HTTP.
 */

using System;
using System.Windows.Forms;
using System.Threading;

namespace ScreenControlTray
{
    internal static class Program
    {
        private static Mutex? _mutex;

        [STAThread]
        static void Main(string[] args)
        {
            // Ensure single instance
            const string mutexName = "ScreenControlTray_SingleInstance";
            _mutex = new Mutex(true, mutexName, out bool createdNew);

            if (!createdNew)
            {
                MessageBox.Show(
                    "ScreenControl Tray is already running.",
                    "ScreenControl",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                return;
            }

            try
            {
                Application.SetHighDpiMode(HighDpiMode.SystemAware);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                // Run with custom application context (handles tray icon)
                Application.Run(new TrayApplicationContext());
            }
            finally
            {
                _mutex?.ReleaseMutex();
                _mutex?.Dispose();
            }
        }
    }
}
