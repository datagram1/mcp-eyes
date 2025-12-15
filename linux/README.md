# ScreenControl Linux Agent

Native C++ agent for Linux with dual-mode support: GUI (GTK tray) and headless service.

## Architecture

```
                    ┌────────────────────────────────┐
                    │       screencontrol            │
                    │     (Native C++ Binary)        │
                    ├────────────────────────────────┤
                    │  - HTTP Server (port 3456)     │
                    │  - X11/Wayland screenshot      │
                    │  - XTest input simulation      │
                    │  - POSIX filesystem tools      │
                    │  - fork/exec shell tools       │
                    ├────────────────────────────────┤
                    │        Mode Detection          │
                    │  DISPLAY set? → GTK tray mode  │
                    │  Otherwise  → Headless daemon  │
                    └────────────────────────────────┘
```

## Project Structure

```
linux/
├── screencontrol/
│   ├── CMakeLists.txt          # CMake build system
│   ├── main.cpp                # Entry point (dual-mode)
│   ├── server/
│   │   └── http_server.h/cpp   # HTTP API endpoints
│   ├── core/
│   │   ├── config.h/cpp        # Configuration
│   │   └── logger.h/cpp        # Logging (syslog + file)
│   ├── tools/
│   │   ├── gui_tools.h/cpp     # X11/Wayland screenshot, XTest input
│   │   ├── filesystem_tools.h/cpp # POSIX file operations
│   │   ├── shell_tools.h/cpp   # fork/exec command execution
│   │   ├── ui_automation.h/cpp # X11 window management
│   │   └── system_tools.h/cpp  # System info, clipboard, utilities
│   └── libs/
│       ├── httplib.h           # cpp-httplib (header-only)
│       └── json.hpp            # nlohmann/json (header-only)
└── README.md                   # This file
```

## Building

### Prerequisites

```bash
# Debian/Ubuntu
sudo apt install build-essential cmake pkg-config \
    libx11-dev libxext-dev libxtst-dev libxrandr-dev \
    libgtk-3-dev xclip

# Fedora/RHEL
sudo dnf install gcc-c++ cmake pkgconfig \
    libX11-devel libXext-devel libXtst-devel libXrandr-devel \
    gtk3-devel

# Arch Linux
sudo pacman -S base-devel cmake pkgconf \
    libx11 libxext libxtst libxrandr gtk3
```

### Build

```bash
cd linux/screencontrol
mkdir build && cd build

# GUI mode (with GTK tray)
cmake .. -DBUILD_GUI=ON
make -j$(nproc)

# Headless mode only
cmake .. -DBUILD_GUI=OFF -DBUILD_HEADLESS=ON
make -j$(nproc)
```

### Install

```bash
sudo make install
# Or manually:
sudo cp screencontrol /usr/local/bin/
```

## Usage

### GUI Mode (Desktop)

When running on a desktop with X11/Wayland, the agent starts with a GTK system tray icon:

```bash
./screencontrol
```

### Headless/Daemon Mode

For servers or headless systems:

```bash
# Run as daemon
./screencontrol --daemon

# Or with custom options
./screencontrol -d -p 3456 -l /var/log/screencontrol.log
```

### Command Line Options

```
Options:
  -d, --daemon      Run as background daemon
  -p, --port PORT   HTTP server port (default: 3456)
  -c, --config FILE Configuration file path
  -l, --log FILE    Log file path
  -v, --verbose     Verbose logging
  -h, --help        Show help message
  --version         Show version

Service commands:
  --install         Install systemd service
  --uninstall       Remove systemd service
```

### Systemd Service

```bash
# Install service
sudo ./screencontrol --install
sudo systemctl start screencontrol
sudo systemctl enable screencontrol

# Check status
sudo systemctl status screencontrol

# Uninstall
sudo ./screencontrol --uninstall
```

## API Endpoints

All endpoints match macOS/Windows agents for consistency:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/status` | GET | Service status |
| `/settings` | GET/POST | Configuration |
| `/fingerprint` | GET | Machine ID |
| `/screenshot` | GET | Capture screen |
| `/click` | POST | Mouse click |
| `/keyboard/type` | POST | Type text |
| `/keyboard/key` | POST | Press key |
| `/mouse/move` | POST | Move mouse cursor |
| `/mouse/scroll` | POST | Scroll mouse wheel |
| `/mouse/drag` | POST | Drag from one point to another |
| `/mouse/position` | GET | Get current mouse position |
| `/ui/windows` | GET | List windows |
| `/ui/focus` | POST | Focus window |
| `/ui/active` | GET | Get active window |
| `/fs/list` | POST | List directory |
| `/fs/read` | POST | Read file |
| `/fs/write` | POST | Write file |
| `/fs/search` | POST | Glob search |
| `/fs/grep` | POST | Regex search |
| `/shell/exec` | POST | Execute command |
| `/system/info` | GET | System information (OS, CPU, memory, hostname) |
| `/clipboard/read` | GET | Read clipboard content |
| `/clipboard/write` | POST | Write to clipboard |
| `/wait` | POST | Wait for specified milliseconds |

## Configuration

Default config location: `/etc/screencontrol/config.json`

```json
{
  "port": 3456,
  "controlServerUrl": "https://control.example.com",
  "autoStart": true,
  "enableLogging": true
}
```

Log location: `/var/log/screencontrol.log` (or syslog when running as daemon)

## Platform Notes

### X11 vs Wayland

- **Screenshot**: X11 uses XGetImage; Wayland falls back to gnome-screenshot/grim/spectacle
- **Input simulation**: XTest extension (X11 only, limited on Wayland)
- **Window management**: _NET_WM protocols (X11)

### Permissions

- No special permissions needed for basic operation
- For keyboard/mouse simulation, user must be in `input` group on some distros

### Display Server Detection

The agent automatically detects the display server:
- If `DISPLAY` or `WAYLAND_DISPLAY` is set and `--daemon` not specified → GTK mode
- Otherwise → Headless daemon mode

## Dependencies

Header-only libraries (included):
- [cpp-httplib](https://github.com/yhirose/cpp-httplib) - HTTP server
- [nlohmann/json](https://github.com/nlohmann/json) - JSON handling

System libraries:
- X11, Xext, XTest, Xrandr - X Window System
- GTK+ 3 (optional) - GUI mode
