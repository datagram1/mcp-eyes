#!/usr/bin/env node

import { execSync } from 'child_process';
import { logger } from './logger.js';

export interface PermissionStatus {
  screen: 'authorized' | 'denied' | 'not-determined';
  accessibility: 'authorized' | 'denied' | 'not-determined';
  nodePath: string;
  needsSymlink: boolean;
}

export class PermissionHelper {
  private static instance: PermissionHelper;
  private nodePath: string;
  private needsSymlink: boolean = false;

  private constructor() {
    this.nodePath = this.findNodePath();
    this.needsSymlink = this.checkIfNeedsSymlink();
  }

  public static getInstance(): PermissionHelper {
    if (!PermissionHelper.instance) {
      PermissionHelper.instance = new PermissionHelper();
    }
    return PermissionHelper.instance;
  }

  private findNodePath(): string {
    try {
      return execSync('which node', { encoding: 'utf8' }).trim();
    } catch (error) {
      logger.error('Could not find Node.js executable', { error: (error as Error).message });
      return '';
    }
  }

  private checkIfNeedsSymlink(): boolean {
    // Check if Node.js is in a hidden directory (starts with .)
    return this.nodePath.includes('/.');
  }

  public async checkPermissions(): Promise<PermissionStatus> {
    const screen = await this.checkScreenPermission();
    const accessibility = await this.checkAccessibilityPermission();

    return {
      screen,
      accessibility,
      nodePath: this.nodePath,
      needsSymlink: this.needsSymlink
    };
  }

  private async checkScreenPermission(): Promise<'authorized' | 'denied' | 'not-determined'> {
    try {
      // Try to take a screenshot to test screen recording permission
      // @ts-ignore - screenshot-desktop doesn't have type definitions
      const screenshotModule = await import('screenshot-desktop');
      const screenshot = screenshotModule.default || screenshotModule.screenshotDesktop;
      
      if (typeof screenshot !== 'function') {
        logger.warn('Screenshot function not found in screenshot-desktop module');
        return 'denied';
      }
      
      const result = await screenshot();
      
      // Check if we got a valid image buffer
      if (result && result.length > 0) {
        logger.info('Screen recording permission check successful', { 
          imageSize: result.length,
          imageType: typeof result 
        });
        return 'authorized';
      } else {
        logger.warn('Screenshot returned empty result');
        return 'denied';
      }
    } catch (error) {
      logger.warn('Screen recording permission check failed', { error: (error as Error).message });
      return 'denied';
    }
  }

  private async checkAccessibilityPermission(): Promise<'authorized' | 'denied' | 'not-determined'> {
    try {
      // Try to use AppleScript to test accessibility permission
      const result = execSync('osascript -e "tell application \\"System Events\\" to get name of every process"', {
        encoding: 'utf8',
        timeout: 5000
      });
      
      if (result && result.trim().length > 0) {
        return 'authorized';
      }
      return 'denied';
    } catch (error) {
      logger.warn('Accessibility permission check failed', { error: (error as Error).message });
      return 'denied';
    }
  }

  public generatePermissionInstructions(): string {
    const instructions = [];
    
    if (this.needsSymlink) {
      instructions.push(`
🔧 ACCESSIBILITY PERMISSIONS SETUP REQUIRED

Your Node.js installation is in a hidden directory (${this.nodePath}), which macOS prevents from being added to accessibility permissions through the GUI.

SOLUTION: Run the setup script to create a visible symlink:

  ./setup-permissions.sh

This script will:
1. Create a visible symlink to your Node.js executable
2. Open System Settings to the accessibility section
3. Guide you through adding the symlink to permissions

ALTERNATIVE: Manual setup
1. Run: sudo ln -s "${this.nodePath}" /usr/local/bin/node-mcp-eyes
2. Open System Settings → Privacy & Security → Accessibility
3. Add /usr/local/bin/node-mcp-eyes to the list
`);
    } else {
      instructions.push(`
✅ Node.js is in a visible directory: ${this.nodePath}
You can add it directly through System Settings → Privacy & Security → Accessibility
`);
    }

    return instructions.join('\n');
  }

  public async createSymlink(): Promise<boolean> {
    if (!this.needsSymlink) {
      logger.info('No symlink needed - Node.js is already visible');
      return true;
    }

    try {
      const symlinkPath = '/usr/local/bin/node-mcp-eyes';
      
      // Remove existing symlink if it exists
      try {
        execSync(`sudo rm "${symlinkPath}"`, { stdio: 'ignore' });
      } catch (error) {
        // Ignore if symlink doesn't exist
      }

      // Create new symlink
      execSync(`sudo ln -s "${this.nodePath}" "${symlinkPath}"`);
      
      // Set executable permissions
      execSync(`sudo chmod +x "${symlinkPath}"`);
      
      logger.info('Created symlink for accessibility permissions', {
        symlinkPath,
        targetPath: this.nodePath
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to create symlink', { error: (error as Error).message });
      return false;
    }
  }

  public openSystemSettings(): void {
    try {
      // Open System Settings to accessibility section
      execSync('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"');
      logger.info('Opened System Settings to accessibility section');
    } catch (error) {
      logger.error('Failed to open System Settings', { error: (error as Error).message });
    }
  }

  public openSymlinkDirectory(): void {
    try {
      execSync('open /usr/local/bin/');
      logger.info('Opened /usr/local/bin/ directory');
    } catch (error) {
      logger.error('Failed to open symlink directory', { error: (error as Error).message });
    }
  }
}

export const permissionHelper = PermissionHelper.getInstance();
