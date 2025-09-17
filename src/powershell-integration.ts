#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

export interface WindowsProcess {
  name: string;
  pid: number;
  title: string;
  mainWindowHandle?: string;
}

export interface AdminRights {
  hasAdminRights: boolean;
  canAccessHKLM: boolean;
  error?: string;
}

/**
 * Cross-Platform PowerShell Integration Module
 * Implements Node child_process execution of Get-Process and Start-Process
 * with async functions and admin rights detection.
 */
export class PowerShellIntegration {
  private static instance: PowerShellIntegration;
  private isWindows: boolean;
  private powerShellCommand: string;

  constructor() {
    this.isWindows = os.platform() === 'win32';
    // Pin PowerShell 7.4 if available, fallback to Windows PowerShell
    this.powerShellCommand = 'powershell.exe';
  }

  public static getInstance(): PowerShellIntegration {
    if (!PowerShellIntegration.instance) {
      PowerShellIntegration.instance = new PowerShellIntegration();
    }
    return PowerShellIntegration.instance;
  }

  /**
   * Check if we have admin rights by testing access to HKLM:\SOFTWARE
   */
  async checkAdminRights(): Promise<AdminRights> {
    if (!this.isWindows) {
      return {
        hasAdminRights: false,
        canAccessHKLM: false,
        error: 'Admin rights check only available on Windows'
      };
    }

    try {
      const command = `${this.powerShellCommand} -Command "Test-Path 'HKLM:\\SOFTWARE'"`;
      const { stdout, stderr } = await execAsync(command);
      
      const canAccess = stdout.trim().toLowerCase() === 'true';
      
      return {
        hasAdminRights: canAccess,
        canAccessHKLM: canAccess,
        error: stderr ? stderr.trim() : undefined
      };
    } catch (error) {
      return {
        hasAdminRights: false,
        canAccessHKLM: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get list of processes with main windows using Get-Process
   */
  async getProcesses(): Promise<WindowsProcess[]> {
    if (!this.isWindows) {
      throw new Error('PowerShell process listing only available on Windows');
    }

    try {
      const command = `${this.powerShellCommand} -Command "
        Get-Process | Where-Object {$_.MainWindowTitle -ne '' -and $_.MainWindowTitle -ne $null} | 
        Select-Object @{Name='Name';Expression={$_.ProcessName}}, 
                     @{Name='PID';Expression={$_.Id}}, 
                     @{Name='Title';Expression={$_.MainWindowTitle}},
                     @{Name='MainWindowHandle';Expression={$_.MainWindowHandle}} |
        ConvertTo-Json -Depth 2
      "`;

      const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
      
      if (stderr && stderr.trim()) {
        console.warn('PowerShell warning:', stderr.trim());
      }

      if (!stdout || stdout.trim() === '') {
        return [];
      }

      let processes;
      try {
        processes = JSON.parse(stdout);
      } catch (parseError) {
        throw new Error(`Failed to parse PowerShell output: ${parseError}`);
      }

      // Handle single result (not an array)
      if (!Array.isArray(processes)) {
        processes = [processes];
      }

      return processes.map((proc: any) => ({
        name: proc.Name || '',
        pid: proc.PID || 0,
        title: proc.Title || '',
        mainWindowHandle: proc.MainWindowHandle ? proc.MainWindowHandle.toString() : undefined
      }));

    } catch (error) {
      throw new Error(`PowerShell Get-Process failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Start a process using Start-Process
   */
  async startProcess(processName: string, args: string[] = [], elevated: boolean = false): Promise<{ success: boolean; pid?: number; error?: string }> {
    if (!this.isWindows) {
      throw new Error('PowerShell Start-Process only available on Windows');
    }

    try {
      const argsString = args.length > 0 ? `-ArgumentList "${args.join('", "')}"` : '';
      const verbString = elevated ? '-Verb RunAs' : '';
      const passThruString = '-PassThru';

      const command = `${this.powerShellCommand} -Command "
        try {
          $process = Start-Process -FilePath '${processName}' ${argsString} ${verbString} ${passThruString} -ErrorAction Stop
          @{
            success = $true
            pid = $process.Id
          } | ConvertTo-Json
        } catch {
          @{
            success = $false
            error = $_.Exception.Message
          } | ConvertTo-Json
        }
      "`;

      const { stdout, stderr } = await execAsync(command, { timeout: 15000 });
      
      if (stderr && stderr.trim()) {
        console.warn('PowerShell Start-Process warning:', stderr.trim());
      }

      const result = JSON.parse(stdout);
      
      return {
        success: result.success || false,
        pid: result.pid || undefined,
        error: result.error || undefined
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Focus a window by process name using Windows API calls
   */
  async focusWindowByProcessName(processName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isWindows) {
      throw new Error('Window focusing only available on Windows');
    }

    try {
      const command = `${this.powerShellCommand} -Command "
        try {
          Add-Type -TypeDefinition '
            using System;
            using System.Runtime.InteropServices;
            public class Win32 {
              [DllImport(\"user32.dll\")]
              public static extern bool SetForegroundWindow(IntPtr hWnd);
              [DllImport(\"user32.dll\")]
              public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
              [DllImport(\"user32.dll\")]
              public static extern bool IsIconic(IntPtr hWnd);
            }
          ' -ErrorAction SilentlyContinue

          $processes = Get-Process -Name '*${processName}*' -ErrorAction Stop | Where-Object {$_.MainWindowTitle -ne ''}
          
          if ($processes) {
            $process = $processes | Select-Object -First 1
            $hwnd = $process.MainWindowHandle
            
            if ([Win32]::IsIconic($hwnd)) {
              [Win32]::ShowWindow($hwnd, 9) # SW_RESTORE
            }
            
            $result = [Win32]::SetForegroundWindow($hwnd)
            
            @{
              success = $result
              processName = $process.ProcessName
              title = $process.MainWindowTitle
              pid = $process.Id
            } | ConvertTo-Json
          } else {
            @{
              success = $false
              error = 'Process not found or has no main window'
            } | ConvertTo-Json
          }
        } catch {
          @{
            success = $false
            error = $_.Exception.Message
          } | ConvertTo-Json
        }
      "`;

      const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
      
      if (stderr && stderr.trim()) {
        console.warn('PowerShell focus warning:', stderr.trim());
      }

      const result = JSON.parse(stdout);
      
      return {
        success: result.success || false,
        error: result.error || undefined
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get detailed process information by name or PID
   */
  async getProcessDetails(identifier: string | number): Promise<WindowsProcess | null> {
    if (!this.isWindows) {
      throw new Error('Process details only available on Windows');
    }

    try {
      const isNumeric = typeof identifier === 'number' || !isNaN(Number(identifier));
      const filter = isNumeric 
        ? `$_.Id -eq ${identifier}`
        : `$_.ProcessName -like '*${identifier}*'`;

      const command = `${this.powerShellCommand} -Command "
        Get-Process | Where-Object {${filter} -and $_.MainWindowTitle -ne ''} | 
        Select-Object -First 1 @{Name='Name';Expression={$_.ProcessName}}, 
                     @{Name='PID';Expression={$_.Id}}, 
                     @{Name='Title';Expression={$_.MainWindowTitle}},
                     @{Name='MainWindowHandle';Expression={$_.MainWindowHandle}} |
        ConvertTo-Json
      "`;

      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && stderr.trim()) {
        console.warn('PowerShell process details warning:', stderr.trim());
      }

      if (!stdout || stdout.trim() === 'null' || stdout.trim() === '') {
        return null;
      }

      const process = JSON.parse(stdout);
      
      return {
        name: process.Name || '',
        pid: process.PID || 0,
        title: process.Title || '',
        mainWindowHandle: process.MainWindowHandle ? process.MainWindowHandle.toString() : undefined
      };

    } catch (error) {
      throw new Error(`Failed to get process details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export singleton instance
export const powerShellIntegration = PowerShellIntegration.getInstance();