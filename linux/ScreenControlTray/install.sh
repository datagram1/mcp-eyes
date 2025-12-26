#!/bin/bash
#
# ScreenControl Tray Application Installer for Linux
#
# This script installs the ScreenControl tray application
# and sets up autostart for the current user.
#
# Supports: Ubuntu (GNOME), Kubuntu (KDE Plasma), and other GTK-based desktops
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

INSTALL_DIR="/opt/screencontrol"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
USER_AUTOSTART_DIR="$HOME/.config/autostart"
SYSTEM_AUTOSTART_DIR="/etc/xdg/autostart"

echo "ScreenControl Tray Application Installer"
echo "========================================="
echo ""

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

DESKTOP=$(detect_desktop)
echo "Detected desktop environment: $DESKTOP"
echo ""

# Install system dependencies
install_dependencies() {
    echo -e "${YELLOW}Installing system dependencies...${NC}"

    # Detect package manager
    if command -v apt &> /dev/null; then
        PKG_CMD="apt"
    elif command -v dnf &> /dev/null; then
        PKG_CMD="dnf"
    elif command -v pacman &> /dev/null; then
        PKG_CMD="pacman"
    else
        echo -e "${RED}Error: No supported package manager found${NC}"
        exit 1
    fi

    case "$PKG_CMD" in
        apt)
            # Core dependencies
            PACKAGES="python3 python3-gi python3-gi-cairo gir1.2-gtk-3.0"
            PACKAGES="$PACKAGES python3-pil python3-requests"
            PACKAGES="$PACKAGES xdotool scrot wmctrl"

            # AppIndicator - try Ayatana first (newer), fall back to legacy
            if apt-cache show gir1.2-ayatanaappindicator3-0.1 &> /dev/null; then
                PACKAGES="$PACKAGES gir1.2-ayatanaappindicator3-0.1"
            elif apt-cache show gir1.2-appindicator3-0.1 &> /dev/null; then
                PACKAGES="$PACKAGES gir1.2-appindicator3-0.1"
            fi

            # For GNOME, install the extension for AppIndicator support
            if [[ "$DESKTOP" == *"GNOME"* ]]; then
                if apt-cache show gnome-shell-extension-appindicator &> /dev/null; then
                    PACKAGES="$PACKAGES gnome-shell-extension-appindicator"
                fi
            fi

            # For KDE
            if [[ "$DESKTOP" == *"KDE"* ]] || [[ "$DESKTOP" == *"plasma"* ]]; then
                if apt-cache show libappindicator3-1 &> /dev/null; then
                    PACKAGES="$PACKAGES libappindicator3-1"
                fi
            fi

            echo "Installing: $PACKAGES"
            sudo apt update
            sudo apt install -y $PACKAGES
            ;;

        dnf)
            sudo dnf install -y python3 python3-gobject gtk3 \
                python3-pillow python3-requests \
                xdotool scrot wmctrl \
                libappindicator-gtk3
            ;;

        pacman)
            sudo pacman -S --noconfirm python python-gobject gtk3 \
                python-pillow python-requests \
                xdotool scrot wmctrl \
                libappindicator-gtk3
            ;;
    esac

    echo -e "${GREEN}Dependencies installed${NC}"
}

# Install the tray application
install_tray_app() {
    echo -e "${YELLOW}Installing tray application...${NC}"

    # Create install directory
    sudo mkdir -p "$INSTALL_DIR"

    # Copy main script
    sudo cp "$SCRIPT_DIR/screencontrol_tray.py" "$INSTALL_DIR/screencontrol-tray"
    sudo chmod 755 "$INSTALL_DIR/screencontrol-tray"

    # Create wrapper script
    sudo tee "$INSTALL_DIR/screencontrol-tray-wrapper" > /dev/null << 'EOF'
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
    sudo chmod 755 "$INSTALL_DIR/screencontrol-tray-wrapper"

    echo -e "${GREEN}Tray application installed to $INSTALL_DIR${NC}"
}

# Create desktop entry
create_desktop_entry() {
    echo -e "${YELLOW}Creating desktop entry...${NC}"

    # Application desktop entry (for app menu)
    sudo tee /usr/share/applications/screencontrol-tray.desktop > /dev/null << EOF
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

    echo -e "${GREEN}Desktop entry created${NC}"
}

