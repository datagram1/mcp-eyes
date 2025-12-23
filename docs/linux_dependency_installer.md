# Linux Runtime Dependency Installation

## Overview

ScreenControl can detect missing dependencies at runtime and offer to install them automatically. This ensures the grid tools work without requiring manual package installation.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ScreenControlService                      │
├─────────────────────────────────────────────────────────────┤
│  startup                                                     │
│    │                                                         │
│    ▼                                                         │
│  detectDisplayServer()  ──► X11 or Wayland/DE               │
│    │                                                         │
│    ▼                                                         │
│  checkDependencies()                                         │
│    ├── checkScreenshotTools()                               │
│    ├── checkInputTools()                                    │
│    └── checkImageMagick()                                   │
│    │                                                         │
│    ▼                                                         │
│  missing deps? ──► installDependencies()                    │
│                      ├── detectPackageManager()             │
│                      └── runInstallCommand()                │
└─────────────────────────────────────────────────────────────┘
```

## Dependency Matrix

| Environment | Screenshot | Input | Grid Overlay |
|-------------|-----------|-------|--------------|
| X11         | scrot     | xdotool | imagemagick |
| GNOME/Wayland | gnome-screenshot | ydotool | imagemagick |
| KDE/Wayland | spectacle | ydotool | imagemagick |
| wlroots/Wayland | grim | ydotool | imagemagick |

## Package Manager Detection

```cpp
enum PackageManager {
    APT,      // Debian, Ubuntu, Mint
    DNF,      // Fedora, RHEL 8+
    YUM,      // CentOS, RHEL 7
    PACMAN,   // Arch, Manjaro
    ZYPPER,   // openSUSE
    APK,      // Alpine
    UNKNOWN
};

PackageManager detectPackageManager() {
    if (commandExists("apt")) return APT;
    if (commandExists("dnf")) return DNF;
    if (commandExists("yum")) return YUM;
    if (commandExists("pacman")) return PACMAN;
    if (commandExists("zypper")) return ZYPPER;
    if (commandExists("apk")) return APK;
    return UNKNOWN;
}
```

## Install Commands by Package Manager

### APT (Debian/Ubuntu)
```bash
# X11
sudo apt install -y scrot xdotool imagemagick

# Wayland (GNOME)
sudo apt install -y gnome-screenshot ydotool imagemagick
sudo systemctl enable --now ydotool

# Wayland (wlroots)
sudo apt install -y grim ydotool imagemagick
sudo systemctl enable --now ydotool
```

### DNF (Fedora)
```bash
# X11
sudo dnf install -y scrot xdotool ImageMagick

# Wayland
sudo dnf install -y gnome-screenshot ydotool ImageMagick
sudo systemctl enable --now ydotool
```

### Pacman (Arch)
```bash
# X11
sudo pacman -S --noconfirm scrot xdotool imagemagick

# Wayland
sudo pacman -S --noconfirm grim ydotool imagemagick
sudo systemctl enable --now ydotool
```

## Implementation Plan

### 1. Add dependency checking to platform_linux.cpp

```cpp
namespace platform {
namespace deps {

struct DependencyStatus {
    bool screenshotTool = false;
    bool inputTool = false;
    bool imageMagick = false;
    std::string missingPackages;
    std::string installCommand;
};

DependencyStatus checkDependencies();
bool installDependencies(bool interactive = true);

} // namespace deps
} // namespace platform
```

### 2. Check at startup (main_linux.cpp)

```cpp
int main() {
    // ... initialization ...

    auto deps = platform::deps::checkDependencies();
    if (!deps.screenshotTool || !deps.inputTool || !deps.imageMagick) {
        Logger::warn("Missing dependencies for grid tools: " + deps.missingPackages);
        Logger::info("Install with: " + deps.installCommand);

        // Optionally auto-install if running as root or with sudo
        if (platform::isRunningAsRoot()) {
            platform::deps::installDependencies(false);
        }
    }

    // ... start server ...
}
```

### 3. HTTP Endpoints (Implemented)

#### GET /system/dependencies

Returns dependency status and install instructions.

Response:
```json
{
  "success": true,
  "displayServer": "Wayland/GNOME",
  "packageManager": "apt",
  "dependencies": {
    "screenshotTool": {
      "available": true,
      "tool": "gnome-screenshot"
    },
    "inputTool": {
      "available": false,
      "tool": "ydotool"
    },
    "imageMagick": {
      "available": true,
      "tool": "convert"
    }
  },
  "allAvailable": false,
  "missingPackages": "ydotool",
  "installCommand": "sudo apt install -y ydotool && sudo systemctl enable --now ydotool"
}
```

#### POST /system/dependencies/install

Attempts to install missing dependencies. Requires root privileges.

Response (success):
```json
{
  "success": true,
  "message": "Dependencies installed successfully",
  "dependencies": {
    "screenshotTool": true,
    "inputTool": true,
    "imageMagick": true
  }
}
```

Response (not root):
```json
{
  "success": false,
  "error": "Root privileges required for dependency installation",
  "hint": "Run the service as root or use: sudo apt install -y ydotool"
}
```

#### GET /system/dependencies/script

Returns a shell script for manual installation (content-type: text/x-shellscript).

## User Experience

### Scenario 1: Fresh Install
1. User installs ScreenControl
2. Service starts and checks dependencies
3. Missing deps detected → warning in logs
4. User runs `screencontrol --install-deps` or visits web UI
5. Dependencies installed automatically

### Scenario 2: First Grid Tool Use
1. User calls `screenshot_grid`
2. Service detects missing tools
3. Returns helpful error with install command
4. User installs deps manually or via provided script

### Scenario 3: Automated Setup (for deployment)
```bash
# Install script handles everything
curl -sSL https://screencontrol.app/install.sh | sudo bash
```

The install script:
1. Detects OS and package manager
2. Installs ScreenControl service
3. Installs grid tool dependencies
4. Configures ydotool if Wayland
5. Starts service

## Security Considerations

1. **Package installation requires root** - Use polkit for privilege escalation
2. **Only install from official repos** - No third-party sources
3. **Verify package names** - Prevent injection attacks
4. **Log all installations** - Audit trail

## Future Enhancements

1. **Flatpak/Snap support** - Handle sandboxed environments
2. **Docker detection** - Skip GUI deps in containers
3. **Remote installation** - Install deps on remote agents
4. **Version checking** - Ensure minimum versions
