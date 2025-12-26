#!/bin/bash
#
# ScreenControl Service Installer for Linux
#
# Installs both the system service and the tray application.
# Supports Ubuntu (GNOME) and KDE Plasma desktops.
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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "ScreenControl Installer for Linux"
echo "=================================="
echo

# Check root
if [ "$(id -u)" != "0" ]; then
    echo -e "${RED}Error: This script must be run as root${NC}"
    echo "Please run: sudo $0"
    exit 1
fi

# Detect desktop environment
detect_desktop() {
    if [ -n "$XDG_CURRENT_DESKTOP" ]; then
        echo "$XDG_CURRENT_DESKTOP"
    elif [ -n "$DESKTOP_SESSION" ]; then
        echo "$DESKTOP_SESSION"
    else
        echo "unknown"
    fi
}

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$SYSTEM_AUTOSTART_DIR"

# ============================================
# Install Service Binary
# ============================================
echo ""
echo -e "${YELLOW}[1/4] Installing service...${NC}"

if [ -f "./ScreenControlService" ]; then
    cp ./ScreenControlService "$INSTALL_DIR/"
    chmod 755 "$INSTALL_DIR/ScreenControlService"
elif [ -f "./bin/ScreenControlService" ]; then
    cp ./bin/ScreenControlService "$INSTALL_DIR/"
    chmod 755 "$INSTALL_DIR/ScreenControlService"
elif [ -f "$SCRIPT_DIR/ScreenControlService" ]; then
    cp "$SCRIPT_DIR/ScreenControlService" "$INSTALL_DIR/"
    chmod 755 "$INSTALL_DIR/ScreenControlService"
else
    echo -e "${RED}Error: ScreenControlService binary not found${NC}"
    exit 1
fi

# Install systemd service
echo "Installing systemd service..."
if [ -f "./screencontrol.service" ]; then
    cp ./screencontrol.service "$SERVICE_FILE"
elif [ -f "$SCRIPT_DIR/screencontrol.service" ]; then
    cp "$SCRIPT_DIR/screencontrol.service" "$SERVICE_FILE"
else
    # Create default service file
    cat > "$SERVICE_FILE" << 'EOF'
[Unit]
Description=ScreenControl Service
Documentation=https://github.com/screencontrol/screencontrol
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/opt/screencontrol/ScreenControlService
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=5
User=root
Group=root
NoNewPrivileges=false
ProtectSystem=false
ProtectHome=false
PrivateTmp=false
Environment=HOME=/root
WorkingDirectory=/opt/screencontrol
StandardOutput=journal
StandardError=journal
SyslogIdentifier=screencontrol

[Install]
WantedBy=multi-user.target
EOF
fi
chmod 644 "$SERVICE_FILE"

# Create default config if not exists
if [ ! -f "$CONFIG_DIR/config.json" ]; then
    echo "Creating default configuration..."
    cat > "$CONFIG_DIR/config.json" << 'EOF'
{
    "httpPort": 3459,
    "guiBridgePort": 3460,
    "controlServerUrl": "wss://screencontrol.knws.co.uk/ws",
    "agentName": "",
    "autoStart": true,
    "enableLogging": true
}
EOF
    chmod 644 "$CONFIG_DIR/config.json"
fi

# Reload systemd
echo "Reloading systemd..."
systemctl daemon-reload

# Enable and start service
echo "Enabling service..."
systemctl enable screencontrol

echo "Starting service..."
systemctl start screencontrol

echo -e "${GREEN}Service installed and started${NC}"

# ============================================
# Install Tray Application Dependencies
# ============================================
echo ""
echo -e "${YELLOW}[2/4] Installing tray app dependencies...${NC}"

# Detect package manager
if command -v apt &> /dev/null; then
    PKG_CMD="apt"
elif command -v dnf &> /dev/null; then
    PKG_CMD="dnf"
elif command -v pacman &> /dev/null; then
    PKG_CMD="pacman"
else
    echo -e "${YELLOW}Warning: No supported package manager found${NC}"
    PKG_CMD=""
fi

if [ -n "$PKG_CMD" ]; then
    case "$PKG_CMD" in
        apt)
            # Core dependencies
            PACKAGES="python3 python3-gi python3-gi-cairo gir1.2-gtk-3.0"
            PACKAGES="$PACKAGES python3-pil python3-requests"
            PACKAGES="$PACKAGES xdotool scrot wmctrl"

            # AppIndicator - try Ayatana first (newer), fall back to legacy
            if apt-cache show gir1.2-ayatanaappindicator3-0.1 &> /dev/null 2>&1; then
                PACKAGES="$PACKAGES gir1.2-ayatanaappindicator3-0.1"
            elif apt-cache show gir1.2-appindicator3-0.1 &> /dev/null 2>&1; then
                PACKAGES="$PACKAGES gir1.2-appindicator3-0.1"
            fi

            echo "Installing: $PACKAGES"
            apt update -qq
            apt install -y $PACKAGES
            ;;

        dnf)
            dnf install -y python3 python3-gobject gtk3 \
                python3-pillow python3-requests \
                xdotool scrot wmctrl \
                libappindicator-gtk3
            ;;

        pacman)
            pacman -S --noconfirm python python-gobject gtk3 \
                python-pillow python-requests \
                xdotool scrot wmctrl \
                libappindicator-gtk3
            ;;
    esac
    echo -e "${GREEN}Dependencies installed${NC}"
