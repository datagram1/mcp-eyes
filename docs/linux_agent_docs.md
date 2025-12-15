# ScreenControl Linux Agent Documentation

Native C++ agent for Linux with dual-mode support: **GUI** (with X11/Wayland desktop integration) and **Headless** (daemon/service mode).

## Overview

The Linux agent provides the same functionality as the macOS agent, enabling AI assistants to control Linux desktops remotely via the ScreenControl control server.

```
                    ┌────────────────────────────────────────┐
                    │         ScreenControl Linux Agent      │
                    │           (Native C++ Binary)          │
                    ├────────────────────────────────────────┤
                    │  - HTTP Server (port 3456)             │
                    │  - WebSocket client (control server)   │
                    │  - X11/Wayland screenshot              │
                    │  - XTest input simulation (X11)        │
                    │  - POSIX filesystem tools              │
                    │  - fork/exec shell execution           │
                    ├────────────────────────────────────────┤
                    │           Mode Detection               │
                    │  DISPLAY set? → GUI mode with X11      │
                    │  Otherwise   → Headless daemon mode    │
                    └────────────────────────────────────────┘
```

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
curl -fsSL https://raw.githubusercontent.com/datagram1/mcp-eyes/main/linux/install.sh | sudo bash
```

Or download and run manually:

```bash
wget https://raw.githubusercontent.com/datagram1/mcp-eyes/main/linux/install.sh
chmod +x install.sh
sudo ./install.sh
```

### Manual Build & Install

See [Building from Source](#building-from-source) below.

---

## Tools Reference

### Headless Tools (Always Available)

These tools work in both GUI and headless modes:

| Tool | Endpoint | Description |
|------|----------|-------------|
| `system_info` | `GET /system/info` | System information (OS, CPU, memory, hostname, uptime) |
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

### GUI Tools (Require Display Server)

These tools require an active X11 or Wayland session:

#### Screenshot & Display

| Tool | Endpoint | Description |
|------|----------|-------------|
| `screenshot` | `GET /screenshot` | Capture entire screen (X11: XGetImage, Wayland: grim/gnome-screenshot) |

#### Mouse Control

| Tool | Endpoint | Description |
|------|----------|-------------|
| `click` | `POST /click` | Click at coordinates (left, right, middle button) |
| `mouse/move` | `POST /mouse/move` | Move mouse cursor to coordinates |
| `mouse/position` | `GET /mouse/position` | Get current mouse cursor position |
| `mouse/scroll` | `POST /mouse/scroll` | Scroll mouse wheel (up/down) |
| `mouse/drag` | `POST /mouse/drag` | Drag from one point to another |

#### Keyboard Control

| Tool | Endpoint | Description |
|------|----------|-------------|
| `keyboard/type` | `POST /keyboard/type` | Type text string |
| `keyboard/key` | `POST /keyboard/key` | Press specific key (Enter, Tab, Super_L, etc.) |

#### Window Management

| Tool | Endpoint | Description |
|------|----------|-------------|
| `ui/windows` | `GET /ui/windows` | List all open windows with title, class, size, position |
| `ui/focus` | `POST /ui/focus` | Focus a specific window by ID |
| `ui/active` | `GET /ui/active` | Get currently active window |

---

## API Reference

### Health & Status

```bash
# Health check
curl http://localhost:3456/health
# Response: {"status":"ok"}

# Service status
curl http://localhost:3456/status
# Response: {"connected":true,"agentId":"xxx","uptime":3600}
```

### System Tools

```bash
# Get system information
curl http://localhost:3456/system/info
# Response:
{
  "success": true,
  "os": "Ubuntu 24.04.3 LTS",
  "osType": "Linux",
  "osVersion": "6.8.0-88-generic",
  "architecture": "aarch64",
  "hostname": "ubuntu-server",
  "cpu": "ARM Cortex-A76",
  "cpuCores": 8,
  "memoryTotal": 8192,
  "memoryUsed": 2048,
  "memoryFree": 6144,
  "uptime": "5:23",
  "uptimeSeconds": 19380
}

# Wait for milliseconds
curl -X POST http://localhost:3456/wait \
  -H "Content-Type: application/json" \
  -d '{"milliseconds": 1000}'
# Response: {"success":true,"waited":1000}

# Read clipboard
curl http://localhost:3456/clipboard/read
# Response: {"success":true,"text":"clipboard content here"}

