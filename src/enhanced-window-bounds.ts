#!/usr/bin/env node

import { run } from '@jxa/run';

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ApplicationInfo {
  name: string;
  bundleId: string;
  pid: number;
  bounds: WindowBounds;
  isVisible: boolean;
  isMinimized: boolean;
  displayId: number;
}

export class EnhancedWindowBoundsHelper {
  
  /**
   * Get accurate window bounds for a specific application
   * This fixes the issue where bounds were showing as (0,0,0,0)
   */
  static async getApplicationBounds(appName: string, pid?: number): Promise<WindowBounds | null> {
    try {
      const result = await run((appName: string, pid?: number) => {
        // @ts-ignore
        const systemEvents = Application("System Events");
        
        // Find the process by name or PID
        let process;
        if (pid) {
          process = systemEvents.processes.byId(pid);
        } else {
          process = systemEvents.processes.byName(appName);
        }
        
        if (!process) {
          return null;
        }
        
        // Get the main window
        const windows = process.windows();
        if (!windows || windows.length === 0) {
          return null;
        }
        
        const mainWindow = windows[0];
        
        // Get position and size
        const position = mainWindow.position();
        const size = mainWindow.size();
        
        return {
          x: position[0],
          y: position[1],
          width: size[0],
          height: size[1]
        };
      }, appName, pid);
      
      return result as WindowBounds | null;
    } catch (error) {
      console.error(`Failed to get bounds for ${appName}:`, error);
      return null;
    }
  }
  
  /**
   * Get comprehensive application information including bounds
   */
  static async getApplicationInfo(appName: string): Promise<ApplicationInfo | null> {
    try {
      const result = await run((appName: string) => {
        // @ts-ignore
        const systemEvents = Application("System Events");
        const process = systemEvents.processes.byName(appName);
        
        if (!process) {
          return null;
        }
        
        const windows = process.windows();
        if (!windows || windows.length === 0) {
          return {
            name: appName,
            bundleId: process.bundleIdentifier ? process.bundleIdentifier() : '',
            pid: process.unixId(),
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            isVisible: false,
            isMinimized: true,
            displayId: 0
          };
        }
        
        const mainWindow = windows[0];
        const position = mainWindow.position();
        const size = mainWindow.size();
        
        // Determine display ID based on position
        let displayId = 0;
        if (position[0] > 1920 || position[1] > 1080) {
          displayId = 1; // Secondary display
        }
        
        return {
          name: appName,
          bundleId: process.bundleIdentifier ? process.bundleIdentifier() : '',
          pid: process.unixId(),
          bounds: {
            x: position[0],
            y: position[1],
            width: size[0],
            height: size[1]
          },
          isVisible: true,
          isMinimized: false,
          displayId
        };
      }, appName);
      
      return result as ApplicationInfo | null;
    } catch (error) {
      console.error(`Failed to get application info for ${appName}:`, error);
      return null;
    }
  }
  
  /**
   * Ensure application window is visible and get accurate bounds
   */
  static async ensureWindowVisible(appName: string): Promise<WindowBounds | null> {
    try {
      const result = await run((appName: string) => {
        // @ts-ignore
        const app = Application(appName);
        app.activate();
        
        // Wait a moment for activation (handled by run function)
        
        // @ts-ignore
        const systemEvents = Application("System Events");
        const process = systemEvents.processes.byName(appName);
        
        if (!process) {
          return null;
        }
        
        const windows = process.windows();
        if (!windows || windows.length === 0) {
          return null;
        }
        
        const mainWindow = windows[0];
        
        // Ensure window is not minimized
        if (mainWindow.minimized && mainWindow.minimized()) {
          mainWindow.minimized = false;
          // Wait handled by run function
        }
        
        // Get fresh bounds after ensuring visibility
        const position = mainWindow.position();
        const size = mainWindow.size();
        
        return {
          x: position[0],
          y: position[1],
          width: size[0],
          height: size[1]
        };
      }, appName);
      
      return result as WindowBounds | null;
    } catch (error) {
      console.error(`Failed to ensure window visible for ${appName}:`, error);
      return null;
    }
  }
  