fi

# ============================================
# Install Tray Application
# ============================================
echo ""
echo -e "${YELLOW}[3/4] Installing tray application...${NC}"

# Find tray app source
TRAY_SOURCE=""
if [ -f "./screencontrol_tray.py" ]; then
    TRAY_SOURCE="./screencontrol_tray.py"
elif [ -f "$SCRIPT_DIR/../../linux/ScreenControlTray/screencontrol_tray.py" ]; then
    TRAY_SOURCE="$SCRIPT_DIR/../../linux/ScreenControlTray/screencontrol_tray.py"
elif [ -f "/tmp/screencontrol_tray.py" ]; then
    TRAY_SOURCE="/tmp/screencontrol_tray.py"
fi

if [ -n "$TRAY_SOURCE" ]; then
    cp "$TRAY_SOURCE" "$INSTALL_DIR/screencontrol-tray"
    chmod 755 "$INSTALL_DIR/screencontrol-tray"
    echo -e "${GREEN}Tray application installed${NC}"
else
    echo -e "${YELLOW}Warning: Tray application source not found${NC}"
    echo "Tray app will need to be installed separately"
fi

# Create wrapper script
cat > "$INSTALL_DIR/screencontrol-tray-wrapper" << 'EOF'
#!/bin/bash
# Wrapper script for ScreenControl tray app
# Ensures proper environment for GUI access

# Wait for desktop to be ready
sleep 2

# Set display if not set
if [ -z "$DISPLAY" ]; then
    export DISPLAY=:0
fi

# Run the tray application
exec /usr/bin/python3 /opt/screencontrol/screencontrol-tray "$@"
EOF
chmod 755 "$INSTALL_DIR/screencontrol-tray-wrapper"

# ============================================
# Setup Autostart
# ============================================
echo ""
echo -e "${YELLOW}[4/4] Configuring autostart...${NC}"

# Create desktop entry for app menu
cat > /usr/share/applications/screencontrol-tray.desktop << EOF
[Desktop Entry]
Type=Application
Name=ScreenControl Tray
Comment=ScreenControl system tray application
Exec=$INSTALL_DIR/screencontrol-tray-wrapper
Icon=network-transmit-receive
Terminal=false
Categories=Utility;RemoteAccess;
Keywords=remote;desktop;control;screen;
StartupNotify=false
EOF

# Create autostart entry for all users
cat > "$SYSTEM_AUTOSTART_DIR/screencontrol-tray.desktop" << EOF
[Desktop Entry]
Type=Application
Name=ScreenControl Tray
Comment=ScreenControl system tray application
Exec=$INSTALL_DIR/screencontrol-tray-wrapper
Icon=network-transmit-receive
Terminal=false
Categories=Utility;
StartupNotify=false
X-GNOME-Autostart-enabled=true
X-KDE-autostart-after=panel
NoDisplay=true
EOF

echo -e "${GREEN}Autostart configured${NC}"

# ============================================
# Summary
# ============================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Installation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Service:"
echo "  Binary:  $INSTALL_DIR/ScreenControlService"
echo "  Config:  $CONFIG_DIR/config.json"
echo "  Status:  $(systemctl is-active screencontrol)"
echo "  HTTP:    http://127.0.0.1:3459/health"
echo ""
echo "Tray Application:"
echo "  Binary:  $INSTALL_DIR/screencontrol-tray"
echo "  Status:  Will start at next login"
echo "  GUI:     http://127.0.0.1:3460/health"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status screencontrol   - Check service status"
echo "  sudo systemctl restart screencontrol  - Restart service"
echo "  sudo journalctl -u screencontrol -f   - View service logs"
echo ""

# For GNOME users
DESKTOP=$(detect_desktop)
if [[ "$DESKTOP" == *"GNOME"* ]]; then
    echo -e "${YELLOW}GNOME Users:${NC}"
    echo "  If you don't see the tray icon after login, install the AppIndicator extension:"
    echo "  https://extensions.gnome.org/extension/615/appindicator-support/"
    echo ""
fi

echo "The tray application will start automatically at next login."
echo "To start it now, log out and log back in, or run:"
echo "  $INSTALL_DIR/screencontrol-tray-wrapper &"
echo ""
