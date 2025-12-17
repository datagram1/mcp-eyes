# ScreenControl Windows Agent Documentation

Native C++ agent for Windows with full GUI support for AI assistants to control Windows desktops remotely via the ScreenControl control server.

## Overview

The Windows agent provides the same functionality as the macOS and Linux agents, enabling AI assistants to control Windows desktops remotely.

```
                    ┌────────────────────────────────────────┐
                    │        ScreenControl Windows Agent     │
                    │           (Native C++ Binary)          │
                    ├────────────────────────────────────────┤
                    │  - HTTP Server (port 3459)             │
                    │  - WebSocket client (control server)   │
                    │  - GDI+ screenshot capture             │
                    │  - Win32 SendInput simulation          │
                    │  - Win32 filesystem tools              │
                    │  - CreateProcess shell execution       │
                    │  - AES-256-GCM encryption (bcrypt)     │
                    ├────────────────────────────────────────┤
                    │           Modes                        │
                    │  --console  → Debug console mode       │
                    │  (default)  → Windows Service mode     │
                    └────────────────────────────────────────┘
```

## Supported Platforms

| Windows Version | Architecture | Status |
|-----------------|--------------|--------|
| Windows 11 | x64, ARM64 | Fully supported |
| Windows 10 | x64, ARM64 | Fully supported |
| Windows Server 2022 | x64 | Fully supported |
| Windows Server 2019 | x64 | Fully supported |

## Requirements

- Windows 10/11 or Windows Server 2019+
- Administrator privileges (for service installation)
- Visual C++ Redistributable 2022 (usually pre-installed)

---

## Quick Install

### Pre-built Binary

1. Download `ScreenControlService.exe` from releases
2. Copy to `C:\Program Files\ScreenControl\`
3. Create config directory and file:

```powershell
# Run as Administrator
mkdir "C:\ProgramData\ScreenControl" -ErrorAction SilentlyContinue
@'
{
  "httpPort": 3459,
  "browserBridgePort": 3457,
  "controlServerUrl": "wss://screencontrol.knws.co.uk/ws",
  "customerId": "",
  "licenseUuid": ""
}
'@ | Out-File -FilePath "C:\ProgramData\ScreenControl\config.json" -Encoding utf8
```

4. Install as service:

```powershell
sc create ScreenControlService binPath= "C:\Program Files\ScreenControl\ScreenControlService.exe" start= auto
sc start ScreenControlService
```

### From Source (Cross-Compilation from macOS)

The recommended way to build for Windows is cross-compilation from macOS using MinGW-w64:

#### Prerequisites

```bash
# Install MinGW-w64 on macOS
brew install mingw-w64
```

#### Build Steps

```bash
cd service

# Create build directory
mkdir -p build-windows && cd build-windows

# Configure with CMake using MinGW toolchain
cmake -DCMAKE_TOOLCHAIN_FILE=../cmake/mingw-w64.cmake \
      -DCMAKE_BUILD_TYPE=Release ..

# Build
make -j4

# Output: bin/ScreenControlService.exe (~17MB)
```

#### Deploy to Windows via SSH

```bash
# Copy binary to Windows machine
scp bin/ScreenControlService.exe user@windows-host:"C:/Program Files/ScreenControl/"

# Create and start service
ssh user@windows-host "sc create ScreenControlService binPath= \"C:\\Program Files\\ScreenControl\\ScreenControlService.exe\" start= auto && sc start ScreenControlService"
```

### From Source (Visual Studio on Windows)

#### Prerequisites

- Visual Studio 2022 with C++ workload
- For ARM64: ARM64 build tools component
- Windows 11 SDK (10.0.22000+)

#### Build Steps

```powershell
# Clone repository
git clone https://github.com/datagram1/mcp-eyes.git
cd mcp-eyes\windows\ScreenControlService

# Open in Visual Studio
start ScreenControlService.sln

# Or build from command line
& "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe" `
    ScreenControlService.vcxproj `
    /p:Configuration=Release `
    /p:Platform=ARM64   # or x64
```

Output: `bin\Release\ARM64\ScreenControlService.exe` (or `x64`)

---

## Installation

### Install as Windows Service

```powershell
# Run as Administrator
ScreenControlService.exe --install
```

This creates a Windows service named `ScreenControlService` that:
- Starts automatically on boot
- Runs under LocalSystem account (NT AUTHORITY\SYSTEM)
- Listens on port 3459

### Start the Service

```powershell
net start ScreenControlService
```

### Verify Installation

```powershell
# Check service status
sc query ScreenControlService

# Test health endpoint
curl http://localhost:3459/health
# Response: {"service":"ScreenControlService","status":"ok","version":"1.2.0"}

# Test system info
curl http://localhost:3459/system/info
```

### Uninstall

