#!/bin/bash
#
# MCP Eyes Native Messaging Host Installer
#
# This script installs the native messaging host for Chrome and/or Firefox on macOS.
# It creates the necessary manifest files and symlinks.
#
# Usage:
#   ./install.sh [chrome|firefox|all] [extension-id]
#
# Examples:
#   ./install.sh all                           # Install for both browsers
#   ./install.sh chrome abcdef123456           # Install for Chrome with specific extension ID
#   ./install.sh firefox                       # Install for Firefox
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="com.mcpeyes.bridge"
HOST_SCRIPT="$SCRIPT_DIR/mcp-eyes-bridge.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin)
            OS="macos"
            ;;
        Linux)
            OS="linux"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            OS="windows"
            ;;
        *)
            log_error "Unsupported operating system"
            exit 1
            ;;
    esac
    log_info "Detected OS: $OS"
}

# Get Chrome native messaging hosts directory
get_chrome_dir() {
    case "$OS" in
        macos)
            echo "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
            ;;
        linux)
            echo "$HOME/.config/google-chrome/NativeMessagingHosts"
            ;;
        windows)
            echo "$APPDATA/Google/Chrome/NativeMessagingHosts"
            ;;
    esac
}

# Get Chromium native messaging hosts directory
get_chromium_dir() {
    case "$OS" in
        macos)
            echo "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
            ;;
        linux)
            echo "$HOME/.config/chromium/NativeMessagingHosts"
            ;;
        *)
            echo ""
            ;;
    esac
}

# Get Firefox native messaging hosts directory
get_firefox_dir() {
    case "$OS" in
        macos)
            echo "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
            ;;
        linux)
            echo "$HOME/.mozilla/native-messaging-hosts"
            ;;
        windows)
            echo "$APPDATA/Mozilla/NativeMessagingHosts"
            ;;
    esac
}

# Install for Chrome
install_chrome() {
    local extension_id="$1"
    local chrome_dir=$(get_chrome_dir)
    local chromium_dir=$(get_chromium_dir)

    log_info "Installing native messaging host for Chrome..."

    # Create directory if it doesn't exist
    mkdir -p "$chrome_dir"

    # Generate manifest
    local manifest="$chrome_dir/$HOST_NAME.json"
    cat > "$manifest" << EOF
{
  "name": "$HOST_NAME",
  "description": "MCP Eyes Browser Bridge - Native messaging host for LLM-driven web automation",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$extension_id/"
  ]
}
EOF

    chmod 644 "$manifest"
    log_info "Created Chrome manifest: $manifest"

    # Also install for Chromium if directory exists
    if [ -n "$chromium_dir" ]; then
        mkdir -p "$chromium_dir"
        cp "$manifest" "$chromium_dir/$HOST_NAME.json"
        log_info "Created Chromium manifest: $chromium_dir/$HOST_NAME.json"
    fi

    log_info "Chrome installation complete"
}

# Install for Firefox
install_firefox() {
    local firefox_dir=$(get_firefox_dir)

    log_info "Installing native messaging host for Firefox..."

    # Create directory if it doesn't exist
    mkdir -p "$firefox_dir"

    # Generate manifest (Firefox uses allowed_extensions instead of allowed_origins)
    local manifest="$firefox_dir/$HOST_NAME.json"
    cat > "$manifest" << EOF
{
  "name": "$HOST_NAME",
  "description": "MCP Eyes Browser Bridge - Native messaging host for LLM-driven web automation",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_extensions": [
    "mcp-eyes@datagram1.com"
  ]
}
EOF

    chmod 644 "$manifest"
    log_info "Created Firefox manifest: $manifest"
    log_info "Firefox installation complete"
}

# Make the host script executable
make_executable() {
    chmod +x "$HOST_SCRIPT"
    log_info "Made host script executable: $HOST_SCRIPT"
}

# Verify Node.js is available
verify_node() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not found in PATH"
        log_error "Please install Node.js: https://nodejs.org/"
        exit 1
    fi
    log_info "Node.js found: $(node --version)"
}

# Show usage
usage() {
    echo "MCP Eyes Native Messaging Host Installer"
    echo ""
    echo "Usage: $0 [browser] [chrome-extension-id]"
    echo ""
    echo "Browsers:"
    echo "  chrome    Install for Chrome/Chromium only"
    echo "  firefox   Install for Firefox only"
    echo "  all       Install for all browsers (default)"
    echo ""
    echo "Options:"
    echo "  chrome-extension-id   Required for Chrome installation"
    echo "                        (get this from chrome://extensions after loading the extension)"
    echo ""
    echo "Examples:"
    echo "  $0 all abcdefghijklmnop"
    echo "  $0 chrome abcdefghijklmnop"
    echo "  $0 firefox"
    echo ""
}

# Uninstall
uninstall() {
    log_info "Uninstalling native messaging host..."

    local chrome_dir=$(get_chrome_dir)
    local chromium_dir=$(get_chromium_dir)
    local firefox_dir=$(get_firefox_dir)

    rm -f "$chrome_dir/$HOST_NAME.json" 2>/dev/null && log_info "Removed Chrome manifest"
    rm -f "$chromium_dir/$HOST_NAME.json" 2>/dev/null && log_info "Removed Chromium manifest"
    rm -f "$firefox_dir/$HOST_NAME.json" 2>/dev/null && log_info "Removed Firefox manifest"

    log_info "Uninstallation complete"
}

# Main
main() {
    local browser="${1:-all}"
    local extension_id="${2:-}"

    detect_os
    verify_node

    case "$browser" in
        --help|-h)
            usage
            exit 0
            ;;
        --uninstall|-u)
            uninstall
            exit 0
            ;;
        chrome)
            if [ -z "$extension_id" ]; then
                log_error "Chrome extension ID is required"
                log_error "Load the extension first, then get the ID from chrome://extensions"
                exit 1
            fi
            make_executable
            install_chrome "$extension_id"
            ;;
        firefox)
            make_executable
            install_firefox
            ;;
        all)
            if [ -z "$extension_id" ]; then
                log_warn "No Chrome extension ID provided"
                log_warn "You'll need to reinstall for Chrome after loading the extension"
                extension_id="PLACEHOLDER_EXTENSION_ID"
            fi
            make_executable
            install_chrome "$extension_id"
            install_firefox
            ;;
        *)
            log_error "Unknown browser: $browser"
            usage
            exit 1
            ;;
    esac

    echo ""
    log_info "Installation complete!"
    echo ""
    echo "Next steps:"
    echo "1. Load the extension in your browser:"
    echo "   - Chrome: Go to chrome://extensions, enable Developer mode, click 'Load unpacked'"
    echo "   - Firefox: Go to about:debugging, click 'Load Temporary Add-on'"
    echo ""
    echo "2. For Chrome, note the extension ID and re-run:"
    echo "   $0 chrome <extension-id>"
    echo ""
    echo "3. The extension should now be able to communicate with mcp_eyes!"
    echo ""
}

main "$@"
