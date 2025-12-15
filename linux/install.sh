#!/bin/bash
#
# ScreenControl Linux Agent Installer
# https://github.com/datagram1/mcp-eyes
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/datagram1/mcp-eyes/main/linux/install.sh | sudo bash
#   OR
#   sudo ./install.sh
#
# Options:
#   --headless    Build without GUI support (no GTK dependency)
#   --uninstall   Remove ScreenControl agent
#   --help        Show this help message
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/screencontrol"
SERVICE_NAME="screencontrol-agent"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
BUILD_GUI=ON
UNINSTALL=false

# Functions
print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║           ScreenControl Linux Agent Installer             ║"
    echo "║                                                           ║"
    echo "║  AI-powered desktop automation via MCP                    ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
        DISTRO_VERSION=$VERSION_ID
    elif [ -f /etc/redhat-release ]; then
        DISTRO="rhel"
    else
        DISTRO="unknown"
    fi
    log_info "Detected distribution: $DISTRO $DISTRO_VERSION"
}

detect_arch() {
    ARCH=$(uname -m)
    log_info "Detected architecture: $ARCH"
}

install_dependencies() {
    log_info "Installing build dependencies..."

    case $DISTRO in
        ubuntu|debian|pop|linuxmint)
            apt-get update -qq
            apt-get install -y -qq build-essential cmake pkg-config \
                libx11-dev libxext-dev libxtst-dev libxrandr-dev \
                xclip curl ca-certificates libssl-dev

            if [ "$BUILD_GUI" = "ON" ]; then
                apt-get install -y -qq libgtk-3-dev
            fi

            # Install grim for Wayland screenshots if available
            if apt-cache show grim &>/dev/null; then
                apt-get install -y -qq grim || true
            fi
            ;;

        fedora)
            dnf install -y -q gcc-c++ cmake pkgconfig \
                libX11-devel libXext-devel libXtst-devel libXrandr-devel \
                xclip curl ca-certificates openssl-devel

            if [ "$BUILD_GUI" = "ON" ]; then
                dnf install -y -q gtk3-devel
            fi

            dnf install -y -q grim || true
            ;;

        rhel|centos|rocky|almalinux)
            dnf install -y -q gcc-c++ cmake pkgconfig \
                libX11-devel libXext-devel libXtst-devel libXrandr-devel \
                xclip curl ca-certificates openssl-devel

            if [ "$BUILD_GUI" = "ON" ]; then
                dnf install -y -q gtk3-devel
            fi
            ;;

        arch|manjaro|endeavouros)
            pacman -Sy --noconfirm --needed base-devel cmake pkgconf \
                libx11 libxext libxtst libxrandr \
                xclip curl ca-certificates openssl

            if [ "$BUILD_GUI" = "ON" ]; then
                pacman -S --noconfirm --needed gtk3
            fi

            pacman -S --noconfirm --needed grim || true
            ;;

        opensuse*|suse*)
            zypper install -y gcc-c++ cmake pkg-config \
                libX11-devel libXext-devel libXtst-devel libXrandr-devel \
                xclip curl ca-certificates libopenssl-devel

            if [ "$BUILD_GUI" = "ON" ]; then
                zypper install -y gtk3-devel
            fi
            ;;

        *)
            log_error "Unsupported distribution: $DISTRO"
            log_info "Please install dependencies manually:"
            echo "  - build-essential/gcc-c++, cmake, pkg-config"
            echo "  - libx11-dev, libxext-dev, libxtst-dev, libxrandr-dev"
            echo "  - libgtk-3-dev (optional, for GUI mode)"
            echo "  - xclip, grim (optional, for clipboard and Wayland screenshots)"
            exit 1
            ;;
    esac

    log_info "Dependencies installed successfully"
}

download_source() {
    log_info "Downloading ScreenControl source..."

    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"

    # Try git clone first, fall back to tarball
    if command -v git &>/dev/null; then
        git clone --depth 1 https://github.com/datagram1/mcp-eyes.git screencontrol
        cd screencontrol/linux/screencontrol
    else
        curl -L -o screencontrol.tar.gz https://github.com/datagram1/mcp-eyes/archive/main.tar.gz
        tar xzf screencontrol.tar.gz
        cd mcp-eyes-main/linux/screencontrol
    fi

    SOURCE_DIR=$(pwd)
    log_info "Source downloaded to: $SOURCE_DIR"
}

build_agent() {
    log_info "Building ScreenControl agent..."

    mkdir -p build
    cd build

    if [ "$BUILD_GUI" = "ON" ]; then
        log_info "Building with GUI support"
        cmake .. -DBUILD_GUI=ON -DCMAKE_BUILD_TYPE=Release
    else
        log_info "Building headless mode (no GUI)"
        cmake .. -DBUILD_GUI=OFF -DBUILD_HEADLESS=ON -DCMAKE_BUILD_TYPE=Release
    fi

    make -j$(nproc)

    if [ ! -f screencontrol ]; then
        log_error "Build failed - binary not created"
        exit 1
    fi

    log_info "Build completed successfully"
}

install_binary() {
    log_info "Installing binary to $INSTALL_DIR..."

    cp screencontrol "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/screencontrol"

    # Verify installation
    if [ -x "$INSTALL_DIR/screencontrol" ]; then
        log_info "Binary installed: $INSTALL_DIR/screencontrol"
    else
        log_error "Failed to install binary"
        exit 1
    fi
}