```powershell
# Stop and remove service
net stop ScreenControlService
ScreenControlService.exe --uninstall
```

---

## Service Management

### PowerShell Commands

```powershell
# Start service
net start ScreenControlService
# or: Start-Service ScreenControlService

# Stop service
net stop ScreenControlService
# or: Stop-Service ScreenControlService

# Restart service
Restart-Service ScreenControlService

# Check status
sc query ScreenControlService
# or: Get-Service ScreenControlService

# View service configuration
sc qc ScreenControlService
```

### Services GUI

1. Press `Win+R`, type `services.msc`
2. Find "ScreenControl Service"
3. Right-click to Start/Stop/Restart

---

## Configuration

### Configuration File Location

The agent stores configuration in:
```
C:\ProgramData\ScreenControl\config.json
```

### Configuration Options

```json
{
  "httpPort": 3459,
  "browserBridgePort": 3457,
  "controlServerUrl": "wss://screencontrol.knws.co.uk/ws",
  "customerId": "your-customer-id",
  "licenseUuid": "your-endpoint-uuid"
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `httpPort` | Local HTTP API port | 3459 |
| `browserBridgePort` | Browser bridge port | 3457 |
| `controlServerUrl` | WebSocket URL of control server | wss://screencontrol.knws.co.uk/ws |
| `customerId` | Customer/organization ID | (empty) |
| `licenseUuid` | MCP endpoint UUID | (empty) |

### Command Line Options

```
ScreenControl Service
Usage: ScreenControlService.exe [options]
Options:
  --install, -i    Install the service
  --uninstall, -u  Uninstall the service
  --console, -c    Run in console mode (for debugging)
  --help, -h       Show this help
```

---

## Tools Reference

### System Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `system_info` | `GET /system/info` | System information (OS, CPU, memory, hostname, uptime) |
| `wait` | `POST /wait` | Wait for specified milliseconds |
| `clipboard_read` | `GET /clipboard/read` | Read text from clipboard |
| `clipboard_write` | `POST /clipboard/write` | Write text to clipboard |

### GUI Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `screenshot` | `POST /screenshot` | Capture screen (GDI+) |
| `click` | `POST /click` | Click at coordinates |
| `doubleClick` | `POST /doubleClick` | Double click |
| `rightClick` | `POST /rightClick` | Right click |
| `pressKey` | `POST /pressKey` | Press keyboard key |
| `typeText` | `POST /typeText` | Type text string |
| `scroll` | `POST /scroll` | Scroll mouse wheel |
| `drag` | `POST /drag` | Drag from point to point |

### Mouse Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `mouse/move` | `POST /mouse/move` | Move mouse cursor |
| `mouse/position` | `GET /mouse/position` | Get cursor position |
| `mouse/scroll` | `POST /mouse/scroll` | Scroll wheel |
| `mouse/drag` | `POST /mouse/drag` | Drag operation |

### Window Management

| Tool | Endpoint | Description |
|------|----------|-------------|
| `getClickableElements` | `POST /getClickableElements` | Get clickable UI elements |
| `getUIElements` | `POST /getUIElements` | Get all UI elements |
| `getWindowList` | `POST /getWindowList` | List all windows |
| `focusWindow` | `POST /focusWindow` | Focus a window |

### Filesystem Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `fs_list` | `POST /fs/list` | List directory contents |
| `fs_read` | `POST /fs/read` | Read file contents |
| `fs_read_range` | `POST /fs/read_range` | Read specific line range |
| `fs_write` | `POST /fs/write` | Write content to file |
| `fs_delete` | `POST /fs/delete` | Delete file or directory |
| `fs_move` | `POST /fs/move` | Move or rename files |
| `fs_search` | `POST /fs/search` | Search files by glob pattern |
| `fs_grep` | `POST /fs/grep` | Search file contents with regex |
| `fs_patch` | `POST /fs/patch` | Apply patches to files |

### Shell Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `shell_exec` | `POST /shell/exec` | Execute command |
| `shell_start_session` | `POST /shell/start_session` | Start interactive session |
| `shell_send_input` | `POST /shell/send_input` | Send input to session |
| `shell_stop_session` | `POST /shell/stop_session` | Stop session |

### Other Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /status` | Service status for tray app |
| `POST /browser/*` | Proxy to browser bridge (port 3457) |

---

## API Examples

### System Information

```powershell
curl http://localhost:3459/system/info
```

Response:
```json
{
  "success": true,
  "os": "Windows 11",
  "osType": "Windows",
  "osVersion": "10.0.26100",
  "architecture": "ARM64",
  "hostname": "DESKTOP-ABC123",
  "cpu": "Apple Silicon",
  "cpuCores": 10,
  "memoryTotal": 61433,
  "memoryUsed": 12524,
  "memoryFree": 48909,
  "uptime": "5:23",
  "uptimeSeconds": 19380
}
```

