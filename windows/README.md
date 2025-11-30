# MCP-Eyes Windows Implementation

Windows tray application implementation of MCP-Eyes using C++ and Win32 API.

## Building

### Prerequisites

- Windows 10/11
- Visual Studio 2019 or later (with C++ desktop development workload)
- CMake 3.20 or later
- Windows SDK 10.0 or later

### Build Steps

1. Open a Developer Command Prompt for VS (or use Visual Studio)

2. Create build directory:
```cmd
mkdir build
cd build
```

3. Configure with CMake:
```cmd
cmake .. -G "Visual Studio 17 2022" -A x64
```

Or for 32-bit:
```cmd
cmake .. -G "Visual Studio 17 2022" -A Win32
```

4. Build:
```cmd
cmake --build . --config Release
```

The executable will be in `build/bin/Release/MCPEyes.exe`

## Features

- System tray icon with context menu
- Settings window with all configuration options
- HTTP server for MCP protocol communication
- Windows UI Automation for accessibility
- Screenshot capture (full screen and window-specific)
- Mouse and keyboard control
- Application listing and focus
- Start at login support

## Architecture

- **AppDelegate**: Main application class, handles tray icon and lifecycle
- **SettingsWindow**: Settings dialog UI
- **MCPServer**: HTTP server wrapper using cpp-httplib
- **WindowsPlatform**: Windows-specific automation implementation

## Configuration

Settings are stored in Windows Registry:
- Key: `HKEY_CURRENT_USER\Software\MCPEyes`
- Values: AgentName, NetworkMode, Port, APIKey, etc.

Token file is saved to: `%USERPROFILE%\.mcp-eyes-token`

## API Endpoints

The server exposes the same HTTP endpoints as the macOS version:

- `GET /health` - Health check
- `GET /permissions` - Check permissions
- `GET /listApplications` - List running applications
- `POST /focusApplication` - Focus an application
- `GET /screenshot` - Take screenshot
- `POST /click` - Click at coordinates
- `POST /typeText` - Type text
- `POST /pressKey` - Press keyboard key
- `GET /getClickableElements` - Get UI elements

All endpoints (except `/health`) require API key authentication via `Authorization: Bearer <apiKey>` header.

## Notes

- Windows doesn't require explicit accessibility or screen recording permissions like macOS
- UI Automation should work without special permissions
- The application runs as a tray app (no console window)
- Icons need to be created and added to the resource file