create_config() {
    log_info "Creating configuration directory..."

    mkdir -p "$CONFIG_DIR"

    if [ ! -f "$CONFIG_DIR/debug-config.json" ]; then
        cat > "$CONFIG_DIR/debug-config.json" << 'EOF'
{
  "serverUrl": "wss://your-control-server.com/ws",
  "serverHttpUrl": "https://your-control-server.com",
  "endpointUuid": "your-endpoint-uuid",
  "customerId": "your-customer-id",
  "connectOnStartup": true,
  "port": 3456
}
EOF
        log_info "Created default config: $CONFIG_DIR/debug-config.json"
        log_warn "Please edit the config file with your control server details"
    else
        log_info "Config file already exists, skipping"
    fi
}

detect_display_env() {
    # Try to detect X11 display environment for systemd service
    DISPLAY_ENV=""
    XAUTH_ENV=""

    # Check for active X session
    if [ -n "$DISPLAY" ]; then
        DISPLAY_ENV="$DISPLAY"
    elif [ -f /tmp/.X11-unix/X0 ]; then
        DISPLAY_ENV=":0"
    fi

    # Try to find XAUTHORITY from common window managers
    for proc in gnome-shell kwin_x11 kwin_wayland mutter xfwm4 openbox; do
        pid=$(pgrep -f "$proc" 2>/dev/null | head -1)
        if [ -n "$pid" ]; then
            xauth=$(cat /proc/$pid/environ 2>/dev/null | tr '\0' '\n' | grep ^XAUTHORITY= | cut -d= -f2)
            if [ -n "$xauth" ] && [ -f "$xauth" ]; then
                XAUTH_ENV="$xauth"
                break
            fi
        fi
    done

    # Fallback to common locations
    if [ -z "$XAUTH_ENV" ]; then
        for xauth in /tmp/xauth_* ~/.Xauthority /run/user/*/gdm/Xauthority; do
            if [ -f "$xauth" ]; then
                XAUTH_ENV="$xauth"
                break
            fi
        done
    fi
}

create_systemd_service() {
    log_info "Creating systemd service..."

    detect_display_env

    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=ScreenControl Linux Agent
After=network.target graphical.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/screencontrol -c $CONFIG_DIR/debug-config.json -p 3456 -v
Restart=always
RestartSec=5
User=root
EOF

    # Add display environment if detected
    if [ -n "$DISPLAY_ENV" ]; then
        echo "Environment=\"DISPLAY=$DISPLAY_ENV\"" >> "$SERVICE_FILE"
    fi

    if [ -n "$XAUTH_ENV" ]; then
        echo "Environment=\"XAUTHORITY=$XAUTH_ENV\"" >> "$SERVICE_FILE"
    fi

    cat >> "$SERVICE_FILE" << 'EOF'

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    log_info "Service file created: $SERVICE_FILE"

    # Reload systemd
    systemctl daemon-reload

    log_info "To start the service:"
    echo "    sudo systemctl start $SERVICE_NAME"
    echo "    sudo systemctl enable $SERVICE_NAME"

    if [ -n "$DISPLAY_ENV" ]; then
        log_info "Detected display: DISPLAY=$DISPLAY_ENV"
    else
        log_warn "No X11 display detected - GUI tools may not work"
        log_info "Edit $SERVICE_FILE to set DISPLAY and XAUTHORITY for GUI support"
    fi
}

cleanup() {
    log_info "Cleaning up temporary files..."
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
}

uninstall() {
    log_info "Uninstalling ScreenControl agent..."

    # Stop and disable service
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        log_info "Stopping service..."
        systemctl stop "$SERVICE_NAME"
    fi

    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        log_info "Disabling service..."
        systemctl disable "$SERVICE_NAME"
    fi

    # Remove files
    if [ -f "$SERVICE_FILE" ]; then
        rm -f "$SERVICE_FILE"
        log_info "Removed service file"
    fi

    if [ -f "$INSTALL_DIR/screencontrol" ]; then
        rm -f "$INSTALL_DIR/screencontrol"
        log_info "Removed binary"
    fi

    systemctl daemon-reload

    log_info "Uninstall complete"
    log_info "Config directory preserved: $CONFIG_DIR"
    log_info "To remove config: sudo rm -rf $CONFIG_DIR"
}

show_help() {
    echo "ScreenControl Linux Agent Installer"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --headless    Build without GUI support (no GTK dependency)"
    echo "  --uninstall   Remove ScreenControl agent"
    echo "  --help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  sudo $0                # Full install with GUI support"
    echo "  sudo $0 --headless     # Install headless mode (servers)"
    echo "  sudo $0 --uninstall    # Remove agent"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --headless)
            BUILD_GUI=OFF
            shift
            ;;
        --uninstall)
            UNINSTALL=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
print_banner
check_root

if [ "$UNINSTALL" = true ]; then
    uninstall
    exit 0
fi

detect_distro
detect_arch
install_dependencies
download_source
build_agent
install_binary
create_config
create_systemd_service
cleanup

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Installation Complete!                          ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit config: sudo nano $CONFIG_DIR/debug-config.json"
echo "  2. Start agent: sudo systemctl start $SERVICE_NAME"
echo "  3. Enable on boot: sudo systemctl enable $SERVICE_NAME"
echo "  4. Check status: sudo systemctl status $SERVICE_NAME"
echo "  5. View logs: sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "Documentation: https://github.com/datagram1/mcp-eyes/blob/main/docs/linux_agent_docs.md"
echo ""