### Screenshot

```powershell
curl -X POST http://localhost:3459/screenshot -o screen.jpg
```

### Click

```powershell
curl -X POST http://localhost:3459/click `
  -H "Content-Type: application/json" `
  -d '{"x":100,"y":200}'
```

### Type Text

```powershell
curl -X POST http://localhost:3459/typeText `
  -H "Content-Type: application/json" `
  -d '{"text":"Hello World"}'
```

### Execute Command

```powershell
curl -X POST http://localhost:3459/shell/exec `
  -H "Content-Type: application/json" `
  -d '{"command":"dir C:\\Users"}'
```

### List Directory

```powershell
curl -X POST http://localhost:3459/fs/list `
  -H "Content-Type: application/json" `
  -d '{"path":"C:\\Users"}'
```

---

## Logging

### Log File Location

```
C:\ProgramData\ScreenControl\logs\service.log
```

### View Logs

```powershell
# Tail the log file
Get-Content "C:\ProgramData\ScreenControl\logs\service.log" -Tail 50 -Wait

# Or use PowerShell
type "C:\ProgramData\ScreenControl\logs\service.log"
```

### Windows Event Log

Service events are also logged to Windows Event Log:
```powershell
Get-EventLog -LogName Application -Source ScreenControlService -Newest 20
```

---

## Troubleshooting

### Service won't start

```powershell
# Check service status
sc query ScreenControlService

# Check for errors
Get-EventLog -LogName Application -Source ScreenControlService -Newest 10

# Try running in console mode to see errors
ScreenControlService.exe --console
```

### Port already in use

```powershell
# Find process using port 3459
netstat -ano | findstr :3459

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

### Firewall blocking connections

```powershell
# Allow inbound connections on port 3459
New-NetFirewallRule -DisplayName "ScreenControl" -Direction Inbound -Port 3459 -Protocol TCP -Action Allow
```

### Service fails to install

```powershell
# Ensure running as Administrator
# Check Windows Event Log for details
eventvwr.msc
```

### Screenshot not working

The service must be running in an interactive session (Session 1) to capture screenshots. When running as a service, ensure "Allow service to interact with desktop" is enabled, or use console mode for testing.

---

## Security Considerations

1. **Run as service**: The service runs under LocalSystem by default, which has full system access
2. **Firewall**: By default, only listens on localhost; use firewall rules for remote access
3. **TLS**: Control server connections use WSS (WebSocket Secure)
4. **Authentication**: No built-in authentication on HTTP API - secure via firewall/network

---

## Architecture

### Source Structure

```
windows/ScreenControlService/
├── ScreenControlService.vcxproj    # Visual Studio project
├── ScreenControlService.sln        # Solution file
├── main.cpp                        # Entry point, service management
├── service.h/cpp                   # Windows service wrapper
├── server/
│   └── http_server.h/cpp           # HTTP API endpoints
├── control_server/
│   └── websocket_client.h/cpp      # WebSocket client (Schannel SSL)
├── core/
│   ├── config.h/cpp                # Configuration
│   └── logger.h/cpp                # Logging
├── tools/
│   ├── gui_tools.h/cpp             # GDI+ screenshot, SendInput
│   ├── ui_automation.h/cpp         # UI Automation (disabled)
│   ├── filesystem_tools.h/cpp      # Win32 file operations
│   ├── shell_tools.h/cpp           # CreateProcess execution
│   └── system_tools.h/cpp          # System info, clipboard
└── libs/
    ├── httplib.h                   # cpp-httplib (header-only)
    └── json.hpp                    # nlohmann/json (header-only)
```

### Dependencies

**Header-only libraries (included):**
- [cpp-httplib](https://github.com/yhirose/cpp-httplib) - HTTP server
- [nlohmann/json](https://github.com/nlohmann/json) - JSON handling

**Windows SDK libraries:**
- ws2_32.lib - WinSock2
- gdiplus.lib - GDI+ (screenshots)
- user32.lib, gdi32.lib - Win32 API
- secur32.lib, crypt32.lib - Schannel SSL
- psapi.lib - Process API
- shell32.lib, shlwapi.lib - Shell API
- advapi32.lib - Service Control Manager

---

## Version History

### v1.2.0 (December 2024)
- **MinGW-w64 cross-compilation support** from macOS
- **AES-256-GCM encryption** using Windows bcrypt API (no OpenSSL dependency)
- **Unified codebase** with macOS and Linux agents
- Port changed from 3456 to 3459 (standard service port)
- DPAPI integration for secure credential storage
- Lock detection via WTS API
- Improved service startup and error handling

### v1.0.0 (December 2024)
- Initial release
- Full GUI tool support (screenshot, input, windows)
- Filesystem and shell tools
- WebSocket control server integration
- Windows Service support
- x64 and ARM64 support
