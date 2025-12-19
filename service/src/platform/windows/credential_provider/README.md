# ScreenControl Credential Provider

Windows Credential Provider for automatic screen unlock via the ScreenControl service.

## Overview

This Credential Provider integrates with Windows Logon UI to enable automatic screen unlock when triggered remotely via the ScreenControl control server. It replaces the experimental VNC-based unlock approach with native Windows integration.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     LOCK SCREEN (Secure Desktop)            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         ScreenControlCP.dll (in Winlogon)           │    │
│  │         - Displays "ScreenControl Auto-Unlock" tile │    │
│  │         - Polls service for unlock command          │    │
│  │         - Returns credentials to Windows            │    │
│  └──────────────────────┬──────────────────────────────┘    │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTP (localhost:3459)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              ScreenControlService.exe (SYSTEM)              │
│  - WebSocket connection to control server                   │
│  - Receives "machine_unlock" commands                       │
│  - Stores encrypted credentials (DPAPI)                     │
│  - Sets unlock pending flag for CP                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ WSS
                           ▼
                    ┌──────────────┐
                    │Control Server│
                    └──────────────┘
```

## Building

### Prerequisites

- Visual Studio 2019 or later with C++ Desktop workload
- Windows SDK 10.0.19041.0 or later

### Build Steps

#### Option 1: Visual Studio

1. Open `ScreenControlCP.sln` in Visual Studio
2. Select configuration (Release|x64 or Release|ARM64)
3. Build the solution (F7 or Build > Build Solution)
4. Output: `dist/windows-x64/ScreenControlCP.dll` or `dist/windows-arm64/ScreenControlCP.dll`

#### Option 2: CMake

```powershell
# Open Developer Command Prompt for VS
cd service\src\platform\windows\credential_provider
mkdir build && cd build
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
```

**Note:** The credential provider MUST be built with MSVC. It cannot be cross-compiled with MinGW or Zig due to COM DLL requirements.

## Installation

### Prerequisites

1. ScreenControl Service installed and running
2. Administrator privileges

### Install Steps

1. Copy `ScreenControlCP.dll` to `C:\Program Files\ScreenControl\`

2. Register the credential provider (as Administrator):
   ```powershell
   .\scripts\register_cp.ps1
   ```

   Or manually:
   ```cmd
   regsvr32 "C:\Program Files\ScreenControl\ScreenControlCP.dll"
   ```

3. Verify registration:
   - The credential provider should appear at:
     `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\{A7B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D}`

## Usage

### One-Time Credential Setup

Store Windows login credentials in the service:

```powershell
# Using curl or PowerShell
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:3459/unlock/credentials" `
    -ContentType "application/json" `
    -Body '{"username": "your_username", "password": "your_password"}'
```

For domain accounts, use `DOMAIN\username` or `username@domain.com` format.

### Automatic Unlock Flow

1. Control server sends `machine_unlock` command
2. Service sets "unlock pending" flag
3. Credential provider (running on lock screen) detects the flag
4. CP fetches credentials from service
5. CP returns credentials to Windows for authentication
6. Windows unlocks the workstation

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/credential-provider/status` | GET | Check CP status and settings |
| `/credential-provider/unlock` | GET | Check if unlock is pending (polled by CP) |
| `/credential-provider/credentials` | GET | Fetch credentials (internal use) |
| `/credential-provider/result` | POST | Report unlock result |

## Uninstallation

1. Unregister the credential provider (as Administrator):
   ```powershell
   .\scripts\unregister_cp.ps1
   ```

   Or manually:
   ```cmd
   regsvr32 /u "C:\Program Files\ScreenControl\ScreenControlCP.dll"
   ```

2. Delete the DLL:
   ```cmd
   del "C:\Program Files\ScreenControl\ScreenControlCP.dll"
   ```

## Security Considerations

1. **Credentials are encrypted** with DPAPI and split-key architecture
2. **Localhost-only API** - credentials endpoint not exposed externally
3. **Unlock flag required** - credentials only returned when unlock is pending
4. **Runs as SYSTEM** - same privilege level as Winlogon
5. **Code signing recommended** for production deployment

## Troubleshooting

### Credential provider tile not appearing

1. Verify DLL is registered:
   ```powershell
   Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\{A7B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D}"
   ```

2. Check Windows Event Log for errors

3. Verify service is running:
   ```powershell
   sc query ScreenControlService
   ```

### Auto-unlock not working

1. Check if credentials are stored:
   ```powershell
   Invoke-RestMethod "http://127.0.0.1:3459/unlock/status"
   ```

2. Check credential provider status:
   ```powershell
   Invoke-RestMethod "http://127.0.0.1:3459/credential-provider/status"
   ```

3. Review service logs:
   `C:\ProgramData\ScreenControl\Logs\service.log`

### Debugging

To debug the credential provider:

1. Enable LogonUI debugging in registry
2. Attach debugger to `LogonUI.exe` process
3. Use OutputDebugString for tracing (view with DebugView)

## GUID Reference

- **Credential Provider CLSID:** `{A7B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D}`
- **Registry Paths:**
  - `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\{GUID}`
  - `HKCR\CLSID\{GUID}`
