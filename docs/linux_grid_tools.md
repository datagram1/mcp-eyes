# Linux Grid Tools Implementation

ScreenControl v1.3.0 adds `screenshot_grid` and `click_grid` tools for Linux, supporting both X11 and Wayland display servers.

## Overview

The Linux implementation uses shell commands rather than native APIs, making it compatible with various desktop environments while requiring some external dependencies.

| Display Server | Screenshot Tool | Input Tool | Grid Overlay |
|---------------|-----------------|------------|--------------|
| X11 | scrot, import | xdotool | ImageMagick |
| Wayland (GNOME) | gnome-screenshot | ydotool | ImageMagick |
| Wayland (KDE) | spectacle | ydotool | ImageMagick |
| Wayland (wlroots) | grim | ydotool | ImageMagick |

## Dependencies

### Required (all environments)
- `imagemagick` - For grid overlay drawing

### X11 (choose one screenshot tool)
- `scrot` - Simple screenshot tool (recommended)
- `imagemagick` - Provides `import` command as fallback

### X11 Input
- `xdotool` - Mouse/keyboard control

### Wayland Screenshot (choose based on DE)
- `gnome-screenshot` - GNOME
- `spectacle` - KDE Plasma
- `grim` - wlroots-based (Sway, Hyprland, etc.)

### Wayland Input
- `ydotool` - Universal Wayland input tool (requires `ydotoold` daemon)

## Installation by Distribution

### Ubuntu/Debian (X11)
```bash
sudo apt update
sudo apt install scrot imagemagick xdotool
```

### Ubuntu/Debian (GNOME Wayland)
```bash
sudo apt update
sudo apt install gnome-screenshot imagemagick ydotool
sudo systemctl enable --now ydotool
```

### Ubuntu/Debian (KDE Wayland)
```bash
sudo apt update
sudo apt install spectacle imagemagick ydotool
sudo systemctl enable --now ydotool
```

### Fedora (X11)
```bash
sudo dnf install scrot ImageMagick xdotool
```

### Fedora (GNOME Wayland)
```bash
sudo dnf install gnome-screenshot ImageMagick ydotool
sudo systemctl enable --now ydotool
```

### Arch Linux (X11)
```bash
sudo pacman -S scrot imagemagick xdotool
```

### Arch Linux (Wayland/Sway)
```bash
sudo pacman -S grim imagemagick ydotool
sudo systemctl enable --now ydotool
```

## ydotool Setup (Wayland)

ydotool requires the `ydotoold` daemon running with access to `/dev/uinput`:

```bash
# Start the daemon
sudo systemctl enable --now ydotool

# Or run manually
sudo ydotoold &

# For non-root usage, add user to input group
sudo usermod -aG input $USER
# Then logout and login
```

## How It Works

### Screenshot with Grid
1. Detect display server (Wayland vs X11)
2. Take screenshot using appropriate tool
3. Get image dimensions with `identify` (ImageMagick)
4. Draw grid overlay with `convert` (ImageMagick)
5. Return base64-encoded image with grid info

### Click at Grid Cell
1. Parse cell reference (e.g., "E7") or column/row numbers
2. Get screen dimensions
3. Calculate pixel coordinates for cell center
4. Use `ydotool` (Wayland) or `xdotool` (X11) to click

## API Usage

### screenshot_grid
```json
POST /screenshot_grid
{
  "columns": 20,
  "rows": 15
}
```

Response:
```json
{
  "success": true,
  "columns": 20,
  "rows": 15,
  "file_path": "/tmp/screenshot_grid_1234567890.png",
  "image": "<base64-encoded PNG>",
  "format": "png",
  "displayServer": "Wayland/GNOME",
  "usage": "Use click_grid with cell='E7' or column/row numbers to click"
}
```

### click_grid
```json
POST /click_grid
{
  "cell": "E7",
  "columns": 20,
  "rows": 15
}
```

Or with explicit coordinates:
```json
POST /click_grid
{
  "column": 5,
  "row": 7,
  "columns": 20,
  "rows": 15,
  "button": "left"
}
```

Response:
```json
{
  "success": true,
  "cell": "E7",
  "displayServer": "X11"
}
```

## Troubleshooting

### "Failed to take screenshot"
- Check if screenshot tool is installed
- For Wayland, ensure correct tool for your DE
- Check display permissions

### "Failed to add grid overlay"
- Install ImageMagick: `sudo apt install imagemagick`
- Check that `convert` and `identify` commands work

### Click not working on Wayland
- Ensure `ydotoold` is running: `sudo systemctl status ydotool`
- Check `/dev/uinput` permissions
- Add user to input group: `sudo usermod -aG input $USER`

### Click not working on X11
- Install xdotool: `sudo apt install xdotool`
- Check DISPLAY environment variable is set

## Limitations

### Cross-compiled builds
The cross-compiled Linux builds (from macOS) use stub implementations for:
- Crypto (basic XOR instead of AES-256-GCM)
- WebSocket (control server connection disabled)

For production use with full features, build natively on Linux with OpenSSL.

### Multi-monitor
Current implementation captures the entire virtual screen. For specific monitor targeting, additional configuration may be needed.

## Runtime Dependency Check

ScreenControl can check and optionally install missing dependencies at startup. See the next section for the auto-install feature.
