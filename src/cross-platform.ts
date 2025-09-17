#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { mouse, Point } from '@nut-tree-fork/nut-js';
// @ts-ignore
import screenshot from 'screenshot-desktop';
import sharp from 'sharp';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getWindowBoundsAppleScript } from './window-bounds-helper';
import { powerShellIntegration, WindowsProcess, AdminRights } from './powershell-integration';

const execAsync = promisify(exec);

interface Application {
  name: string;
  bundleId?: string;
  pid: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Platform = 'macos' | 'windows' | 'linux';

class CrossPlatformGUIControlServer {
  private server: Server;
  private currentApp: Application | null = null;
  private platform: Platform;

  constructor() {
    this.platform = this.detectPlatform();
    this.server = new Server({
      name: 'cross-platform-gui-control',
      version: '1.0.0',
    });

    this.setupToolHandlers();
  }

  private detectPlatform(): Platform {
    const platform = os.platform();
    switch (platform) {
      case 'darwin':
        return 'macos';
      case 'win32':
        return 'windows';
      case 'linux':
        return 'linux';
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'listApplications',
            description: `List all running applications with their window bounds (${this.platform})`,
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'focusApplication',
            description: 'Focus on a specific application by name, bundle ID, or PID',
            inputSchema: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Application name, bundle ID, or PID to focus',
                },
              },
              required: ['identifier'],
            },
          },
          {
            name: 'click',
            description: 'Perform a mouse click at specified coordinates relative to the focused app window',
            inputSchema: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate relative to the app window (0-1 normalized)',
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate relative to the app window (0-1 normalized)',
                },
                button: {
                  type: 'string',
                  enum: ['left', 'right', 'middle'],
                  description: 'Mouse button to click',
                  default: 'left',
                },
              },
              required: ['x', 'y'],
            },
          },
          {
            name: 'moveMouse',
            description: 'Move mouse to specified coordinates relative to the focused app window',
            inputSchema: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate relative to the app window (0-1 normalized)',
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate relative to the app window (0-1 normalized)',
                },
              },
              required: ['x', 'y'],
            },
          },
          {
            name: 'screenshot',
            description: 'Take a screenshot of the focused application window',
            inputSchema: {
              type: 'object',
              properties: {
                padding: {
                  type: 'number',
                  description: 'Padding around the window in pixels',
                  default: 10,
                },
              },
            },
          },
          {
            name: 'screenshotFullScreen',
            description: 'Take a screenshot of the entire screen',
            inputSchema: {
              type: 'object',
              properties: {
                format: {
                  type: 'string',
                  enum: ['png', 'jpg'],
                  description: 'Image format',
                  default: 'png',
                },
                quality: {
                  type: 'number',
                  description: 'JPEG quality (1-100)',
                  default: 90,
                },
              },
            },
          },
          {
            name: 'screenshotRegion',
            description: 'Take a screenshot of a specific screen region',
            inputSchema: {
              type: 'object',
              properties: {
                x: {
                  type: 'number',
                  description: 'X coordinate of the region',
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate of the region',
                },
                width: {
                  type: 'number',
                  description: 'Width of the region',
                },
                height: {
                  type: 'number',
                  description: 'Height of the region',
                },
                format: {
                  type: 'string',
                  enum: ['png', 'jpg'],
                  description: 'Image format',
                  default: 'png',
                },
                quality: {
                  type: 'number',
                  description: 'JPEG quality (1-100)',
                  default: 90,
                },
              },
              required: ['x', 'y', 'width', 'height'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'listApplications':
            return await this.listApplications();
          case 'focusApplication':
            return await this.focusApplication(args?.identifier as string);
          case 'click':
            return await this.click(args?.x as number, args?.y as number, (args?.button as string) || 'left');
          case 'moveMouse':
            return await this.moveMouse(args?.x as number, args?.y as number);
          case 'screenshot':
            return await this.screenshot((args?.padding as number) || 10);
          case 'screenshotFullScreen':
            return await this.screenshotFullScreen((args?.format as string) || 'png', (args?.quality as number) || 90);
          case 'screenshotRegion':
            return await this.screenshotRegion(
              args?.x as number,
              args?.y as number,
              args?.width as number,
              args?.height as number,
              (args?.format as string) || 'png',
              (args?.quality as number) || 90
            );
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async checkPermissions(): Promise<void> {
    switch (this.platform) {
      case 'macos':
        await this.checkMacOSPermissions();
        break;
      case 'windows':
        await this.checkWindowsPermissions();
        break;
      case 'linux':
        await this.checkLinuxPermissions();
        break;
    }
  }

  private async checkMacOSPermissions(): Promise<void> {
    try {
      // @ts-ignore
      const permissions = await import('node-mac-permissions');
      const screenRecording = permissions.getAuthStatus('screen');
      const accessibility = permissions.getAuthStatus('accessibility');

      if (screenRecording !== 'authorized') {
        throw new Error(
          'Screen Recording permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording.'
        );
      }

      if (accessibility !== 'authorized') {
        throw new Error(
          'Accessibility permission is required. Please grant permission in System Preferences > Security & Privacy > Privacy > Accessibility.'
        );
      }
    } catch (error) {
      console.warn('Could not check macOS permissions:', error);
    }
  }

  private async checkWindowsPermissions(): Promise<void> {
    // Windows doesn't require explicit permissions for GUI automation
    // but we should check if we can access the desktop and PowerShell commands
    try {
      // Use the enhanced PowerShell integration to check admin rights
      const adminRights: AdminRights = await powerShellIntegration.checkAdminRights();
      
      if (adminRights.error && !adminRights.canAccessHKLM) {
        console.warn('Windows permissions warning:', adminRights.error);
      }
      
      // Test basic PowerShell functionality
      await execAsync('powershell.exe -Command "Get-Process | Select-Object -First 1"');
    } catch (error) {
      throw new Error('Windows permissions check failed. Make sure you have access to run PowerShell commands.');
    }
  }

  private async checkLinuxPermissions(): Promise<void> {
    // Linux requires X11 and wmctrl
    try {
      await execAsync('which wmctrl');
    } catch (error) {
      throw new Error('Linux requires wmctrl. Install with: sudo apt-get install wmctrl');
    }
  }

  private async listApplications(): Promise<any> {
    await this.checkPermissions();

    switch (this.platform) {
      case 'macos':
        return await this.listMacOSApplications();
      case 'windows':
        return await this.listWindowsApplications();
      case 'linux':
        return await this.listLinuxApplications();
    }
  }

  private async listMacOSApplications(): Promise<any> {
    try {
      // @ts-ignore
      const { run } = await import('@jxa/run');
      const apps = await run(() => {
        // @ts-ignore
        const apps = Application.runningApplications();
        return apps.map((app: any) => ({
          name: app.name(),
          bundleId: app.bundleIdentifier(),
          pid: app.processIdentifier(),
          bounds: { x: 0, y: 0, width: 0, height: 0 } // Will be populated with actual bounds
        }));
      });

      // Get actual window bounds for each application
      for (const app of apps as any[]) {
        const bounds = await getWindowBoundsAppleScript(app.name, app.pid);
        if (bounds) {
          app.bounds = bounds;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(apps, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`macOS app listing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async listWindowsApplications(): Promise<any> {
    try {
      // Use the enhanced PowerShell integration
      const processes: WindowsProcess[] = await powerShellIntegration.getProcesses();
      
      const apps = processes.map((proc: WindowsProcess) => ({
        name: proc.name,
        pid: proc.pid,
        title: proc.title,
        mainWindowHandle: proc.mainWindowHandle,
        bounds: { x: 0, y: 0, width: 0, height: 0 } // Windows doesn't easily provide bounds via PowerShell
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(apps, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Windows app listing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async listLinuxApplications(): Promise<any> {
    try {
      const { stdout } = await execAsync('wmctrl -l');
      const lines = stdout.trim().split('\n');
      
      const apps = lines.map((line: string) => {
        const parts = line.split(/\s+/);
        const windowId = parts[0];
        const desktop = parts[1];
        const title = parts.slice(3).join(' ');
        
        return {
          name: title,
          windowId: windowId,
          desktop: desktop,
          pid: 0, // wmctrl doesn't provide PID directly
          bounds: { x: 0, y: 0, width: 0, height: 0 } // Would need xwininfo for bounds
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(apps, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Linux app listing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async focusApplication(identifier: string): Promise<any> {
    await this.checkPermissions();

    switch (this.platform) {
      case 'macos':
        return await this.focusMacOSApplication(identifier);
      case 'windows':
        return await this.focusWindowsApplication(identifier);
      case 'linux':
        return await this.focusLinuxApplication(identifier);
    }
  }

  private async focusMacOSApplication(identifier: string): Promise<any> {
    try {
      // @ts-ignore
      const { run } = await import('@jxa/run');
      
      const apps = await run(() => {
        // @ts-ignore
        const apps = Application.runningApplications();
        return apps.map((app: any) => ({
          name: app.name(),
          bundleId: app.bundleIdentifier(),
          pid: app.processIdentifier(),
          bounds: app.bounds()
        }));
      }) as Application[];

      let targetApp: Application | undefined;
      
      // Try to find by bundle ID first
      targetApp = apps.find(app => app.bundleId === identifier);
      
      // If not found, try by PID
      if (!targetApp) {
        const pid = parseInt(identifier);
        if (!isNaN(pid)) {
          targetApp = apps.find(app => app.pid === pid);
        }
      }

      // If not found, try by name
      if (!targetApp) {
        targetApp = apps.find(app => app.name.toLowerCase().includes(identifier.toLowerCase()));
      }

      if (!targetApp) {
        throw new Error(`Application not found: ${identifier}`);
      }

      // Focus the application
      await run((bundleId: string) => {
        // @ts-ignore
        const app = Application(bundleId);
        app.activate();
      }, targetApp.bundleId);

      // Get actual window bounds after focusing
      const bounds = await getWindowBoundsAppleScript(targetApp.name, targetApp.pid);
      if (bounds) {
        targetApp.bounds = bounds;
      }

      this.currentApp = targetApp;

      return {
        content: [
          {
            type: 'text',
            text: `Focused on macOS application: ${targetApp.name} (${targetApp.bundleId})`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`macOS focus failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async focusWindowsApplication(identifier: string): Promise<any> {
    try {
      // First, try to get detailed process information
      const processDetails = await powerShellIntegration.getProcessDetails(identifier);
      
      if (!processDetails) {
        throw new Error(`Application not found: ${identifier}`);
      }

      // Use the enhanced PowerShell integration to focus the window
      const focusResult = await powerShellIntegration.focusWindowByProcessName(processDetails.name);
      
      if (!focusResult.success) {
        throw new Error(focusResult.error || 'Failed to focus window');
      }

      // Set the current app for coordinate mapping
      this.currentApp = {
        name: processDetails.name,
        pid: processDetails.pid,
        bounds: { x: 0, y: 0, width: 0, height: 0 } // Windows bounds would need additional WinAPI calls
      };

      return {
        content: [
          {
            type: 'text',
            text: `Focused on Windows application: ${processDetails.name} (PID: ${processDetails.pid}) - "${processDetails.title}"`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Windows focus failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async focusLinuxApplication(identifier: string): Promise<any> {
    try {
      // Use wmctrl to focus window
      const { stdout } = await execAsync(`wmctrl -a "${identifier}"`);
      
      this.currentApp = {
        name: identifier,
        pid: 0,
        bounds: { x: 0, y: 0, width: 0, height: 0 }
      };

      return {
        content: [
          {
            type: 'text',
            text: `Focused on Linux application: ${identifier}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Linux focus failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async click(x: number, y: number, button: string): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();

    // Convert normalized coordinates to absolute screen coordinates
    const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
    const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);

    await mouse.move([new Point(screenX, screenY)]);
    
    switch (button) {
      case 'left':
        await mouse.leftClick();
        break;
      case 'right':
        await mouse.rightClick();
        break;
      case 'middle':
        await mouse.scrollDown(0);
        break;
      default:
        throw new Error(`Invalid button: ${button}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Clicked ${button} button at (${x.toFixed(3)}, ${y.toFixed(3)}) relative to ${this.currentApp.name}`,
        },
      ],
    };
  }

  private async moveMouse(x: number, y: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();

    // Convert normalized coordinates to absolute screen coordinates
    const screenX = this.currentApp.bounds.x + (x * this.currentApp.bounds.width);
    const screenY = this.currentApp.bounds.y + (y * this.currentApp.bounds.height);

    await mouse.move([new Point(screenX, screenY)]);

    return {
      content: [
        {
          type: 'text',
          text: `Moved mouse to (${x.toFixed(3)}, ${y.toFixed(3)}) relative to ${this.currentApp.name}`,
        },
      ],
    };
  }

  private async screenshot(padding: number): Promise<any> {
    if (!this.currentApp) {
      throw new Error('No application focused. Use focusApplication first.');
    }

    await this.checkPermissions();

    // Take a full screen screenshot
    const fullScreenshot = await screenshot();

    // Calculate crop area with padding
    const cropX = Math.max(0, this.currentApp.bounds.x - padding);
    const cropY = Math.max(0, this.currentApp.bounds.y - padding);
    const cropWidth = this.currentApp.bounds.width + (padding * 2);
    const cropHeight = this.currentApp.bounds.height + (padding * 2);

    // Crop the screenshot using sharp
    const croppedBuffer = await sharp(fullScreenshot)
      .extract({
        left: cropX,
        top: cropY,
        width: cropWidth,
        height: cropHeight,
      })
      .png()
      .toBuffer();

    // Convert to base64
    const base64Image = croppedBuffer.toString('base64');

    return {
      content: [
        {
          type: 'text',
          text: `Screenshot of ${this.currentApp.name} window (${cropWidth}x${cropHeight}px with ${padding}px padding)`,
        },
        {
          type: 'image',
          data: base64Image,
          mimeType: 'image/png',
        },
      ],
    };
  }

  private async screenshotFullScreen(format: string, quality: number): Promise<any> {
    await this.checkPermissions();

    const fullScreenshot = await screenshot();
    
    let processedBuffer: Buffer;
    if (format === 'jpg') {
      processedBuffer = await sharp(fullScreenshot)
        .jpeg({ quality })
        .toBuffer();
    } else {
      processedBuffer = await sharp(fullScreenshot)
        .png()
        .toBuffer();
    }

    const base64Image = processedBuffer.toString('base64');

    return {
      content: [
        {
          type: 'text',
          text: `Full screen screenshot (${format.toUpperCase()})`,
        },
        {
          type: 'image',
          data: base64Image,
          mimeType: `image/${format}`,
        },
      ],
    };
  }

  private async screenshotRegion(x: number, y: number, width: number, height: number, format: string, quality: number): Promise<any> {
    await this.checkPermissions();

    const fullScreenshot = await screenshot();
    
    let processedBuffer: Buffer;
    if (format === 'jpg') {
      processedBuffer = await sharp(fullScreenshot)
        .extract({ left: x, top: y, width, height })
        .jpeg({ quality })
        .toBuffer();
    } else {
      processedBuffer = await sharp(fullScreenshot)
        .extract({ left: x, top: y, width, height })
        .png()
        .toBuffer();
    }

    const base64Image = processedBuffer.toString('base64');

    return {
      content: [
        {
          type: 'text',
          text: `Region screenshot (${width}x${height}px at ${x},${y})`,
        },
        {
          type: 'image',
          data: base64Image,
          mimeType: `image/${format}`,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Cross-platform GUI Control MCP server running on stdio (${this.platform})`);
  }
}

// Start the server
const server = new CrossPlatformGUIControlServer();
server.run().catch(console.error);
