#!/bin/bash
#
# ScreenControl Service Installer for macOS
#
# This script installs the ScreenControl service as a LaunchDaemon.
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

# Script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "ScreenControl Service Installer for macOS"
echo "=========================================="
echo ""

# Check for root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Error: This script must be run as root${NC}"
    echo "Please run: sudo $0"
    exit 1
fi

# Check if service binary exists
BINARY_PATH="${SCRIPT_DIR}/../../bin/ScreenControlService"
if [[ ! -f "$BINARY_PATH" ]]; then
    # Try relative to script
    BINARY_PATH="${SCRIPT_DIR}/ScreenControlService"
fi

if [[ ! -f "$BINARY_PATH" ]]; then
    echo -e "${RED}Error: Service binary not found${NC}"
    echo "Please build the service first: cmake --build build"
    exit 1
fi

echo "Installing ScreenControl Service..."

# Stop existing service if running
if launchctl list | grep -q "$SERVICE_ID"; then
    echo "Stopping existing service..."
    launchctl unload "$SERVICE_PLIST" 2>/dev/null || true
fi

# Create directories
echo "Creating directories..."
mkdir -p "/Library/PrivilegedHelperTools"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"

# Copy binary
echo "Installing service binary..."
cp "$BINARY_PATH" "$SERVICE_BINARY"
chmod 755 "$SERVICE_BINARY"
chown root:wheel "$SERVICE_BINARY"

# Copy plist
echo "Installing LaunchDaemon..."
cp "${SCRIPT_DIR}/com.screencontrol.service.plist" "$SERVICE_PLIST"
chmod 644 "$SERVICE_PLIST"
chown root:wheel "$SERVICE_PLIST"

# Install LaunchAgent for menu bar app (auto-start at login)
echo "Installing LaunchAgent for menu bar app..."
mkdir -p "/Library/LaunchAgents"
cp "${SCRIPT_DIR}/com.screencontrol.agent.plist" "$AGENT_PLIST"
chmod 644 "$AGENT_PLIST"
chown root:wheel "$AGENT_PLIST"

# Set directory permissions
chmod 755 "$CONFIG_DIR"
chmod 755 "$LOG_DIR"

# Create default config if not exists
if [[ ! -f "${CONFIG_DIR}/config.json" ]]; then
    echo "Creating default configuration..."
    cat > "${CONFIG_DIR}/config.json" << 'EOF'
{
    "httpPort": 3459,
    "guiBridgePort": 3460,
    "controlServerUrl": "wss://screencontrol.knws.co.uk/ws",
    "agentName": "",
    "autoStart": true,
    "enableLogging": true
}
EOF
    chmod 644 "${CONFIG_DIR}/config.json"
fi

# Load service
echo "Starting service..."
launchctl load "$SERVICE_PLIST"

# Load agent for all logged-in GUI users
echo "Loading agent for logged-in users..."
for uid in $(dscl . -list /Users UniqueID | awk '$2 >= 500 {print $2}'); do
    # Check if user has a GUI session
    if launchctl print gui/$uid 2>/dev/null | grep -q "state = running"; then
        echo "  Loading agent for UID $uid..."
        launchctl bootout gui/$uid/com.screencontrol.agent 2>/dev/null || true
        launchctl bootstrap gui/$uid "$AGENT_PLIST" 2>/dev/null || true
    fi
done

# Wait for services to start
sleep 2

# Verify service is running
if launchctl list | grep -q "$SERVICE_ID"; then
    echo -e "${GREEN}Service installed and running successfully!${NC}"
    echo ""
    echo "Service details:"
    echo "  Binary: $SERVICE_BINARY"
    echo "  Config: ${CONFIG_DIR}/config.json"
    echo "  Logs:   ${LOG_DIR}/"
    echo "  HTTP:   http://127.0.0.1:3459/health"
    echo ""
    echo "Menu bar agent:"
    echo "  App:    /Applications/ScreenControl.app"
    echo "  Status: Will start automatically at login"
    echo "          (or is already running for logged-in users)"
    echo ""
    echo "To check status: launchctl list | grep screencontrol"
    echo "To view logs: tail -f ${LOG_DIR}/service.log"
else
    echo -e "${YELLOW}Warning: Service may not have started correctly${NC}"
    echo "Check logs: tail -f ${LOG_DIR}/stderr.log"
fi
