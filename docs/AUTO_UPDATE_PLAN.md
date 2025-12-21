# Auto-Update System Implementation Plan

## Overview

Implement a secure, cross-platform auto-update system for ScreenControl agents that:
- Checks for updates during heartbeat cycles (~every 5 minutes)
- Downloads updates automatically with machine signature authentication
- Respects user preferences (auto-install, manual, or scheduled)
- Preserves all configuration during updates
- Supports Windows, macOS, and Linux (x86 + ARM64)
- Restricts build uploads to internal network (192.168.10.x / 192.168.11.x)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    screencontrol.knws.co.uk                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  WebSocket API  │  │   Update API    │  │    Build Storage        │  │
│  │  (existing)     │  │  /api/updates/* │  │  /builds/{platform}/    │  │
│  │                 │  │                 │  │   ├── windows-x64/      │  │
│  │  heartbeat_ack  │  │  GET /check     │  │   ├── windows-arm64/    │  │
│  │  + updateFlag   │  │  GET /download  │  │   ├── macos-arm64/      │  │
│  │                 │  │  POST /upload   │  │   ├── macos-x64/        │  │
│  └────────┬────────┘  └────────┬────────┘  │   ├── linux-x64/        │  │
│           │                    │           │   └── linux-arm64/      │  │
└───────────┼────────────────────┼───────────┴─────────────────────────────┘
            │                    │
            │   Internet         │
            │                    │
┌───────────┴────────────────────┴───────────────────────────────────────┐
│                         Agent (Service)                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │ Heartbeat Loop  │  │  Update Manager │  │   Update Installer      │ │
│  │                 │  │                 │  │                         │ │
│  │ Every N beats   │→ │ Check version   │→ │ Download + verify       │ │
│  │ check update=1  │  │ Download if new │  │ Stop service            │ │
│  │                 │  │ Respect schedule│  │ Backup config           │ │
│  │                 │  │                 │  │ Replace binaries        │ │
│  │                 │  │                 │  │ Restart service         │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Server-Side Components

### 1. Update API Endpoints (Node.js/Express)

**File**: `server/routes/updates.js`

```javascript
// GET /api/updates/check
// Query: platform, arch, currentVersion, machineId, fingerprint
// Response: { updateAvailable: bool, version: string, size: number, sha256: string, releaseNotes: string }

// GET /api/updates/download/:platform/:arch/:version
// Headers: X-Machine-Id, X-Fingerprint (for auth)
// Response: Binary file stream

// POST /api/updates/upload (internal network only)
// Body: multipart/form-data with build artifacts
// Middleware: checkInternalNetwork (192.168.10.x, 192.168.11.x only)
```

### 2. Version Manifest

**File**: `server/data/versions.json`
```json
{
  "latest": "1.2.1",
  "platforms": {
    "windows-x64": {
      "version": "1.2.1",
      "file": "ScreenControl-1.2.1-windows-x64.zip",
      "sha256": "abc123...",
      "size": 12345678,
      "releaseDate": "2025-12-20T10:00:00Z"
    },
    "windows-arm64": { ... },
    "macos-arm64": { ... },
    "macos-x64": { ... },
    "linux-x64": { ... },
    "linux-arm64": { ... }
  },
  "releaseNotes": "## v1.2.1\n- Bug fixes\n- Performance improvements",
  "minVersion": "1.0.0"
}
```

### 3. Build Storage Structure

```
/var/www/screencontrol/builds/
├── versions.json
├── windows-x64/
│   ├── ScreenControl-1.2.1-windows-x64.zip
│   └── ScreenControl-1.2.0-windows-x64.zip
├── windows-arm64/
│   └── ScreenControl-1.2.1-windows-arm64.zip
├── macos-arm64/
│   └── ScreenControl-1.2.1-macos-arm64.tar.gz
├── macos-x64/
│   └── ScreenControl-1.2.1-macos-x64.tar.gz
├── linux-x64/
│   └── ScreenControl-1.2.1-linux-x64.tar.gz
└── linux-arm64/
    └── ScreenControl-1.2.1-linux-arm64.tar.gz
```

### 4. Network Restriction Middleware

```javascript
// Only allow uploads from internal network
function checkInternalNetwork(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const isInternal = ip.startsWith('192.168.10.') ||
                     ip.startsWith('192.168.11.') ||
                     ip === '127.0.0.1';
  if (!isInternal) {
    return res.status(403).json({ error: 'Upload restricted to internal network' });
  }
  next();
}
```

---

## Agent-Side Components

### 1. Heartbeat Enhancement

**File**: `service/src/control_server/websocket_client.cpp`

Modify `heartbeat_ack` handler to include update flag:

```cpp
// In processMessage() for heartbeat_ack:
if (type == "heartbeat_ack") {
    // Existing heartbeat logic...

    // Check update flag (bit 0/1 to minimize bandwidth)
    if (msg.contains("u") && msg["u"].get<int>() == 1) {
        // Trigger update check (not every heartbeat, spread over ~5 mins)
        if (shouldCheckUpdate()) {
            m_updateManager->checkForUpdate();
        }
    }

    // Check scheduled update time
    if (msg.contains("updateAt")) {
        m_updateManager->setScheduledTime(msg["updateAt"].get<int64_t>());
    }
}
```

### 2. Update Manager Class

**New File**: `service/src/update/update_manager.h`

```cpp
class UpdateManager {
public:
    UpdateManager(const std::string& serverUrl, const std::string& machineId);

    // Check for available update
    void checkForUpdate();

    // Download update package
    bool downloadUpdate(const std::string& version);

    // Verify downloaded package (SHA256)
    bool verifyPackage(const std::string& filepath, const std::string& expectedHash);

    // Apply update (platform-specific)
    bool applyUpdate();

    // Configuration
    void setScheduledTime(int64_t timestamp);
    void setUpdateMode(UpdateMode mode); // AUTO, MANUAL, SCHEDULED

    // Status
    bool isUpdateAvailable() const;
    std::string getAvailableVersion() const;
    UpdateStatus getStatus() const;

private:
    std::string m_serverUrl;
    std::string m_machineId;
    std::string m_fingerprint;
    std::string m_currentVersion;
    std::string m_platform;  // "windows", "macos", "linux"
    std::string m_arch;      // "x64", "arm64"

    std::atomic<bool> m_updateAvailable;
    std::string m_availableVersion;
    int64_t m_scheduledTime;
    UpdateMode m_updateMode;

    std::thread m_downloadThread;
    std::mutex m_mutex;
};
```

### 3. Platform-Specific Update Installers

**Windows** (`service/src/update/update_windows.cpp`):
```cpp
bool UpdateManager::applyUpdateWindows() {
    // 1. Download to %TEMP%\ScreenControl-update\
    // 2. Verify SHA256
    // 3. Create update script (batch file):
    //    - Stop ScreenControlService
    //    - Stop ScreenControlTray.exe
    //    - Backup config from C:\ProgramData\ScreenControl\
    //    - Extract new files to C:\Program Files\ScreenControl\
    //    - Restore config
    //    - Start ScreenControlService
    //    - Start ScreenControlTray.exe
    // 4. Execute script with elevation
    // 5. Exit current process
}
```

**macOS** (`service/src/update/update_macos.cpp`):
```cpp
bool UpdateManager::applyUpdateMacOS() {
    // 1. Download to /tmp/ScreenControl-update/
    // 2. Verify SHA256
    // 3. Create update script:
    //    - launchctl unload /Library/LaunchDaemons/com.screencontrol.service.plist
    //    - Backup config from /Library/Application Support/ScreenControl/
    //    - Replace service binary in /Library/PrivilegedHelperTools/
    //    - Replace .app in /Applications/ (if applicable)
    //    - Restore config
    //    - launchctl load /Library/LaunchDaemons/com.screencontrol.service.plist
    // 4. Execute script with sudo (via helper tool)
    // 5. Exit current process
}
```

**Linux** (`service/src/update/update_linux.cpp`):
```cpp
bool UpdateManager::applyUpdateLinux() {
    // 1. Download to /tmp/ScreenControl-update/
    // 2. Verify SHA256
    // 3. Create update script:
    //    - systemctl stop screencontrol
    //    - Backup config from /etc/screencontrol/
    //    - Replace binary in /opt/screencontrol/
    //    - Restore config
    //    - systemctl start screencontrol
    // 4. Execute script with pkexec or sudo
    // 5. Exit current process
}
```

---

## Build Pipeline

### 1. CI/CD Enhancements

**File**: `.github/workflows/ci.yml` (additions)

```yaml
  # After all builds complete, upload to update server
  deploy-builds:
    name: Deploy Builds to Update Server
    runs-on: ubuntu-latest
    needs: [build-macos-agent, build-macos-service, build-macos-pkg,
            build-linux-service, build-windows-service, build-windows-tray]
    if: github.ref == 'refs/heads/main'  # Only deploy from main

    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts/

      - name: Package artifacts for each platform
        run: |
          # Create platform packages
          ./scripts/package-builds.sh

      - name: Upload to update server
        run: |
          # Upload via SSH tunnel to internal server
          # SSH through jump host to reach 192.168.10.10
          ./scripts/deploy-to-update-server.sh
        env:
          DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
```

### 2. Local Build & Deploy Script

**File**: `scripts/deploy-builds.sh`

```bash
#!/bin/bash
# Deploy builds from internal network to screencontrol.knws.co.uk

VERSION=$(cat version.json | jq -r '.version')
SERVER="richardbrown@192.168.10.10"
BUILD_DIR="/var/www/screencontrol/builds"

# Check we're on internal network
if ! ip addr | grep -q "192.168.1[01]\."; then
    echo "Error: Must run from internal network (192.168.10.x or 192.168.11.x)"
    exit 1
fi

# Package and upload each platform
for PLATFORM in windows-x64 windows-arm64 macos-arm64 macos-x64 linux-x64 linux-arm64; do
    if [ -d "dist/$PLATFORM" ]; then
        echo "Packaging $PLATFORM..."
        tar -czvf "dist/ScreenControl-${VERSION}-${PLATFORM}.tar.gz" -C "dist/$PLATFORM" .

        echo "Uploading $PLATFORM..."
        scp "dist/ScreenControl-${VERSION}-${PLATFORM}.tar.gz" \
            "${SERVER}:${BUILD_DIR}/${PLATFORM}/"
    fi
done

# Update versions.json on server
echo "Updating version manifest..."
ssh $SERVER "cd $BUILD_DIR && ./update-manifest.sh $VERSION"

echo "Deploy complete: v${VERSION}"
```

---

## Configuration Schema Updates

### Agent Config Addition

**File**: `config.json` (per-agent)
```json
{
  "...existing fields...": "...",

  "updates": {
    "enabled": true,
    "mode": "auto",           // "auto", "manual", "scheduled"
    "scheduledTime": null,    // Unix timestamp for scheduled updates
    "channel": "stable",      // "stable", "beta", "dev"
    "lastCheck": 0,           // Unix timestamp
    "lastUpdate": 0,          // Unix timestamp
    "pendingVersion": null    // Version downloaded but not installed
  }
}
```

### Server-Side Agent Settings

The server dashboard will allow per-agent or group settings:
- Update mode (auto/manual/scheduled)
- Scheduled update time
- Update channel (stable/beta)
- Force update option
- Rollback option

---

## Update Flow

### Normal Update Cycle

```
1. Heartbeat sent to server
2. Server includes "u": 1 in heartbeat_ack if update available
3. Agent (every ~60 heartbeats ≈ 5 mins) checks update flag
4. If u=1, agent calls GET /api/updates/check with:
   - platform, arch, currentVersion
   - X-Machine-Id, X-Fingerprint headers
5. Server responds with update info if newer version exists
6. Agent downloads update in background
7. Agent verifies SHA256 hash
8. Based on update mode:
   - AUTO: Apply immediately
   - MANUAL: Notify server, wait for user action
   - SCHEDULED: Wait until scheduledTime
9. Apply update (stop service, replace files, restart)
10. New version reports to server on next heartbeat
```

### Rollback Mechanism

```
1. Before update, backup current binaries to:
   - Windows: %TEMP%\ScreenControl-backup\
   - macOS: /tmp/ScreenControl-backup/
   - Linux: /tmp/ScreenControl-backup/
2. Keep last 2 versions for rollback
3. If update fails to start within 60 seconds:
   - Automatic rollback to previous version
4. Manual rollback via server command
```

---

## Implementation Order

### Phase 1: Server Infrastructure (Days 1-2)
1. [ ] Create `/api/updates/check` endpoint
2. [ ] Create `/api/updates/download` endpoint
3. [ ] Create `/api/updates/upload` endpoint with network restriction
4. [ ] Create `versions.json` manifest structure
5. [ ] Create build storage directories
6. [ ] Add update flag to `heartbeat_ack` response

### Phase 2: Agent Update Manager (Days 3-5)
1. [ ] Create `UpdateManager` class skeleton
2. [ ] Implement version comparison logic
3. [ ] Implement HTTP download with progress
4. [ ] Implement SHA256 verification
5. [ ] Add update config to config.json schema
6. [ ] Integrate update check into heartbeat loop

### Phase 3: Platform-Specific Installers (Days 6-8)
1. [ ] Windows update installer script
2. [ ] macOS update installer script
3. [ ] Linux update installer script
4. [ ] Test on each platform

### Phase 4: Build Pipeline (Days 9-10)
1. [ ] Create `package-builds.sh` script
2. [ ] Create `deploy-builds.sh` script
3. [ ] Add deploy job to CI/CD workflow
4. [ ] Test full pipeline from commit to deployed update

### Phase 5: Testing & Refinement (Days 11-12)
1. [ ] End-to-end update test on all platforms
2. [ ] Rollback testing
3. [ ] Config preservation testing
4. [ ] Network restriction verification
5. [ ] Load testing update server

---

## Security Considerations

1. **Build Upload Restriction**: Only internal network (192.168.10.x/192.168.11.x) can upload builds
2. **Machine Authentication**: Downloads require valid machine signature
3. **SHA256 Verification**: All packages verified before installation
4. **TLS**: All communication over HTTPS/WSS
5. **Signed Packages**: Consider code signing for Windows/macOS in future
6. **Rollback**: Automatic rollback on failed updates prevents bricking

---

## Files to Create/Modify

### New Files
- `service/src/update/update_manager.h`
- `service/src/update/update_manager.cpp`
- `service/src/update/update_windows.cpp`
- `service/src/update/update_macos.cpp`
- `service/src/update/update_linux.cpp`
- `scripts/package-builds.sh`
- `scripts/deploy-builds.sh`
- `server/routes/updates.js` (on screencontrol.knws.co.uk)

### Modified Files
- `service/src/control_server/websocket_client.cpp` (heartbeat update flag)
- `service/src/core/config.cpp` (update settings)
- `service/include/platform.h` (update paths)
- `service/CMakeLists.txt` (add update sources)
- `.github/workflows/ci.yml` (deploy job)
- `version.json` (version tracking)

---

## Estimated Effort

| Component | Effort |
|-----------|--------|
| Server API | 1-2 days |
| Update Manager | 2-3 days |
| Platform Installers | 2-3 days |
| Build Pipeline | 1-2 days |
| Testing | 2 days |
| **Total** | **8-12 days** |
