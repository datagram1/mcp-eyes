# MCP-Eyes 🚀

**Professional cross-platform MCP server for GUI automation with advanced screenshot capabilities, multi-display
support, mouse/keyboard control, and AI assistant integration.**

[![npm version](https://badge.fury.io/js/mcp-eyes.svg)](https://badge.fury.io/js/mcp-eyes)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## 🌟 Features

- **5 Server Variants**: Choose the right tool for your needs
- **Cross-Platform Support**: macOS, Windows, and Linux
- **Advanced Screenshot Capabilities**: Window, region, multi-display, and full-screen capture
- **AI Assistant Integration**: Compatible with Cursor, Claude, and other MCP-compatible AI assistants
- **Multi-Display Support**: Handle complex multi-monitor setups
- **Natural Language Control**: Control GUI applications through natural language commands

## 🚀 Quick Start

### Installation

```bash
npm install -g mcp-eyes
```

### Usage

```bash
# Cross-platform server (recommended)
mcp-eyes mcp

# Basic macOS-only server
mcp-eyes-basic mcp

# Enhanced server with additional tools
mcp-eyes-enhanced mcp

# Advanced screenshot server
mcp-eyes-advanced mcp

# Full enhanced server (20+ tools)
mcp-eyes-full mcp
```

## 📋 Server Variants

### 1. Cross-Platform Server (Default)

**7 tools** - Universal compatibility across macOS, Windows, and Linux

- `listApplications` - Platform-specific app listing
- `focusApplication` - Platform-specific app focus
- `click` - Universal mouse clicks
- `moveMouse` - Universal mouse movement
- `screenshot` - Universal window screenshots
- `screenshotFullScreen` - Universal full screen capture
- `screenshotRegion` - Universal region screenshots

### 2. Basic Server

**5 tools** - Essential GUI automation for macOS

- `listApplications` - List running apps with window bounds
- `focusApplication` - Focus specific apps by bundle ID or PID
- `click` - Mouse clicks with normalized coordinates (0-1)
- `moveMouse` - Mouse movement with normalized coordinates
- `screenshot` - Window screenshots with padding

### 3. Enhanced Server

**10 tools** - Basic tools plus enhanced functionality

- All basic tools +
- `doubleClick` - Double-click operations
- `scrollMouse` - Mouse wheel scrolling
- `getMousePosition` - Current mouse position
- `wait` - Timing control
- `getScreenSize` - Screen dimensions

### 4. Advanced Screenshot Server

**12 tools** - Comprehensive screenshot and display management

- All basic tools +
- `listDisplays` - List all available displays
- `screenshotDisplay` - Screenshot specific display
- `screenshotAllDisplays` - Screenshot all displays simultaneously
- `screenshotRegion` - Screenshot specific screen region
- `screenshotWithTimestamp` - Screenshot with timestamped filename

### 5. Full Enhanced Server

**20+ tools** - Complete GUI automation suite

- All previous tools +
- Window management (resize, move, minimize, restore)
- Keyboard automation (type text, press keys)
- Advanced mouse (drag, scroll)
- Screen analysis (color detection, highlighting)
- Clipboard operations (copy/paste)

## 🖥️ Platform Support

### macOS

- **JXA Integration**: Native JavaScript for Automation
- **AppleScript Support**: System Events and UI Element access
- **Multi-Display**: Full support for multiple displays
- **Permissions**: Automatic screen recording and accessibility permission handling

### Windows

- **PowerShell Integration**: Native Windows process management
- **Administrator Rights**: Automatic detection and handling
- **Window Management**: Full window control capabilities

### Linux

- **wmctrl Integration**: X11 window management
- **X11 Support**: Native Linux GUI control
- **Process Management**: Comprehensive process listing and control

## 🔧 Configuration

### MCP Client Setup

Add to your MCP client configuration (e.g., Cursor's `mcp.json`):

#### Basic Configuration
```json
{
  "mcpServers": {
    "mcp-eyes": {
      "command": "mcp-eyes",
      "args": ["mcp"]
    }
  }
}
```

#### Auto-Install Configuration (Recommended)
This configuration automatically installs mcp-eyes via npx, similar to other MCP servers:

```json
{
  "mcpServers": {
    "mcp-eyes": {
      "command": "/opt/homebrew/bin/npx",
      "args": [
        "-y",
        "mcp-eyes"
      ],
      "env": {
        "DEBUG": "mcp:*"
      }
    },
    "mcp-eyes-basic": {
      "command": "/opt/homebrew/bin/npx",
      "args": [
        "-y",
        "mcp-eyes-basic"
      ],
      "env": {
        "DEBUG": "mcp:*"
      }
    },
    "mcp-eyes-enhanced": {
      "command": "/opt/homebrew/bin/npx",
      "args": [
        "-y",
        "mcp-eyes-enhanced"
      ],
      "env": {
        "DEBUG": "mcp:*"
      }
    },
    "mcp-eyes-advanced": {
      "command": "/opt/homebrew/bin/npx",
      "args": [
        "-y",
        "mcp-eyes-advanced"
      ],
      "env": {
        "DEBUG": "mcp:*"
      }
    },
    "mcp-eyes-full": {
      "command": "/opt/homebrew/bin/npx",
      "args": [
        "-y",
        "mcp-eyes-full"
      ],
      "env": {
        "DEBUG": "mcp:*"
      }
    },
    "mcp-eyes-cross-platform": {
      "command": "/opt/homebrew/bin/npx",
      "args": [
        "-y",
        "mcp-eyes-cross-platform"
      ],
      "env": {
        "DEBUG": "mcp:*"
      }
    }
  }
}
```

#### Cross-Platform Configuration
For Windows users, use the Windows npx path:

```json
{
  "mcpServers": {
    "mcp-eyes": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-eyes"
      ],
      "env": {
        "DEBUG": "mcp:*"
      }
    }
  }
}
```

#### Local Development Configuration
For local development, point directly to the built files:

```json
{
  "mcpServers": {
    "mcp-eyes-local": {
      "command": "node",
      "args": ["./dist/cross-platform.js"],
      "env": {
        "DEBUG": "mcp:*"
      }
    }
  }
}
```

### Environment Variables

```bash
# Optional: Set screenshot save directory
MCP_EYES_SCREENSHOT_DIR=/path/to/screenshots

# Optional: Set log level
MCP_EYES_LOG_LEVEL=info
```

## 📖 Usage Examples

### Basic Screenshot

```javascript
// Take a screenshot of the current focused application
await mcpClient.callTool('screenshot', { padding: 10 });
```

### Multi-Display Support

```javascript
// List all displays
const displays = await mcpClient.callTool('listDisplays', {});

// Screenshot specific display
await mcpClient.callTool('screenshotDisplay', { displayId: '1' });
```

### Application Control

```javascript
// List running applications
const apps = await mcpClient.callTool('listApplications', {});

// Focus specific application
await mcpClient.callTool('focusApplication', { identifier: 'com.apple.Safari' });

// Click at normalized coordinates
await mcpClient.callTool('click', { x: 0.5, y: 0.3 });
```

### Cross-Platform Example

```javascript
// Works on macOS, Windows, and Linux
await mcpClient.callTool('listApplications', {});
await mcpClient.callTool('focusApplication', { identifier: 'notepad' }); // Windows
await mcpClient.callTool('focusApplication', { identifier: 'firefox' }); // Linux
await mcpClient.callTool('click', { x: 0.5, y: 0.5 });
```

## 🛠️ Development

### Prerequisites

- Node.js >= 18.0.0
- TypeScript >= 5.0.0
- Platform-specific dependencies (see below)

### Installation

```bash
git clone https://github.com/datagram1/mcp-eyes.git
cd mcp-eyes
npm install
```

### Building

```bash
# Build all variants
npm run build:all

# Build specific variant
npm run build:cross-platform
npm run build:enhanced
npm run build:advanced
```

### Testing

```bash
# Test all variants
npm run test:all

# Test cross-platform functionality
npm run test:cross-platform

# Test specific fixes
npm run test:fixes

# Test coordinates functionality
npm run test:coordinates

# Test window bounds
npm run test:window-bounds

# Test PowerShell integration
npm run test:powershell

# Test Cursor integration
npm run test:cursor

# Test auto-fix functionality
npm run test:auto

# Test single task functionality
npm run test:single

# Run basic test
npm test
```

### Test File Organization

Test files are organized in the `TMP/test/` directory:
- `TMP/test/test.js` - Basic functionality test
- `TMP/test/test-all-versions.js` - Test all server variants
- `TMP/test/test-cross-platform.js` - Cross-platform compatibility test
- `TMP/test/test-coordinates.js` - Coordinate system tests
- `TMP/test/test-fixes.js` - Bug fix verification tests
- `TMP/test/test-window-bounds.js` - Window bounds functionality tests
- `TMP/test/test-powershell-integration.js` - Windows PowerShell integration tests
- `TMP/test/test-cursor-fix.js` - Cursor-specific fixes
- `TMP/test/test-auto-fix.js` - Auto-fix functionality tests
- `TMP/test/test-single-task.js` - Single task execution tests

Test screenshots are stored in `TMP/screenshots/` directory.

## 📋 Requirements

### macOS

- macOS 10.15+ (Catalina or later)
- Screen Recording permission
- Accessibility permission (for advanced features)

### Windows

- Windows 10/11
- PowerShell 5.1+ or PowerShell 7+
- Administrator rights (for some operations)

### Linux

- Ubuntu 18.04+ or equivalent
- wmctrl package: `sudo apt install wmctrl`
- X11 display server

## 🔒 Platform-Specific Setup & Permissions

### macOS Permissions & Setup

MCP-Eyes requires specific macOS permissions to function properly. These permissions are essential for GUI
automation and screenshot functionality.

#### Required Permissions

1. **Screen Recording Permission** (Critical)
   - Required for: Screenshots, window capture, display analysis
   - **How to grant**:

     ```bash
     # Open System Preferences via terminal
     open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
     ```

   - Manual steps:
     - System Preferences > Security & Privacy > Privacy > Screen Recording
     - Click the lock icon and enter your password
     - Check the box next to Terminal (if running from terminal) or your MCP client
     - Restart the application after granting permission

2. **Accessibility Permission** (For advanced features)
   - Required for: Advanced GUI control, window management, click automation
   - **How to grant**:

     ```bash
     # Open Accessibility preferences
     open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
     ```

   - Manual steps:
     - System Preferences > Security & Privacy > Privacy > Accessibility
     - Click the lock icon and enter your password
     - Check the box next to your MCP client or Terminal

#### Permission Verification

Test if permissions are properly granted:

```bash
# Test Screen Recording permission
node -e "
const { spawn } = require('child_process');
spawn('screencapture', ['-t', 'png', '/tmp/test.png'], { stdio: 'inherit' });
console.log('If no permission dialog appears, Screen Recording is granted');
"

# Test Accessibility permission (requires @jxa/run)
node -e "
const { run } = require('@jxa/run');
try {
  const result = run(() => {
    return Application('System Events').processes.whose({name: 'Finder'})[0].name();
  });
  console.log('Accessibility permission granted:', result);
} catch (error) {
  console.log('Accessibility permission needed:', error.message);
}
"
```

#### Automated Permission Check

Use the built-in permission checker:

```bash
# Check all permissions at once
npx mcp-eyes mcp --check-permissions

# Or test programmatically
node -e "
const { run } = require('@jxa/run');
const { hasScreenRecordingPermission } = require('node-mac-permissions');

console.log('Screen Recording:', hasScreenRecordingPermission());
try {
  run(() => Application('System Events').processes.name());
  console.log('Accessibility: ✅ Granted');
} catch (e) {
  console.log('Accessibility: ❌ Needed');
}
"
```

#### Common macOS Issues

**Problem**: Screenshots return 20x20px images

```bash
# Solution: Grant Screen Recording permission and restart
sudo tccutil reset ScreenCapture  # Reset permissions
# Re-grant permission through System Preferences
```

**Problem**: "Operation not permitted" errors

```bash
# Solution: Grant Accessibility permission
sudo tccutil reset Accessibility
# Re-grant permission through System Preferences
```

#### macOS Example Commands

```bash
# List applications with bundle IDs and window bounds
npx mcp-eyes mcp <<< '{"method": "call", "tool": "listApplications"}'

# Focus Safari by bundle ID
npx mcp-eyes mcp <<< '{"method": "call", "tool": "focusApplication", "arguments": {"identifier": "com.apple.Safari"}}'

# Take screenshot of focused window
npx mcp-eyes mcp <<< '{"method": "call", "tool": "screenshot", "arguments": {"padding": 20}}'
```

### Windows PowerShell Usage & Setup

MCP-Eyes leverages Windows PowerShell for native Windows GUI automation and process management.

#### PowerShell Requirements

1. **PowerShell Version**

   ```powershell
   # Check PowerShell version
   $PSVersionTable.PSVersion
   # Required: PowerShell 5.1+ or PowerShell 7+
   ```

2. **Execution Policy** (if needed)

   ```powershell
   # Check current execution policy
   Get-ExecutionPolicy
   
   # Set execution policy if needed (run as Administrator)
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

#### Administrator Rights

Some operations require elevated permissions:

```powershell
# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Running as Administrator: $isAdmin"

# Restart PowerShell as Administrator (if needed)
if (-NOT $isAdmin) {
    Start-Process powershell -Verb RunAs
}
```

#### Windows-Specific Features

1. **Process Management**

   ```powershell
   # List all processes with window titles
   Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | Select-Object Id, ProcessName, MainWindowTitle
   ```

2. **Window Focus Control**

   ```powershell
   # Focus application by process name
   $process = Get-Process -Name "notepad" -ErrorAction SilentlyContinue
   if ($process) {
       [Microsoft.VisualBasic.Interaction]::AppActivate($process.Id)
   }
   ```

#### Windows Example Commands

```bash
# List Windows applications with process names and window titles
npx mcp-eyes mcp <<< '{"method": "call", "tool": "listApplications"}'

# Focus Notepad by process name
npx mcp-eyes mcp <<< '{"method": "call", "tool": "focusApplication", "arguments": {"identifier": "notepad"}}'

# Focus by Process ID
npx mcp-eyes mcp <<< '{"method": "call", "tool": "focusApplication", "arguments": {"identifier": "1234"}}'

# Click at center of focused window
npx mcp-eyes mcp <<< '{"method": "call", "tool": "click", "arguments": {"x": 0.5, "y": 0.5}}'
```

#### Advanced Windows PowerShell Operations

```powershell
# Get detailed process information
Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | 
Select-Object Id, ProcessName, MainWindowTitle, StartTime | Format-Table

# Find processes by partial name
Get-Process | Where-Object {$_.ProcessName -like "*chrome*"} | 
Select-Object Id, ProcessName, MainWindowTitle

# Check if a window is visible and responsive
$process = Get-Process -Name "notepad" -ErrorAction SilentlyContinue
if ($process) {
    Write-Host "Process found: $($process.MainWindowTitle)"
    Write-Host "Window Handle: $($process.MainWindowHandle)"
    Write-Host "Responding: $($process.Responding)"
}

# Focus window with error handling
try {
    $process = Get-Process -Name "notepad" -ErrorAction Stop
    [Microsoft.VisualBasic.Interaction]::AppActivate($process.Id)
    Write-Host "Successfully focused Notepad"
} catch {
    Write-Host "Failed to focus Notepad: $($_.Exception.Message)"
}
```

#### Windows Automation Scripts

Create reusable PowerShell scripts for common tasks:

```powershell
# Save as focus-app.ps1
param(
    [string]$AppName
)

$process = Get-Process -Name $AppName -ErrorAction SilentlyContinue
if ($process) {
    [Microsoft.VisualBasic.Interaction]::AppActivate($process.Id)
    Write-Host "Focused $AppName (PID: $($process.Id))"
} else {
    Write-Host "Process $AppName not found"
    # List similar processes
    Get-Process | Where-Object {$_.ProcessName -like "*$AppName*"} | 
    Select-Object ProcessName, Id, MainWindowTitle
}

# Usage: .\focus-app.ps1 -AppName "chrome"
```

#### Troubleshooting Windows Issues

**Problem**: PowerShell execution policy errors

```powershell
# Solution: Update execution policy
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

**Problem**: Access denied errors

```powershell
# Solution: Run as Administrator
# Right-click PowerShell/Terminal → "Run as Administrator"
```

**Problem**: Process not found

```powershell
# Check if process exists
Get-Process | Where-Object {$_.ProcessName -like "*notepad*"}
```

### Linux wmctrl Setup & Configuration

MCP-Eyes uses wmctrl for Linux window management and X11 integration.

#### wmctrl Installation

**Ubuntu/Debian**:

```bash
# Update package list
sudo apt update

# Install wmctrl
sudo apt install wmctrl

# Verify installation
wmctrl -m
```

**CentOS/RHEL/Fedora**:

```bash
# CentOS/RHEL
sudo yum install wmctrl

# Fedora
sudo dnf install wmctrl

# Verify installation
wmctrl -m
```

**Arch Linux**:

```bash
# Install wmctrl
sudo pacman -S wmctrl

# Verify installation
wmctrl -m
```

#### X11 Requirements

MCP-Eyes requires X11 display server (Wayland is not supported):

```bash
# Check current session type
echo $XDG_SESSION_TYPE
# Should output: x11

# Check if X11 is running
echo $DISPLAY
# Should output something like: :0 or :1

# Switch to X11 session (if using Wayland)
# Log out and select "X11" session at login screen
```

#### wmctrl Verification & Testing

```bash
# Test wmctrl functionality
wmctrl -l                    # List all windows
wmctrl -d                    # List all desktops
wmctrl -m                    # Display window manager info

# Test window operations
wmctrl -a firefox            # Focus Firefox window
wmctrl -c firefox            # Close Firefox window
wmctrl -r firefox -b add,maximized_vert,maximized_horz  # Maximize
```

#### Advanced wmctrl Operations

```bash
# List windows with detailed information
wmctrl -l -p -G              # List with PID and geometry
wmctrl -l -x                 # List with WM_CLASS

# Find windows by title or class
wmctrl -l | grep -i "terminal"           # Find terminal windows
wmctrl -l -x | grep -i "firefox"         # Find Firefox windows

# Window positioning and sizing
wmctrl -r "Terminal" -e 0,100,100,800,600    # Move and resize
wmctrl -r "Terminal" -b add,above             # Keep above other windows
wmctrl -r "Terminal" -b remove,maximized_vert,maximized_horz  # Unmaximize

# Desktop switching
wmctrl -s 1                  # Switch to desktop 1
wmctrl -r "Terminal" -t 2    # Move window to desktop 2

# Advanced window states
wmctrl -r "Terminal" -b add,sticky           # Show on all desktops
wmctrl -r "Terminal" -b add,shaded           # Shade/roll up window
wmctrl -r "Terminal" -b toggle,fullscreen    # Toggle fullscreen
```

#### Linux Window Management Scripts

Create automation scripts for complex window operations:

```bash
#!/bin/bash
# Save as focus-or-launch.sh
APP_NAME="$1"
APP_COMMAND="$2"

# Try to focus existing window
if wmctrl -a "$APP_NAME" 2>/dev/null; then
    echo "Focused existing $APP_NAME window"
else
    echo "Launching new $APP_NAME instance"
    if [ -n "$APP_COMMAND" ]; then
        $APP_COMMAND &
        sleep 2  # Wait for app to launch
        wmctrl -a "$APP_NAME"
    else
        echo "No launch command provided"
    fi
fi

# Usage: ./focus-or-launch.sh "Firefox" "firefox"
```

```bash
#!/bin/bash
# Save as workspace-setup.sh
# Set up a development workspace

# Open terminal on left half
gnome-terminal &
sleep 1
wmctrl -r "Terminal" -e 0,0,0,960,1080

# Open code editor on right half  
code &
sleep 3
wmctrl -r "Visual Studio Code" -e 0,960,0,960,1080

# Open browser on desktop 2
wmctrl -s 1
firefox &
sleep 2
wmctrl -r "Firefox" -b add,maximized_vert,maximized_horz

# Switch back to desktop 1
wmctrl -s 0

echo "Workspace setup complete!"
```

#### Linux Permission Requirements

```bash
# Ensure user has X11 access
xhost +local:                # Grant local access (if needed)

# Check X11 permissions
ls -la /tmp/.X11-unix/       # Should show X11 sockets

# Test X11 access
xdpyinfo > /dev/null && echo "X11 access OK" || echo "X11 access failed"
```

#### Linux Example Commands

```bash
# List all Linux windows
npx mcp-eyes mcp <<< '{"method": "call", "tool": "listApplications"}'

# Focus Firefox window
npx mcp-eyes mcp <<< '{"method": "call", "tool": "focusApplication", "arguments": {"identifier": "firefox"}}'

# Focus by partial window title
npx mcp-eyes mcp <<< '{"method": "call", "tool": "focusApplication", "arguments": {"identifier": "Terminal"}}'

# Take screenshot of focused window
npx mcp-eyes mcp <<< '{"method": "call", "tool": "screenshot", "arguments": {"padding": 10}}'
```

#### Linux Distribution-Specific Setup

**Ubuntu/Debian**:

```bash
# Update package lists
sudo apt update

# Install wmctrl and dependencies
sudo apt install wmctrl x11-utils xdotool

# Install additional tools for enhanced functionality
sudo apt install xprop xwininfo scrot

# Verify installation
wmctrl --version
xdotool version
```

**CentOS/RHEL 8+**:

```bash
# Enable EPEL repository
sudo dnf install epel-release

# Install wmctrl and dependencies
sudo dnf install wmctrl xorg-x11-utils xdotool

# Verify installation
wmctrl --version
```

**Fedora**:

```bash
# Install wmctrl and dependencies
sudo dnf install wmctrl xorg-x11-utils xdotool xprop

# Verify installation
wmctrl --version
```

**Arch Linux**:

```bash
# Install wmctrl and dependencies
sudo pacman -S wmctrl xorg-xprop xorg-xwininfo xdotool

# Verify installation
wmctrl --version
```

#### Linux Troubleshooting

**Problem**: wmctrl command not found

```bash
# Solution: Install wmctrl (see distribution-specific sections above)
which wmctrl  # Check if installed
echo $PATH    # Verify PATH includes /usr/bin

# Alternative installation from source (if package unavailable)
sudo apt install build-essential libx11-dev libxmu-dev libglib2.0-dev
wget http://tomas.styblo.name/wmctrl/dist/wmctrl-1.07.tar.gz
tar -xzf wmctrl-1.07.tar.gz
cd wmctrl-1.07
make
sudo make install
```

**Problem**: Cannot open display

```bash
# Check DISPLAY variable
echo $DISPLAY

# Set DISPLAY if needed
export DISPLAY=:0

# Test X11 connection
xdpyinfo | head -10

# For remote sessions (SSH)
ssh -X user@hostname  # Enable X11 forwarding
```

**Problem**: Wayland session detected

```bash
# Check session type
echo $XDG_SESSION_TYPE
echo $WAYLAND_DISPLAY

# Force X11 environment variables
unset WAYLAND_DISPLAY
export XDG_SESSION_TYPE=x11

# Permanent switch to X11 session:
# 1. Log out
# 2. At login screen, click gear icon
# 3. Select "Ubuntu on Xorg" or "GNOME on Xorg"
# 4. Log in

# Verify X11 session
loginctl show-session $XDG_SESSION_ID -p Type
```

**Problem**: Permission denied or X11 access issues

```bash
# Grant X11 access (temporary)
xhost +local:$USER

# Grant X11 access (persistent)
echo "xhost +local:$USER" >> ~/.xsessionrc

# Check user groups
groups $USER
# Should include groups like: audio, video, input

# Add user to necessary groups
sudo usermod -a -G audio,video,input $USER
# Log out and back in for changes to take effect

# Test X11 connection
xdpyinfo > /dev/null && echo "X11 OK" || echo "X11 failed"
```

**Problem**: Desktop environment specific issues

```bash
# GNOME: Enable window management extensions
gnome-extensions list
gnome-extensions enable window-list@gnome-shell-extensions.gcampax.github.com

# KDE: Check KWin configuration
kreadconfig5 --group Windows --key FocusPolicy

# XFCE: Verify window manager
xfconf-query -c xfwm4 -l

# i3/Awesome: wmctrl compatibility may be limited
# Consider using i3-msg or awesome-client instead
```

**Problem**: Window focus not working

```bash
# Test different focus methods
wmctrl -a "Firefox"              # Focus by title
wmctrl -i -a 0x03400006          # Focus by window ID
xdotool search --name "Firefox" windowactivate

# Debug window information
wmctrl -l -p -G -x               # Detailed window list
xwininfo -tree -root             # X11 window tree

# Alternative focus using xdotool
xdotool search --name "Firefox" windowfocus
xdotool search --class "firefox" windowactivate %1
```

### Cross-Platform Testing

Verify your setup works across platforms:

```bash
# Test platform detection
node -e "console.log('Platform:', process.platform)"

# Test cross-platform server
npx mcp-eyes mcp

# Test with actual MCP client (example with Cursor)
# Add to cursor-mcp-config.json:
{
  "mcpServers": {
    "mcp-eyes": {
      "command": "/opt/homebrew/bin/npx",
      "args": [
        "-y",
        "mcp-eyes"
      ],
      "env": {
        "DEBUG": "mcp:*"
      }
    }
  }
}
```

## 🐛 Troubleshooting

### Common Issues

#### Screenshots return small images (20x20px)

- Ensure Screen Recording permission is granted on macOS
- Check that the target application is visible and not minimized

#### "Permission denied" errors

- Grant required permissions in System Preferences (macOS)
- Run with administrator rights (Windows)
- Check X11 access (Linux)

#### Cross-platform server not working

- Verify platform-specific dependencies are installed
- Check that the target platform is supported

### Debug Mode

Enable debug logging:

```bash
MCP_EYES_LOG_LEVEL=debug mcp-eyes mcp
```

## 📚 API Reference

### Core Tools

#### `listApplications`

List all running applications with window bounds and metadata.

**Parameters**: None

**Returns**: Array of application objects with:

- `name`: Application name
- `bundleId`: Bundle identifier (macOS) or process name
- `pid`: Process ID
- `bounds`: Window bounds [x, y, width, height]
- `displayId`: Display identifier (multi-display setups)

#### `focusApplication`

Focus a specific application by identifier.

**Parameters**:

- `identifier`: Bundle ID (macOS), process name (Windows/Linux), or PID

**Returns**: Success confirmation

#### `click`

Perform a mouse click at normalized coordinates.

**Parameters**:

- `x`: X coordinate (0-1, normalized to window)
- `y`: Y coordinate (0-1, normalized to window)
- `button`: Mouse button ("left", "right", "middle")

**Returns**: Success confirmation

#### `screenshot`

Take a screenshot of the focused application window.

**Parameters**:

- `padding`: Padding around window in pixels (default: 10)
- `format`: Image format ("png", "jpg")
- `quality`: JPEG quality 1-100 (default: 90)

**Returns**: Base64 encoded image or file path

### Advanced Tools

#### `listDisplays`

List all available displays.

**Returns**: Array of display objects with:

- `id`: Display identifier
- `name`: Display name
- `bounds`: Display bounds [x, y, width, height]
- `primary`: Whether this is the primary display

#### `screenshotRegion`

Take a screenshot of a specific screen region.

**Parameters**:

- `x`: X coordinate of region
- `y`: Y coordinate of region
- `width`: Width of region
- `height`: Height of region
- `format`: Image format ("png", "jpg")
- `quality`: JPEG quality 1-100

**Returns**: Base64 encoded image or file path

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Include tests for new functionality

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the MCP framework
- [nut.js](https://github.com/nut-tree/nut.js) for cross-platform GUI automation
- [screenshot-desktop](https://github.com/bencevans/screenshot-desktop) for screenshot capabilities
- [@jxa/run](https://github.com/JXA-userland/JXA) for macOS JavaScript for Automation

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/datagram1/mcp-eyes/issues)
- **Discussions**: [GitHub Discussions](https://github.com/datagram1/mcp-eyes/discussions)
- **Documentation**: [Wiki](https://github.com/datagram1/mcp-eyes/wiki)

## 🗺️ Roadmap

- [ ] Enhanced Windows PowerShell integration
- [ ] Linux Wayland support
- [ ] Advanced OCR capabilities
- [ ] Plugin system for custom tools
- [ ] Web-based configuration interface
- [ ] Performance optimization for large screenshots
- [ ] Advanced multi-display window management

---

## Made with ❤️ for the AI automation community