# Write clipboard
curl -X POST http://localhost:3456/clipboard/write \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from API"}'
# Response: {"success":true,"bytesWritten":14}
```

### Filesystem Tools

```bash
# List directory
curl -X POST http://localhost:3456/fs/list \
  -H "Content-Type: application/json" \
  -d '{"path":"/home/user"}'
# Response:
{
  "success": true,
  "path": "/home/user",
  "entries": [
    {"name": "Documents", "isDirectory": true, "isFile": false, "size": 4096},
    {"name": "file.txt", "isDirectory": false, "isFile": true, "size": 1234}
  ]
}

# Read file
curl -X POST http://localhost:3456/fs/read \
  -H "Content-Type: application/json" \
  -d '{"path":"/etc/hostname"}'
# Response: {"success":true,"content":"ubuntu-server\n","size":14}

# Read specific lines
curl -X POST http://localhost:3456/fs/read_range \
  -H "Content-Type: application/json" \
  -d '{"path":"/etc/passwd","start_line":1,"end_line":5}'

# Write file
curl -X POST http://localhost:3456/fs/write \
  -H "Content-Type: application/json" \
  -d '{"path":"/tmp/test.txt","content":"Hello World\n"}'
# Response: {"success":true,"bytesWritten":12,"mode":"overwrite"}

# Search files (glob)
curl -X POST http://localhost:3456/fs/search \
  -H "Content-Type: application/json" \
  -d '{"path":"/home/user","pattern":"*.txt"}'
# Response: {"success":true,"count":5,"matches":["/home/user/a.txt",...]}

# Search content (grep)
curl -X POST http://localhost:3456/fs/grep \
  -H "Content-Type: application/json" \
  -d '{"path":"/var/log","pattern":"error.*failed"}'
# Response: {"success":true,"count":3,"matches":[{"file":"/var/log/syslog","line":42,"content":"..."}]}

# Delete file/directory
curl -X POST http://localhost:3456/fs/delete \
  -H "Content-Type: application/json" \
  -d '{"path":"/tmp/test.txt"}'
# For directories: '{"path":"/tmp/mydir","recursive":true}'

# Move/rename
curl -X POST http://localhost:3456/fs/move \
  -H "Content-Type: application/json" \
  -d '{"source":"/tmp/old.txt","destination":"/tmp/new.txt"}'

# Patch file
curl -X POST http://localhost:3456/fs/patch \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp/config.txt",
    "operations": [
      {"type": "replace", "pattern": "old_value", "replacement": "new_value"},
      {"type": "replace_all", "pattern": "foo", "replacement": "bar"}
    ]
  }'
# Response: {"success":true,"modified":true,"path":"/tmp/config.txt"}
```

### Shell Tools

```bash
# Execute command
curl -X POST http://localhost:3456/shell/exec \
  -H "Content-Type: application/json" \
  -d '{"command":"ls -la /tmp","timeout":30}'
# Response:
{
  "success": true,
  "command": "ls -la /tmp",
  "exit_code": 0,
  "stdout": "total 48\ndrwxrwxrwt 12 root...",
  "stderr": ""
}

# Start interactive session
curl -X POST http://localhost:3456/shell/session/start \
  -H "Content-Type: application/json" \
  -d '{"command":"bash","cwd":"/home/user"}'
# Response: {"success":true,"sessionId":"abc123"}

# Send input to session
curl -X POST http://localhost:3456/shell/session/input \
  -H "Content-Type: application/json" \
  -d '{"session_id":"abc123","input":"echo hello\n"}'

# Stop session
curl -X POST http://localhost:3456/shell/session/stop \
  -H "Content-Type: application/json" \
  -d '{"session_id":"abc123"}'
```

### GUI Tools (X11/Wayland)

```bash
# Screenshot
curl "http://localhost:3456/screenshot?format=jpeg&quality=80" --output screen.jpg
# Or get base64: curl "http://localhost:3456/screenshot?return_base64=true"

# Mouse position
curl http://localhost:3456/mouse/position
# Response: {"success":true,"x":512,"y":384}

# Move mouse
curl -X POST http://localhost:3456/mouse/move \
  -H "Content-Type: application/json" \
  -d '{"x":100,"y":200}'

# Click
curl -X POST http://localhost:3456/click \
  -H "Content-Type: application/json" \
  -d '{"x":100,"y":200,"button":"left"}'
# Options: "left", "right", "middle"

# Double click
curl -X POST http://localhost:3456/click \
  -H "Content-Type: application/json" \
  -d '{"x":100,"y":200,"button":"left","clicks":2}'