  /**
   * Move window to primary display and get bounds
   */
  static async moveToPrimaryDisplay(appName: string): Promise<WindowBounds | null> {
    try {
      const result = await run((appName: string) => {
        // @ts-ignore
        const app = Application(appName);
        app.activate();
        
        // @ts-ignore
        const systemEvents = Application("System Events");
        const process = systemEvents.processes.byName(appName);
        
        if (!process) {
          return null;
        }
        
        const windows = process.windows();
        if (!windows || windows.length === 0) {
          return null;
        }
        
        const mainWindow = windows[0];
        
        // Move to primary display (assuming 1920x1080 primary display)
        mainWindow.position = [100, 100];
        
        // Wait for movement to complete (handled by run function)
        
        // Get fresh bounds
        const position = mainWindow.position();
        const size = mainWindow.size();
        
        return {
          x: position[0],
          y: position[1],
          width: size[0],
          height: size[1]
        };
      }, appName);
      
      return result as WindowBounds | null;
    } catch (error) {
      console.error(`Failed to move window to primary display for ${appName}:`, error);
      return null;
    }
  }
  
  /**
   * Get all visible applications with accurate bounds
   */
  static async getAllVisibleApplications(): Promise<ApplicationInfo[]> {
    try {
      const result = await run(() => {
        // @ts-ignore
        const systemEvents = Application("System Events");
        const processes = systemEvents.applicationProcesses();
        
        const applications: ApplicationInfo[] = [];
        
        processes.forEach((process: any) => {
          const windows = process.windows();
          if (windows && windows.length > 0) {
            const mainWindow = windows[0];
            const position = mainWindow.position();
            const size = mainWindow.size();
            
            // Only include windows with valid bounds
            if (size[0] > 0 && size[1] > 0) {
              let displayId = 0;
              if (position[0] > 1920 || position[1] > 1080) {
                displayId = 1;
              }
              
              applications.push({
                name: process.name(),
                bundleId: process.bundleIdentifier ? process.bundleIdentifier() : '',
                pid: process.unixId(),
                bounds: {
                  x: position[0],
                  y: position[1],
                  width: size[0],
                  height: size[1]
                },
                isVisible: true,
                isMinimized: mainWindow.minimized ? mainWindow.minimized() : false,
                displayId
              });
            }
          }
        });
        
        return applications;
      });
      
      return result as ApplicationInfo[];
    } catch (error) {
      console.error('Failed to get all visible applications:', error);
      return [];
    }
  }
  
  /**
   * Validate window bounds and fix if necessary
   */
  static async validateAndFixBounds(appName: string): Promise<WindowBounds | null> {
    try {
      // First try to get current bounds
      let bounds = await this.getApplicationBounds(appName);
      
      // If bounds are invalid (0,0,0,0), try to fix them
      if (!bounds || (bounds.width === 0 && bounds.height === 0)) {
        console.log(`Invalid bounds for ${appName}, attempting to fix...`);
        
        // Ensure window is visible
        bounds = await this.ensureWindowVisible(appName);
        
        // If still invalid, move to primary display
        if (!bounds || (bounds.width === 0 && bounds.height === 0)) {
          console.log(`Still invalid bounds for ${appName}, moving to primary display...`);
          bounds = await this.moveToPrimaryDisplay(appName);
        }
      }
      
      // Final validation
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        console.log(`Valid bounds for ${appName}: ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`);
        return bounds;
      } else {
        console.error(`Could not get valid bounds for ${appName}`);
        return null;
      }
    } catch (error) {
      console.error(`Failed to validate and fix bounds for ${appName}:`, error);
      return null;
    }
  }
}

export default EnhancedWindowBoundsHelper;
