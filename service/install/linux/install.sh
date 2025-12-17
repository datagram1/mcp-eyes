#!/bin/bash
#
# ScreenControl Service Installer for Linux
#

set -e

INSTALL_DIR="/opt/screencontrol"
CONFIG_DIR="/etc/screencontrol"
LOG_DIR="/var/log/screencontrol"
SERVICE_FILE="/etc/systemd/system/screencontrol.service"

echo "ScreenControl Service Installer"
echo "================================"
echo

# Check root
if [ "$(id -u)" != "0" ]; then
    echo "Error: This script must be run as root"
    exit 1
fi

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"

# Copy binary
echo "Installing service binary..."
if [ -f "./ScreenControlService" ]; then
    cp ./ScreenControlService "$INSTALL_DIR/"
    chmod 755 "$INSTALL_DIR/ScreenControlService"
elif [ -f "./bin/ScreenControlService" ]; then
    cp ./bin/ScreenControlService "$INSTALL_DIR/"
    chmod 755 "$INSTALL_DIR/ScreenControlService"
else
    echo "Error: ScreenControlService binary not found"
    exit 1
fi

# Install systemd service
echo "Installing systemd service..."
cp ./screencontrol.service "$SERVICE_FILE"
chmod 644 "$SERVICE_FILE"

# Reload systemd
echo "Reloading systemd..."
systemctl daemon-reload

# Enable and start service
echo "Enabling service..."
systemctl enable screencontrol

echo "Starting service..."
systemctl start screencontrol

echo
echo "Installation complete!"
echo "Service status: $(systemctl is-active screencontrol)"
echo
echo "Useful commands:"
echo "  sudo systemctl status screencontrol   - Check status"
echo "  sudo systemctl restart screencontrol  - Restart service"
echo "  sudo journalctl -u screencontrol -f   - View logs"
echo
