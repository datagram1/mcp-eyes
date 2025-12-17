# ScreenControl Linux Agent Documentation

Native C++ service for Linux with dual-mode support: **GUI** (with X11/Wayland desktop integration via tray app) and **Headless** (daemon/service mode).

## Overview

The Linux agent uses a **shared cross-platform service** architecture. The core business logic runs as a systemd service (`ScreenControlService`), with GUI operations proxied through an optional tray application that has access to the display server.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ScreenControl Linux Architecture                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────────────────┐     ┌─────────────────────────────┐  │
│   │   ScreenControlService  │     │    Tray Application         │  │
│   │   (systemd service)     │────▶│    (optional, X11/Wayland)  │  │
│   │                         │     │                             │  │
│   │   - HTTP Server :3459   │     │   - GUI Bridge :3460        │  │
│   │   - WebSocket client    │     │   - Screenshot capture      │  │
│   │   - Filesystem tools    │     │   - Mouse/keyboard control  │  │
│   │   - Shell execution     │     │   - Window management       │  │
│   │   - Machine unlock      │     │   - OCR analysis            │  │
│   │   - Secure storage      │     │                             │  │
│   └─────────────────────────┘     └─────────────────────────────┘  │
│              │                                                       │
│              │ WebSocket (wss://)                                   │
│              ▼                                                       │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │              ScreenControl Control Server                    │  │
│   │           (Cloud - receives commands from AI)                │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Features

- **Cross-platform shared service**: Same C++ codebase compiles for macOS, Windows, and Linux
- **Survives machine lock**: Service runs as root and can unlock the machine
- **Secure credential storage**: Uses libsecret (GNOME Keyring, KDE Wallet) or protected files
- **Split-key encryption**: Credentials encrypted with AES-256-GCM, key split between keyring and file
- **GUI proxy architecture**: GUI operations forwarded from service to tray app

## Supported Platforms

| Distribution | Architecture | Display Server | Status |
|--------------|--------------|----------------|--------|
| Ubuntu 22.04+ | x86_64, ARM64 | X11, Wayland | Fully supported |
| Debian 11+ | x86_64, ARM64 | X11, Wayland | Fully supported |
| Fedora 38+ | x86_64, ARM64 | X11, Wayland | Fully supported |
| Arch Linux | x86_64, ARM64 | X11, Wayland | Fully supported |
| RHEL/Rocky 9+ | x86_64 | X11 | Fully supported |

## Quick Install

### One-Line Installer

```bash
curl -fsSL https://raw.githubusercontent.com/screencontrol/screencontrol/main/service/install/linux/install.sh | sudo bash
```

Or download and run manually:

```bash
wget https://raw.githubusercontent.com/screencontrol/screencontrol/main/service/install/linux/install.sh
chmod +x install.sh
sudo ./install.sh
```

### What Gets Installed

| Path | Description |
|------|-------------|
| `/opt/screencontrol/ScreenControlService` | Main service binary |
| `/etc/systemd/system/screencontrol.service` | Systemd unit file |
| `/etc/screencontrol/` | Configuration directory |
| `/var/log/screencontrol/` | Log directory |

---

## Architecture

### Service + Tray App Design

The Linux agent follows the same architecture as macOS and Windows:

1. **ScreenControlService** - Runs as a systemd service (root)
   - Handles all non-GUI operations directly
   - Survives machine lock
   - Connects to control server via WebSocket
   - Proxies GUI requests to tray app

2. **Tray Application** (optional) - Runs in user session
   - Has access to X11/Wayland display
   - Handles screenshots, mouse/keyboard, window management
   - Listens on GUI bridge port (3460)

### Port Configuration

| Port | Service | Description |
|------|---------|-------------|
| 3459 | HTTP API | Main REST API (service) |
| 3460 | GUI Bridge | GUI operations (tray app) |
| 3458 | WebSocket | Internal service communication |

### Source Structure

```
service/
├── CMakeLists.txt              # Cross-platform CMake build
├── include/
│   └── platform.h              # Platform detection & constants
├── src/
│   ├── core/
│   │   ├── config.cpp/h        # Configuration management
│   │   ├── logger.cpp/h        # Logging (syslog + file)
│   │   ├── crypto.cpp/h        # AES-256-GCM encryption
│   │   └── security.cpp/h      # Security utilities
│   ├── server/
│   │   └── http_server.cpp/h   # REST API endpoints
│   ├── control_server/
│   │   ├── websocket_client.cpp/h  # Control server connection
│   │   └── command_dispatcher.cpp/h # Route commands to handlers
│   ├── tools/
│   │   ├── filesystem_tools.cpp/h  # File operations
│   │   ├── shell_tools.cpp/h       # Command execution
│   │   └── system_tools.cpp/h      # System info, clipboard
│   ├── platform/
│   │   ├── linux/
│   │   │   ├── main_linux.cpp      # Linux entry point
│   │   │   └── platform_linux.cpp  # Linux-specific implementations
│   │   ├── macos/                  # macOS implementation
│   │   └── windows/                # Windows implementation
│   └── libs/
│       ├── httplib.h           # cpp-httplib (header-only)
│       └── json.hpp            # nlohmann/json (header-only)
└── install/
    └── linux/
        ├── install.sh          # Installation script
        └── screencontrol.service # Systemd unit file
```

---

## Tools Reference

### Service Tools (Always Available)

These tools are handled directly by the service and work in all modes:

#### System Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `system_info` | `GET /system/info` | System information (OS, CPU, memory, hostname) |
| `wait` | `POST /wait` | Wait for specified milliseconds |
| `clipboard_read` | `GET /clipboard/read` | Read text from system clipboard |
| `clipboard_write` | `POST /clipboard/write` | Write text to system clipboard |

#### Filesystem Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `fs_list` | `POST /fs/list` | List directory contents |
| `fs_read` | `POST /fs/read` | Read file contents |
| `fs_read_range` | `POST /fs/read_range` | Read specific line range from file |
| `fs_write` | `POST /fs/write` | Write content to file |
| `fs_search` | `POST /fs/search` | Search files by glob pattern |
| `fs_grep` | `POST /fs/grep` | Search file contents with regex |
| `fs_delete` | `POST /fs/delete` | Delete files or directories |
| `fs_move` | `POST /fs/move` | Move or rename files |
| `fs_patch` | `POST /fs/patch` | Apply patches to files |

#### Shell Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `shell_exec` | `POST /shell/exec` | Execute shell commands |
| `shell_start_session` | `POST /shell/session/start` | Start interactive shell session |
| `shell_send_input` | `POST /shell/session/input` | Send input to shell session |
| `shell_stop_session` | `POST /shell/session/stop` | Stop shell session |

#### Machine Control Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `unlock_status` | `GET /unlock/status` | Check if machine is locked |
| `unlock` | `POST /unlock` | Unlock machine with stored credentials |
| `unlock_credentials` | `POST /unlock/credentials` | Store unlock credentials (write-only) |
| `unlock_credentials` | `DELETE /unlock/credentials` | Clear stored credentials |

### GUI Tools (Require Tray App)

These tools are proxied from the service to the tray app:

#### Screenshot & Display

| Tool | Endpoint | Description |
|------|----------|-------------|
| `screenshot` | `GET /screenshot` | Capture entire screen |
| `ocr` | `GET /ocr` | Analyze screen with OCR |

#### Mouse Control

| Tool | Endpoint | Description |
|------|----------|-------------|
| `click` | `POST /click` | Click at coordinates |
| `double_click` | `POST /double_click` | Double-click at coordinates |
| `mouse/move` | `POST /mouse/move` | Move mouse cursor |
| `mouse/position` | `GET /mouse/position` | Get current cursor position |
| `mouse/scroll` | `POST /mouse/scroll` | Scroll mouse wheel |
| `mouse/drag` | `POST /mouse/drag` | Drag from one point to another |

#### Keyboard Control

| Tool | Endpoint | Description |
|------|----------|-------------|
| `keyboard/type` | `POST /keyboard/type` | Type text string |
| `keyboard/key` | `POST /keyboard/key` | Press specific key |

#### Window Management

| Tool | Endpoint | Description |
|------|----------|-------------|
| `ui/windows` | `GET /ui/windows` | List all open windows |
| `ui/focus` | `POST /ui/focus` | Focus a specific window |
| `ui/active` | `GET /ui/active` | Get currently active window |
| `ui/elements` | `GET /ui/elements` | Get UI elements |

#### Application Control

| Tool | Endpoint | Description |
|------|----------|-------------|
| `applications` | `GET /applications` | List running applications |
| `application/focus` | `POST /application/focus` | Focus an application |
| `application/launch` | `POST /application/launch` | Launch an application |
| `application/close` | `POST /application/close` | Close an application |

---

## API Reference

### Health & Status

```bash
# Health check
curl http://localhost:3459/health
# Response: {"status":"ok","service":"screencontrol"}

# Service status
curl http://localhost:3459/status
# Response:
{
  "success": true,
  "version": "1.2.0",
  "platform": "linux",
  "platformName": "Linux",
  "licensed": true,
  "licenseStatus": "Active",
  "machineId": "abc123...",
  "agentName": "my-server"
}

# Control server connection status
curl http://localhost:3459/control-server/status
# Response:
{
  "connected": true,
  "serverUrl": "wss://screencontrol.example.com/ws",
  "agentId": "agent-uuid",
  "licenseStatus": "Active"
}
```

### Settings

```bash
# Get settings
curl http://localhost:3459/settings
# Response:
{
  "httpPort": 3459,
  "guiBridgePort": 3460,
  "controlServerUrl": "wss://screencontrol.example.com/ws",
  "agentName": "my-server",
  "autoStart": true,
  "enableLogging": true
}

# Update settings
curl -X POST http://localhost:3459/settings \
  -H "Content-Type: application/json" \
  -d '{"agentName": "new-name", "enableLogging": true}'
```

### System Tools

```bash
# Get system information
curl http://localhost:3459/system/info
# Response:
{
  "success": true,
  "os": "Ubuntu 24.04 LTS",
  "osType": "Linux",
  "osVersion": "6.8.0-88-generic",
  "architecture": "x86_64",
  "hostname": "my-server",
  "cpu": "AMD Ryzen 9 5900X",
  "cpuCores": 12,
  "memoryTotal": 32768,
  "memoryUsed": 8192,
  "memoryFree": 24576,
  "uptime": "5:23",
  "uptimeSeconds": 19380
}

# Wait for milliseconds
curl -X POST http://localhost:3459/wait \
  -H "Content-Type: application/json" \
  -d '{"milliseconds": 1000}'

# Read clipboard
curl http://localhost:3459/clipboard/read

# Write clipboard
curl -X POST http://localhost:3459/clipboard/write \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from API"}'
```

### Filesystem Tools

```bash
# List directory
curl -X POST http://localhost:3459/fs/list \
  -H "Content-Type: application/json" \
  -d '{"path":"/home/user"}'

# Read file
curl -X POST http://localhost:3459/fs/read \
  -H "Content-Type: application/json" \
  -d '{"path":"/etc/hostname"}'

# Read specific lines
curl -X POST http://localhost:3459/fs/read_range \
  -H "Content-Type: application/json" \
  -d '{"path":"/etc/passwd","startLine":1,"endLine":5}'

# Write file
curl -X POST http://localhost:3459/fs/write \
  -H "Content-Type: application/json" \
  -d '{"path":"/tmp/test.txt","content":"Hello World\n"}'

# Search files (glob)
curl -X POST http://localhost:3459/fs/search \
  -H "Content-Type: application/json" \
  -d '{"path":"/home/user","glob":"*.txt"}'

# Search content (grep)
curl -X POST http://localhost:3459/fs/grep \
  -H "Content-Type: application/json" \
  -d '{"path":"/var/log","pattern":"error.*failed"}'

# Delete file/directory
curl -X POST http://localhost:3459/fs/delete \
  -H "Content-Type: application/json" \
  -d '{"path":"/tmp/test.txt"}'

# Move/rename
curl -X POST http://localhost:3459/fs/move \
  -H "Content-Type: application/json" \
  -d '{"source":"/tmp/old.txt","destination":"/tmp/new.txt"}'

# Patch file
curl -X POST http://localhost:3459/fs/patch \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp/config.txt",
    "operations": [
      {"type": "replace", "pattern": "old_value", "replacement": "new_value"}
    ]
  }'
```

### Shell Tools

```bash
# Execute command
curl -X POST http://localhost:3459/shell/exec \
  -H "Content-Type: application/json" \
  -d '{"command":"ls -la /tmp","timeout":30}'
# Response:
{
  "success": true,
  "command": "ls -la /tmp",
  "exitCode": 0,
  "stdout": "total 48\ndrwxrwxrwt 12 root...",
  "stderr": ""
}

# Start interactive session
curl -X POST http://localhost:3459/shell/session/start \
  -H "Content-Type: application/json" \
  -d '{"command":"bash","cwd":"/home/user"}'

# Send input to session
curl -X POST http://localhost:3459/shell/session/input \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"abc123","input":"echo hello\n"}'

# Stop session
curl -X POST http://localhost:3459/shell/session/stop \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"abc123"}'
```

### Machine Unlock

```bash
# Check lock status
curl http://localhost:3459/unlock/status
# Response:
{
  "success": true,
  "hasStoredCredentials": true,
  "isLocked": false,
  "platform": "linux"
}

# Store unlock credentials (write-only - NO retrieval!)
curl -X POST http://localhost:3459/unlock/credentials \
  -H "Content-Type: application/json" \
  -d '{"username":"myuser","password":"mypassword"}'

# Unlock machine (uses stored credentials)
curl -X POST http://localhost:3459/unlock

# Clear stored credentials
curl -X DELETE http://localhost:3459/unlock/credentials
```

### GUI Tools (via Tray App)

```bash
# Screenshot
curl "http://localhost:3459/screenshot?format=jpeg&quality=80"

# Mouse position
curl http://localhost:3459/mouse/position

# Move mouse
curl -X POST http://localhost:3459/mouse/move \
  -H "Content-Type: application/json" \
  -d '{"x":100,"y":200}'

# Click
curl -X POST http://localhost:3459/click \
  -H "Content-Type: application/json" \
  -d '{"x":100,"y":200,"button":"left"}'

# Type text
curl -X POST http://localhost:3459/keyboard/type \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello World"}'

# Press key
curl -X POST http://localhost:3459/keyboard/key \
  -H "Content-Type: application/json" \
  -d '{"key":"Return"}'

# List windows
curl http://localhost:3459/ui/windows

# Focus window
curl -X POST http://localhost:3459/ui/focus \
  -H "Content-Type: application/json" \
  -d '{"windowId":12345}'
```

### Control Server Connection

```bash
# Connect to control server
curl -X POST http://localhost:3459/control-server/connect \
  -H "Content-Type: application/json" \
  -d '{
    "serverUrl": "wss://screencontrol.example.com/ws",
    "agentName": "my-server"
  }'

# Disconnect
curl -X POST http://localhost:3459/control-server/disconnect

# Reconnect
curl -X POST http://localhost:3459/control-server/reconnect
```

---

## Building from Source

### Prerequisites

#### Debian/Ubuntu

```bash
sudo apt update
sudo apt install -y build-essential cmake pkg-config \
    libssl-dev libx11-dev libxrandr-dev libxtst-dev \
    libsecret-1-dev
```

#### Fedora/RHEL

```bash
sudo dnf install -y gcc-c++ cmake pkgconfig \
    openssl-devel libX11-devel libXrandr-devel libXtst-devel \
    libsecret-devel
```

#### Arch Linux

```bash
sudo pacman -S base-devel cmake pkgconf \
    openssl libx11 libxrandr libxtst libsecret
```

### Build

```bash
cd service
mkdir -p build && cd build

# Standard build
cmake ..
make -j$(nproc)

# Build with libsecret support (recommended)
cmake .. -DHAVE_LIBSECRET=ON
make -j$(nproc)
```

### Install

```bash
sudo make install
# Or manually:
sudo mkdir -p /opt/screencontrol
sudo cp bin/ScreenControlService /opt/screencontrol/
sudo chmod 755 /opt/screencontrol/ScreenControlService
```

---

## Configuration

### Configuration Files

The service looks for configuration in these locations (in order):

1. Path specified with `-c` flag
2. `/etc/screencontrol/config.json`

**Example configuration:**

```json
{
  "httpPort": 3459,
  "guiBridgePort": 3460,
  "controlServerUrl": "wss://screencontrol.example.com/ws",
  "agentName": "my-linux-server",
  "customerId": "your-customer-id",
  "autoStart": true,
  "enableLogging": true
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `httpPort` | Local HTTP API port | 3459 |
| `guiBridgePort` | GUI proxy port (tray app) | 3460 |
| `controlServerUrl` | WebSocket URL of control server | (required) |
| `agentName` | Display name for this agent | hostname |
| `customerId` | Customer/organization ID | - |
| `autoStart` | Start service on boot | true |
| `enableLogging` | Enable file logging | true |

### Command Line Options

```
Usage: ScreenControlService [options]

Options:
  -c, --config FILE  Configuration file path
  -v, --verbose      Verbose logging
  -h, --help         Show help message
```

---

## Systemd Service Setup

### Automatic Installation

```bash
# Use the installer
sudo ./install.sh

# Or after building:
cd build
sudo make install
sudo systemctl daemon-reload
sudo systemctl enable screencontrol
sudo systemctl start screencontrol
```

### Systemd Unit File

The service uses this systemd unit (`/etc/systemd/system/screencontrol.service`):

```ini
[Unit]
Description=ScreenControl Service
Documentation=https://github.com/screencontrol/screencontrol
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/opt/screencontrol/ScreenControlService
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=5

# Run as root for full functionality
User=root
Group=root

# Security hardening (relaxed for full access)
NoNewPrivileges=false
ProtectSystem=false
ProtectHome=false
PrivateTmp=false

# Environment
Environment=HOME=/root
WorkingDirectory=/opt/screencontrol

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=screencontrol

[Install]
WantedBy=multi-user.target
```

### Service Commands

```bash
# Start/stop/restart
sudo systemctl start screencontrol
sudo systemctl stop screencontrol
sudo systemctl restart screencontrol

# Enable on boot
sudo systemctl enable screencontrol

# Check status
sudo systemctl status screencontrol

# View logs
sudo journalctl -u screencontrol -f

# View recent logs
sudo journalctl -u screencontrol -n 100 --no-pager
```

---

## Display Server Notes

### X11

Full support for all GUI tools when tray app is running:
- Screenshots via `XGetImage`
- Input simulation via `XTest` extension
- Window management via `_NET_WM` protocols

### Wayland

Limited support due to Wayland's security model:
- **Screenshots**: Uses external tools (`grim`, `gnome-screenshot`)
- **Input simulation**: Limited - requires XWayland for full support
- **Window management**: Limited - no standardized protocol

**Recommended for Wayland:**
```bash
# Install grim for screenshots
sudo apt install grim  # or wl-copy for clipboard
```

### Headless Mode

For servers without a display:
- All service tools work normally (filesystem, shell, system)
- GUI tools return "Tray app unavailable" error
- Machine unlock still works (doesn't require display)
- Service handles all control server communication

---

## Security Considerations

### Credential Storage

The service uses a **split-key** architecture for secure credential storage:

1. **K1**: Stored in libsecret (GNOME Keyring, KDE Wallet) or protected file
2. **K2**: Stored in `/etc/screencontrol/k1.key` (root-only access)
3. **Encrypted blob**: Credentials encrypted with AES-256-GCM using combined key

Credentials can be:
- **Stored** via the API (write-only)
- **Used** by the service for machine unlock
- **Never retrieved** via any API endpoint

### Service Permissions

The service runs as root to:
- Survive machine lock
- Access libsecret across all user sessions
- Perform machine unlock operations
- Access all filesystems

### Protected Paths

The following paths are blocked from filesystem tools:
- `/etc/screencontrol/credentials.enc`
- `/etc/screencontrol/k1.key`

### Network Security

- HTTP API binds to `127.0.0.1` only (localhost)
- Control server connections use WSS (WebSocket Secure)
- All communication encrypted in transit

---

## Troubleshooting

### Service won't start

```bash
# Check service status
sudo systemctl status screencontrol

# View detailed logs
sudo journalctl -u screencontrol --no-pager -n 50

# Test binary directly
sudo /opt/screencontrol/ScreenControlService -v
```

### Can't connect to control server

```bash
# Check network connectivity
curl -v https://screencontrol.example.com/health

# Verify config
cat /etc/screencontrol/config.json

# Check connection status
curl http://localhost:3459/control-server/status

# Force reconnect
curl -X POST http://localhost:3459/control-server/reconnect
```

### GUI tools not working

```bash
# Check if tray app is running
ps aux | grep screencontrol

# Check GUI bridge port
curl http://localhost:3460/health

# Check proxy status
curl http://localhost:3459/screenshot
# Will return "GUI proxy not available" if tray app not running
```

### Machine unlock fails

```bash
# Check if credentials are stored
curl http://localhost:3459/unlock/status

# Check lock status
loginctl list-sessions
loginctl show-session <session> -p LockedHint

# View unlock logs
sudo journalctl -u screencontrol | grep -i unlock
```

### libsecret not working

```bash
# Check if libsecret is installed
pkg-config --modversion libsecret-1

# Ensure D-Bus session is available
echo $DBUS_SESSION_BUS_ADDRESS

# Test secret service
secret-tool store --label="test" key value
```

---

## Version History

### v1.2.0 (December 2024)
- **New architecture**: Cross-platform shared service with GUI proxy
- **Machine unlock**: Secure credential storage with split-key encryption
- **Control server**: WebSocket client for remote command execution
- **libsecret support**: Integration with GNOME Keyring / KDE Wallet
- **HTTP API on port 3459** (changed from 3456)

### v1.0.0 (December 2024)
- Initial release
- Full headless tool support
- X11 GUI tools
- Wayland screenshot support
- WebSocket control server integration
- Systemd service support