# Scroll
curl -X POST http://localhost:3456/mouse/scroll \
  -H "Content-Type: application/json" \
  -d '{"direction":"down","amount":3}'

# Drag
curl -X POST http://localhost:3456/mouse/drag \
  -H "Content-Type: application/json" \
  -d '{"startX":100,"startY":100,"endX":300,"endY":300}'

# Type text
curl -X POST http://localhost:3456/keyboard/type \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello World"}'

# Press key
curl -X POST http://localhost:3456/keyboard/key \
  -H "Content-Type: application/json" \
  -d '{"key":"Return"}'
# Common keys: Return, Tab, Escape, BackSpace, Delete, Super_L, Control_L, Alt_L

# List windows
curl http://localhost:3456/ui/windows
# Response:
{
  "success": true,
  "windows": [
    {"windowId": 12345, "title": "Terminal", "className": "gnome-terminal", "x": 0, "y": 0, "width": 800, "height": 600}
  ]
}

# Focus window
curl -X POST http://localhost:3456/ui/focus \
  -H "Content-Type: application/json" \
  -d '{"windowId":12345}'
```

---

## Building from Source

### Prerequisites

#### Debian/Ubuntu

```bash
sudo apt update
sudo apt install -y build-essential cmake pkg-config \
    libx11-dev libxext-dev libxtst-dev libxrandr-dev \
    libgtk-3-dev xclip grim
```

#### Fedora/RHEL

```bash
sudo dnf install -y gcc-c++ cmake pkgconfig \
    libX11-devel libXext-devel libXtst-devel libXrandr-devel \
    gtk3-devel xclip grim
```

#### Arch Linux

```bash
sudo pacman -S base-devel cmake pkgconf \
    libx11 libxext libxtst libxrandr gtk3 xclip grim
```

### Build

```bash
cd linux/screencontrol
mkdir -p build && cd build

# GUI mode (with GTK tray icon)
cmake .. -DBUILD_GUI=ON
make -j$(nproc)

# Headless mode only (smaller binary, no GTK dependency)
cmake .. -DBUILD_GUI=OFF -DBUILD_HEADLESS=ON
make -j$(nproc)
```

### Install

```bash
sudo make install
# Or manually:
sudo cp screencontrol /usr/local/bin/
sudo chmod +x /usr/local/bin/screencontrol
```

---

## Configuration

### Configuration File

The agent looks for configuration in these locations (in order):
1. Path specified with `-c` flag
2. `/etc/screencontrol/debug-config.json`
3. `~/.config/screencontrol/config.json`

**Example configuration:**

```json
{
  "serverUrl": "wss://your-control-server.com/ws",
  "serverHttpUrl": "https://your-control-server.com",
  "endpointUuid": "your-endpoint-uuid",
  "customerId": "your-customer-id",
  "connectOnStartup": true,
  "port": 3456
}
```

| Field | Description |
|-------|-------------|
| `serverUrl` | WebSocket URL of control server |
| `serverHttpUrl` | HTTP URL of control server |
| `endpointUuid` | MCP endpoint UUID (from control server) |
| `customerId` | Customer/organization ID |
| `connectOnStartup` | Auto-connect on agent start |
| `port` | Local HTTP API port (default: 3456) |

### Command Line Options

```
Usage: screencontrol [options]

Options:
  -d, --daemon       Run as background daemon (detach from terminal)
  -p, --port PORT    HTTP server port (default: 3456)
  -c, --config FILE  Configuration file path
  -l, --log FILE     Log file path
  -v, --verbose      Verbose logging
  -h, --help         Show help message
  --version          Show version

Service commands:
  --install          Install systemd service
  --uninstall        Remove systemd service
```

---

## Systemd Service Setup

### Automatic Installation

```bash
sudo screencontrol --install
sudo systemctl start screencontrol
sudo systemctl enable screencontrol
```

### Manual Installation

Create `/etc/systemd/system/screencontrol-agent.service`:

```ini
[Unit]
Description=ScreenControl Linux Agent
After=network.target graphical.target

[Service]
Type=simple
ExecStart=/usr/local/bin/screencontrol -c /etc/screencontrol/debug-config.json -p 3456 -v
Restart=always
RestartSec=5
User=root

# For GUI tools (X11), set display environment
Environment="DISPLAY=:0"
Environment="XAUTHORITY=/tmp/xauth_XXXXXX"

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Important:** For GUI tools, you must set `DISPLAY` and `XAUTHORITY` to match your active X session. Find these values with:

