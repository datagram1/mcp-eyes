/**
 * Compatibility layer for nut-js fork differences
 * Maps deprecated or missing APIs to available alternatives
 */

import {
  mouse,
  keyboard,
  screen,
  clipboard,
  Point,
  Button,
  Key,
  Region,
  Size,
  straightTo,
  centerOf,
  sleep
} from '@nut-tree-fork/nut-js';

// Type definitions for compatibility
export interface WindowCompat {
  title: string;
  region: Region;
  minimize?: () => Promise<void>;
  restore?: () => Promise<void>;
  resize?: (size: Size) => Promise<void>;
  move?: (point: Point) => Promise<void>;
}

// Stub implementations for missing window management functions
export async function getActiveWindow(): Promise<WindowCompat> {
  // Return a mock window object
  // In production, this would need platform-specific implementation
  console.warn('getActiveWindow is not available in this nut-js fork version');
  return {
    title: 'Active Window',
    region: new Region(0, 0, 1920, 1080)
  };
}

export async function getWindows(): Promise<WindowCompat[]> {
  // Return empty array as placeholder
  console.warn('getWindows is not available in this nut-js fork version');
  return [];
}

// Platform-specific window management using AppleScript (macOS)
export async function resizeWindowMacOS(width: number, height: number, windowTitle?: string): Promise<void> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const script = windowTitle
    ? `tell application "System Events" to tell (first process whose frontmost is true) to set size of front window to {${width}, ${height}}`
    : `tell application "System Events" to tell process "${windowTitle}" to set size of front window to {${width}, ${height}}`;

  try {
    await execAsync(`osascript -e '${script}'`);
  } catch (error) {
    throw new Error(`Failed to resize window: ${error}`);
  }
}

export async function moveWindowMacOS(x: number, y: number, windowTitle?: string): Promise<void> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const script = windowTitle
    ? `tell application "System Events" to tell (first process whose frontmost is true) to set position of front window to {${x}, ${y}}`
    : `tell application "System Events" to tell process "${windowTitle}" to set position of front window to {${x}, ${y}}`;

  try {
    await execAsync(`osascript -e '${script}'`);
  } catch (error) {
    throw new Error(`Failed to move window: ${error}`);
  }
}

export async function minimizeWindowMacOS(windowTitle?: string): Promise<void> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const script = windowTitle
    ? `tell application "System Events" to tell (first process whose frontmost is true) to set miniaturized of front window to true`
    : `tell application "System Events" to tell process "${windowTitle}" to set miniaturized of front window to true`;

  try {
    await execAsync(`osascript -e '${script}'`);
  } catch (error) {
    throw new Error(`Failed to minimize window: ${error}`);
  }
}

export async function restoreWindowMacOS(windowTitle?: string): Promise<void> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const script = windowTitle
    ? `tell application "System Events" to tell (first process whose frontmost is true) to set miniaturized of front window to false`
    : `tell application "System Events" to tell process "${windowTitle}" to set miniaturized of front window to false`;

  try {
    await execAsync(`osascript -e '${script}'`);
  } catch (error) {
    throw new Error(`Failed to restore window: ${error}`);
  }
}

// Re-export everything from the original nut-js
export {
  mouse,
  keyboard,
  screen,
  clipboard,
  Point,
  Button,
  Key,
  Region,
  Size,
  straightTo,
  centerOf,
  sleep
};