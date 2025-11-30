/**
 * Custom JXA Runner for MCP-Eyes
 *
 * Provides a replacement for @jxa/run that properly inherits the process environment
 * and handles subprocess permission issues with macOS Accessibility.
 */

import { execFile, spawn, SpawnOptions } from 'child_process';

// JXA global declarations (available in osascript runtime, not TypeScript)
declare const Application: any;
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

const DEFAULT_MAX_BUFFER = 1000 * 1000 * 100; // 100MB

interface RunOptions {
  timeout?: number;
  maxBuffer?: number;
}

/**
 * Execute raw JXA code string
 */
export async function runJXACode(jxaCode: string, options: RunOptions = {}): Promise<any> {
  return executeInOsa(jxaCode, [], options);
}

/**
 * Execute a JXA function with arguments (compatible with @jxa/run API)
 */
export async function run<T extends (...args: any[]) => any>(
  jxaCodeFunction: T,
  ...args: Parameters<T>
): Promise<ReturnType<T>> {
  const code = `
ObjC.import('stdlib');
var args = JSON.parse($.getenv('OSA_ARGS'));
var fn = (${jxaCodeFunction.toString()});
var out = fn.apply(null, args);
JSON.stringify({ result: out });
`;
  return executeInOsa(code, args);
}

/**
 * Execute AppleScript code (alternative to JXA that may have better permission handling)
 */
export async function runAppleScript(appleScriptCode: string): Promise<string> {
  try {
    const { stdout } = await execFilePromise('/usr/bin/osascript', ['-e', appleScriptCode], {
      env: { ...process.env },
      maxBuffer: DEFAULT_MAX_BUFFER,
    });
    return stdout.trim();
  } catch (error: any) {
    throw new Error(`AppleScript execution failed: ${error.message}`);
  }
}

/**
 * Execute JXA code using osascript with full environment inheritance
 */
async function executeInOsa(code: string, args: any[], options: RunOptions = {}): Promise<any> {
  const { timeout = 30000, maxBuffer = DEFAULT_MAX_BUFFER } = options;

  // Try multiple methods in order of preference
  const methods = [
    () => executeWithExecFile(code, args, timeout, maxBuffer),
    () => executeWithSpawn(code, args, timeout),
    () => executeWithShell(code, args, timeout),
  ];

  let lastError: Error | null = null;

  for (const method of methods) {
    try {
      return await method();
    } catch (error: any) {
      lastError = error;
      // If it's a permission error, try the next method
      if (error.message?.includes('-25211') || error.message?.includes('assistive access')) {
        continue;
      }
      // For other errors, throw immediately
      throw error;
    }
  }

  // If all methods failed, throw the last error with helpful context
  throw new Error(
    `All JXA execution methods failed. Last error: ${lastError?.message}\n\n` +
    `To fix Accessibility permissions:\n` +
    `1. Open System Settings → Privacy & Security → Accessibility\n` +
    `2. Add your terminal app (iTerm, Terminal, etc.)\n` +
    `3. If using VS Code or another IDE, add that instead\n` +
    `4. Restart the application after granting permissions`
  );
}

/**
 * Method 1: execFile with full environment (most reliable when permissions are correct)
 */
async function executeWithExecFile(
  code: string,
  args: any[],
  timeout: number,
  maxBuffer: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript'],
      {
        env: {
          ...process.env,
          OSA_ARGS: JSON.stringify(args),
        },
        maxBuffer,
        timeout,
      },
      (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(`execFile: ${err.message}${stderr ? `\nStderr: ${stderr}` : ''}`));
        }
        if (stderr) {
          console.error('[JXA stderr]', stderr);
        }
        if (!stdout) {
          return resolve(undefined);
        }
        try {
          const result = JSON.parse(stdout.toString().trim()).result;
          resolve(result);
        } catch {
          resolve(stdout.toString().trim());
        }
      }
    );

    child.stdin?.write(code);
    child.stdin?.end();
  });
}

/**
 * Method 2: spawn with inherited stdio (may help with permission inheritance)
 */
