#!/bin/bash
#
# ScreenControl Service Uninstaller for macOS
#
# This script removes the ScreenControl service.
# Requires root privileges.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SERVICE_ID="com.screencontrol.service"
SERVICE_BINARY="/Library/PrivilegedHelperTools/${SERVICE_ID}"
SERVICE_PLIST="/Library/LaunchDaemons/${SERVICE_ID}.plist"
AGENT_ID="com.screencontrol.agent"
AGENT_PLIST="/Library/LaunchAgents/${AGENT_ID}.plist"
CONFIG_DIR="/Library/Application Support/ScreenControl"
LOG_DIR="/Library/Logs/ScreenControl"

echo "ScreenControl Service Uninstaller for macOS"
echo "============================================"
echo ""

# Check for root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Error: This script must be run as root${NC}"
    echo "Please run: sudo $0"
    exit 1
fi

# Stop and unload service
if launchctl list | grep -q "$SERVICE_ID"; then
    echo "Stopping service..."
    launchctl unload "$SERVICE_PLIST" 2>/dev/null || true
fi

# Remove files
echo "Removing service binary..."
rm -f "$SERVICE_BINARY"

echo "Removing LaunchDaemon..."
rm -f "$SERVICE_PLIST"

# Stop and remove LaunchAgent for menu bar app
echo "Stopping menu bar agent..."
# Unload for all logged-in users
for uid in $(dscl . -list /Users UniqueID | awk '$2 >= 500 {print $2}'); do
    launchctl bootout gui/$uid "$AGENT_PLIST" 2>/dev/null || true
done
echo "Removing LaunchAgent..."
rm -f "$AGENT_PLIST"

# Ask about config and logs
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

echo -e "${GREEN}Service uninstalled successfully!${NC}"
