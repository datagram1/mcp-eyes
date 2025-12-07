# ScreenControl Windows Agent

Windows implementation using a hybrid architecture: C++ Windows Service + C# WinForms Tray App.

## Architecture

```
+----------------------------------+     +----------------------------+
|     ScreenControlService.exe     |     |   ScreenControlTray.exe    |
|     (C++ Windows Service)        |<--->|   (C# WinForms App)        |
+----------------------------------+     +----------------------------+
|  - Runs as SYSTEM                |     |  - Runs in user session    |
|  - All core functionality        |     |  - System tray icon        |
|  - HTTP server (port 3456)       |     |  - Settings UI             |
|  - Licensing & fingerprinting    |     |  - Service status display  |
|  - Tools (screenshot, click...)  |     |  - Start/stop controls     |
+----------------------------------+     +----------------------------+
           |                                        |
           | HTTP (localhost:3456)                  |
           +----------------------------------------+
```

### Why Hybrid?

- **C++ Service**: Protects all valuable IP (licensing, fingerprinting, tools) - harder to reverse engineer
- **C# WinForms Tray**: Easy UI development with .NET, self-contained single file - if reversed, only exposes HTTP client calls

## Project Structure

```
windows/
├── ScreenControl.sln           # Visual Studio solution
├── ScreenControlService/       # C++ Windows Service
│   ├── main.cpp               # Service entry point
│   ├── service.h/cpp          # Service utilities
│   ├── server/
│   │   └── http_server.h/cpp  # HTTP endpoints (cpp-httplib)
│   ├── core/
│   │   ├── config.h/cpp       # Configuration
│   │   └── logger.h/cpp       # Logging
│   ├── tools/
│   │   ├── gui_tools.h/cpp    # Screenshot, click, keyboard
│   │   ├── ui_automation.h/cpp # Windows UI Automation
│   │   ├── filesystem_tools.h/cpp # File operations
│   │   └── shell_tools.h/cpp  # Command execution
│   └── libs/
│       ├── httplib.h          # cpp-httplib (header-only)
│       └── json.hpp           # nlohmann/json (header-only)
├── ScreenControlTray/          # C# WinForms Tray App
│   ├── Program.cs             # Entry point
│   ├── TrayApplicationContext.cs # Tray icon management
│   ├── SettingsForm.cs        # Settings window
│   └── ServiceClient.cs       # HTTP client to service
└── README.md                   # This file
```

## Building

### Prerequisites

- Windows 10/11
- Visual Studio 2022 with:
  - C++ Desktop Development workload
  - .NET 8.0 SDK

### Build from Visual Studio

1. Open `ScreenControl.sln`
2. Set configuration to `Release | x64`
3. Build Solution (Ctrl+Shift+B)

### Build from Command Line

```cmd
# Build C++ Service
msbuild ScreenControlService\ScreenControlService.vcxproj /p:Configuration=Release /p:Platform=x64

# Build C# Tray App
dotnet publish ScreenControlTray\ScreenControlTray.csproj -c Release -r win-x64 --self-contained
```

## Installation

### Install Service

```cmd
# Run as Administrator
ScreenControlService.exe --install
net start ScreenControlService
```

### Uninstall Service

```cmd
# Run as Administrator
net stop ScreenControlService
ScreenControlService.exe --uninstall
```

### Console Mode (Development)

```cmd
ScreenControlService.exe --console
```

## API Endpoints

All endpoints match the macOS MCPEyes.app for API consistency:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Service status and version |
| `/settings` | GET/POST | Get/set configuration |
| `/fingerprint` | GET | Machine ID for licensing |
| `/license/activate` | POST | Activate license |
| `/license/deactivate` | POST | Deactivate license |
| `/screenshot` | GET | Capture screen |
| `/click` | POST | Mouse click |
| `/keyboard/type` | POST | Type text |
| `/keyboard/key` | POST | Press key |
| `/ui/elements` | GET | Get clickable elements |
| `/ui/windows` | GET | List windows |
| `/fs/list` | POST | List directory |
| `/fs/read` | POST | Read file |
| `/fs/write` | POST | Write file |
| `/shell/exec` | POST | Execute command |

## Configuration

Settings stored in: `%PROGRAMDATA%\ScreenControl\config.json`

```json
{
  "port": 3456,
  "controlServerUrl": "https://control.example.com",
  "licenseKey": "...",
  "autoStart": true,
  "enableLogging": true
}
```

Logs stored in: `%PROGRAMDATA%\ScreenControl\logs\`

## Dependencies

Header-only libraries (included in `libs/`):
- [cpp-httplib](https://github.com/yhirose/cpp-httplib) - HTTP server
- [nlohmann/json](https://github.com/nlohmann/json) - JSON handling

## Legacy MCPEyes

The original `MCPEyes/` folder contains an older all-in-C++ tray app implementation.
The new Service + Tray architecture supersedes it.