async function executeWithSpawn(code: string, args: any[], timeout: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const spawnOptions: SpawnOptions = {
      env: {
        ...process.env,
        OSA_ARGS: JSON.stringify(args),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    const child = spawn('/usr/bin/osascript', ['-l', 'JavaScript'], spawnOptions);

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`spawn: Execution timed out after ${timeout}ms`));
    }, timeout);

    child.on('close', (exitCode) => {
      clearTimeout(timeoutId);

      if (exitCode !== 0) {
        return reject(new Error(`spawn: Process exited with code ${exitCode}${stderr ? `\nStderr: ${stderr}` : ''}`));
      }

      if (stderr) {
        console.error('[JXA stderr]', stderr);
      }

      if (!stdout) {
        return resolve(undefined);
      }

      try {
        const result = JSON.parse(stdout.trim()).result;
        resolve(result);
      } catch {
        resolve(stdout.trim());
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`spawn: ${err.message}`));
    });

    child.stdin?.write(code);
    child.stdin?.end();
  });
}

/**
 * Method 3: Execute via shell (last resort, may inherit shell permissions)
 */
async function executeWithShell(code: string, args: any[], timeout: number): Promise<any> {
  return new Promise((resolve, reject) => {
    // Escape the code for shell
    const escapedCode = code.replace(/'/g, "'\\''");

    const spawnOptions: SpawnOptions = {
      env: {
        ...process.env,
        OSA_ARGS: JSON.stringify(args),
      },
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    const child = spawn(
      `echo '${escapedCode}' | /usr/bin/osascript -l JavaScript`,
      [],
      spawnOptions
    );

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`shell: Execution timed out after ${timeout}ms`));
    }, timeout);

    child.on('close', (exitCode) => {
      clearTimeout(timeoutId);

      if (exitCode !== 0) {
        return reject(new Error(`shell: Process exited with code ${exitCode}${stderr ? `\nStderr: ${stderr}` : ''}`));
      }

      if (stderr) {
        console.error('[JXA stderr]', stderr);
      }

      if (!stdout) {
        return resolve(undefined);
      }

      try {
        const result = JSON.parse(stdout.trim()).result;
        resolve(result);
      } catch {
        resolve(stdout.trim());
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`shell: ${err.message}`));
    });
  });
}

/**
 * Check if Accessibility permissions are likely available
 */
export async function checkAccessibilityPermissions(): Promise<{
  hasPermission: boolean;
  error?: string;
  suggestion?: string;
}> {
  try {
    // Simple test: try to get list of running apps
    await run(() => {
      const systemEvents = Application('System Events');
      return systemEvents.applicationProcesses().length;
    });
    return { hasPermission: true };
  } catch (error: any) {
    const errorMessage = error.message || String(error);

    if (errorMessage.includes('-25211') || errorMessage.includes('assistive access')) {
      return {
        hasPermission: false,
        error: 'Accessibility permission denied',
        suggestion:
          'Grant Accessibility permission to your terminal app:\n' +
          '1. Open System Settings → Privacy & Security → Accessibility\n' +
          '2. Click + and add your terminal (iTerm, Terminal.app, VS Code, etc.)\n' +
          '3. Ensure the checkbox is enabled\n' +
          '4. Restart your terminal and Claude Code',
      };
    }

    return {
      hasPermission: false,
      error: errorMessage,
      suggestion: 'Unknown error - check macOS Console for more details',
    };
  }
}

/**
 * Get a list of all running applications using a simpler method that might work
 * without full Accessibility permissions
 */
export async function getRunningAppsSimple(): Promise<Array<{ name: string; bundleId: string }>> {
  try {
    // Try using NSWorkspace which may have fewer permission requirements
    const result = await runJXACode(`
      ObjC.import('AppKit');
      const apps = $.NSWorkspace.sharedWorkspace.runningApplications;
      const appList = [];
      for (let i = 0; i < apps.count; i++) {
        const app = apps.objectAtIndex(i);
        const name = ObjC.unwrap(app.localizedName);
        const bundleId = ObjC.unwrap(app.bundleIdentifier);
        if (name && bundleId) {
          appList.push({ name: name, bundleId: bundleId });
        }
      }
      JSON.stringify(appList);
    `);
    return JSON.parse(result);
  } catch (error) {
    // Fallback to AppleScript which might work differently
    try {
      const appleScriptResult = await runAppleScript(`
        tell application "System Events"
          set appList to ""
          repeat with proc in (every process)
            set appList to appList & name of proc & "|" & bundle identifier of proc & "\\n"
          end repeat
        end tell
        return appList
      `);

      return appleScriptResult
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [name, bundleId] = line.split('|');
          return { name: name?.trim() || '', bundleId: bundleId?.trim() || '' };
        })
        .filter(app => app.name && app.bundleId);
    } catch {
      throw error;
    }
  }
}

export default run;
