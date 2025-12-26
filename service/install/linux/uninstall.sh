#!/bin/bash
#
# ScreenControl Uninstaller for Linux
#
# Removes the ScreenControl service and tray application.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

INSTALL_DIR="/opt/screencontrol"
CONFIG_DIR="/etc/screencontrol"
LOG_DIR="/var/log/screencontrol"
SERVICE_FILE="/etc/systemd/system/screencontrol.service"
SYSTEM_AUTOSTART_DIR="/etc/xdg/autostart"

echo "ScreenControl Uninstaller for Linux"
echo "===================================="
echo

# Check root
if [ "$(id -u)" != "0" ]; then
    echo -e "${RED}Error: This script must be run as root${NC}"
    echo "Please run: sudo $0"
    exit 1
fi

# Stop and disable service
echo "Stopping service..."
systemctl stop screencontrol 2>/dev/null || true
systemctl disable screencontrol 2>/dev/null || true

# Kill tray app for all users
echo "Stopping tray application..."
pkill -f "screencontrol-tray" 2>/dev/null || true

# Remove service file
echo "Removing service..."
rm -f "$SERVICE_FILE"
systemctl daemon-reload

# Remove autostart entries
echo "Removing autostart entries..."
rm -f "$SYSTEM_AUTOSTART_DIR/screencontrol-tray.desktop"
rm -f /usr/share/applications/screencontrol-tray.desktop

# Remove user autostart entries
for user_home in /home/*; do
    if [ -d "$user_home" ]; then
        rm -f "$user_home/.config/autostart/screencontrol-tray.desktop" 2>/dev/null || true
        rm -f "$user_home/.config/systemd/user/screencontrol-tray.service" 2>/dev/null || true
    fi
done

# Remove install directory
echo "Removing installation..."
rm -rf "$INSTALL_DIR"

# Ask about config and logs
echo ""
read -p "Remove configuration files? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing configuration..."
    rm -rf "$CONFIG_DIR"
fi

read -p "Remove log files? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing logs..."
    rm -rf "$LOG_DIR"
fi

echo ""
echo -e "${GREEN}ScreenControl has been uninstalled${NC}"
echo ""