# Setup autostart for all users (system-wide)
setup_system_autostart() {
    echo -e "${YELLOW}Setting up system-wide autostart...${NC}"

    sudo mkdir -p "$SYSTEM_AUTOSTART_DIR"

    sudo tee "$SYSTEM_AUTOSTART_DIR/screencontrol-tray.desktop" > /dev/null << EOF
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

    echo -e "${GREEN}System autostart configured${NC}"
}

# Setup autostart for current user only
setup_user_autostart() {
    echo -e "${YELLOW}Setting up user autostart...${NC}"

    mkdir -p "$USER_AUTOSTART_DIR"

    tee "$USER_AUTOSTART_DIR/screencontrol-tray.desktop" > /dev/null << EOF
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

    echo -e "${GREEN}User autostart configured${NC}"
}

# Create systemd user service (alternative to XDG autostart)
create_systemd_user_service() {
    echo -e "${YELLOW}Creating systemd user service...${NC}"

    USER_SYSTEMD_DIR="$HOME/.config/systemd/user"
    mkdir -p "$USER_SYSTEMD_DIR"

    tee "$USER_SYSTEMD_DIR/screencontrol-tray.service" > /dev/null << EOF
[Unit]
Description=ScreenControl Tray Application
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/screencontrol-tray-wrapper
Restart=on-failure
RestartSec=5
Environment=DISPLAY=:0

[Install]
WantedBy=graphical-session.target
EOF

    # Reload and enable
    systemctl --user daemon-reload
    systemctl --user enable screencontrol-tray.service

    echo -e "${GREEN}Systemd user service created${NC}"
    echo "  To start now: systemctl --user start screencontrol-tray"
    echo "  To check status: systemctl --user status screencontrol-tray"
}

# Enable GNOME Shell extension for AppIndicator support
enable_gnome_extension() {
    if [[ "$DESKTOP" == *"GNOME"* ]]; then
        echo -e "${YELLOW}Checking GNOME AppIndicator extension...${NC}"

        # Check if extension exists
        if gnome-extensions list 2>/dev/null | grep -q "appindicatorsupport"; then
            gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com 2>/dev/null || true
            echo -e "${GREEN}GNOME AppIndicator extension enabled${NC}"
        else
            echo -e "${YELLOW}Note: Install 'AppIndicator and KStatusNotifierItem Support' extension${NC}"
            echo "  from GNOME Extensions website for tray icon support"
        fi
    fi
}

# Start the tray application
start_tray_app() {
    echo -e "${YELLOW}Starting tray application...${NC}"

    # Kill any existing instance
    pkill -f "screencontrol-tray" 2>/dev/null || true
    sleep 1

    # Start new instance
    nohup "$INSTALL_DIR/screencontrol-tray-wrapper" > /dev/null 2>&1 &

    sleep 2

    if pgrep -f "screencontrol-tray" > /dev/null; then
        echo -e "${GREEN}Tray application started${NC}"
    else
        echo -e "${YELLOW}Warning: Tray application may not have started${NC}"
        echo "  Try running manually: $INSTALL_DIR/screencontrol-tray-wrapper"
    fi
}

# Main installation
main() {
    # Check if running as root (we need sudo for some parts)
    if [[ $EUID -eq 0 ]]; then
        echo -e "${RED}Error: Do not run this script as root${NC}"
        echo "Run as normal user - sudo will be used when needed"
        exit 1
    fi

    # Install dependencies
    install_dependencies

    # Install tray app
    install_tray_app

    # Create desktop entry
    create_desktop_entry

    # Setup autostart (XDG method - works on both GNOME and KDE)
    setup_system_autostart

    # Also create systemd user service as alternative
    create_systemd_user_service

    # Enable GNOME extension if on GNOME
    enable_gnome_extension

    # Start the tray app
    start_tray_app

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Installation Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "The ScreenControl tray application has been installed."
    echo ""
    echo "  - Tray app: $INSTALL_DIR/screencontrol-tray"
    echo "  - Autostart: Enabled for all users"
    echo "  - GUI Bridge: Running on port 3460"
    echo ""
    echo "The tray icon should appear in your system tray."
    echo ""

    if [[ "$DESKTOP" == *"GNOME"* ]]; then
        echo -e "${YELLOW}GNOME Users:${NC}"
        echo "  If you don't see the tray icon, install the AppIndicator extension:"
        echo "  https://extensions.gnome.org/extension/615/appindicator-support/"
        echo ""
    fi
}

# Run main
main "$@"