```bash
# Find DISPLAY
echo $DISPLAY

# Find XAUTHORITY (from your window manager process)
cat /proc/$(pgrep -f "kwin|gnome-shell|mutter")/environ | tr '\0' '\n' | grep XAUTHORITY
```

### Service Commands

```bash
# Start/stop/restart
sudo systemctl start screencontrol-agent
sudo systemctl stop screencontrol-agent
sudo systemctl restart screencontrol-agent

# Enable on boot
sudo systemctl enable screencontrol-agent

# Check status
sudo systemctl status screencontrol-agent

# View logs
sudo journalctl -u screencontrol-agent -f
```

---

## Display Server Notes

### X11

Full support for all GUI tools:
- Screenshots via `XGetImage`
- Input simulation via `XTest` extension
- Window management via `_NET_WM` protocols

### Wayland

Limited support due to Wayland's security model:
- **Screenshots**: Uses external tools (`grim`, `gnome-screenshot`, or `spectacle`)
- **Input simulation**: Limited - XTest doesn't work under pure Wayland
- **Window management**: Limited - no standardized protocol

**Recommended for Wayland:**
- Install `grim` for screenshots: `sudo apt install grim`
- Consider running under XWayland for full input simulation support

### Headless Mode

For servers without a display:
- All filesystem and shell tools work normally
- Screenshot/input/window tools return appropriate errors
- Use `-d` or `--daemon` flag to run as background service

---

## Security Considerations

1. **Run as dedicated user**: For production, create a dedicated user instead of running as root
2. **Firewall**: The HTTP API listens on localhost by default; use firewall rules if needed
3. **TLS**: Control server connections use WSS (WebSocket Secure)
4. **Permissions**: No special permissions needed for basic operation
5. **Input group**: For keyboard/mouse simulation, user may need to be in `input` group

---

## Troubleshooting

### Agent won't connect to control server

```bash
# Check connectivity
curl -v https://your-control-server.com/health

# Check config
cat /etc/screencontrol/debug-config.json

# Check logs
sudo journalctl -u screencontrol-agent -n 50
```

### Screenshot returns error

```bash
# Check display environment
echo $DISPLAY

# For Wayland, ensure grim is installed
which grim

# Test screenshot locally
curl http://localhost:3456/screenshot --output test.jpg
```

### Input simulation not working

```bash
# Verify XTest extension (X11)
xdpyinfo | grep -i test

# Check user is in input group
groups $USER

# Add user to input group if needed
sudo usermod -aG input $USER
```

### Service fails to start

```bash
# Check service status
sudo systemctl status screencontrol-agent

# View full logs
sudo journalctl -u screencontrol-agent --no-pager

# Test binary directly
/usr/local/bin/screencontrol -v
```

---

## Architecture

### Source Structure

```
linux/screencontrol/
├── CMakeLists.txt              # CMake build configuration
├── main.cpp                    # Entry point, mode detection, WebSocket client
├── server/
│   └── http_server.h/cpp       # HTTP API endpoints
├── core/
│   ├── config.h/cpp            # Configuration loading
│   └── logger.h/cpp            # Logging (syslog + file)
├── tools/
│   ├── gui_tools.h/cpp         # X11/Wayland screenshot, XTest input
│   ├── filesystem_tools.h/cpp  # POSIX file operations
│   ├── shell_tools.h/cpp       # fork/exec command execution
│   ├── ui_automation.h/cpp     # X11 window management
│   └── system_tools.h/cpp      # System info, clipboard, wait
└── libs/
    ├── httplib.h               # cpp-httplib (header-only HTTP server)
    └── json.hpp                # nlohmann/json (header-only JSON)
```

### Dependencies

**Header-only libraries (included in source):**
- [cpp-httplib](https://github.com/yhirose/cpp-httplib) - HTTP server
- [nlohmann/json](https://github.com/nlohmann/json) - JSON handling

**System libraries:**
- X11, Xext, XTest, Xrandr - X Window System
- GTK+ 3 (optional) - GUI mode tray icon
- pthreads - Threading
- OpenSSL - TLS for WebSocket connections

---

## Version History

### v1.0.0 (December 2024)
- Initial release
- Full headless tool support (15 tools)
- X11 GUI tools (screenshot, input, windows)
- Wayland screenshot support via grim
- WebSocket control server integration
- Systemd service support
- ARM64 and x86_64 support
