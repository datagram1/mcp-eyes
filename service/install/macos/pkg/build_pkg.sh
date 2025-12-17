#!/bin/bash
#
# ScreenControl macOS Installer Builder
#
# This script builds the .pkg installer for macOS.
# It builds both the service and the tray app, then packages them together.
#
# Usage:
#   ./build_pkg.sh                    # Build unsigned installer
#   ./build_pkg.sh --sign "Developer ID Installer: Your Name (TEAMID)"
#   ./build_pkg.sh --notarize         # Sign and notarize (requires signing identity)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Version
VERSION="1.0.0"
BUILD_NUMBER=$(date +%Y%m%d%H%M)

# Paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
SERVICE_DIR="$PROJECT_ROOT/service"
MACOS_DIR="$PROJECT_ROOT/macos"
BUILD_DIR="$SCRIPT_DIR/build"
OUTPUT_DIR="$SCRIPT_DIR/output"

# Installer identity (for signing)
INSTALLER_IDENTITY=""
NOTARIZE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --sign)
            INSTALLER_IDENTITY="$2"
            shift 2
            ;;
        --notarize)
            NOTARIZE=true
            shift
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}ScreenControl macOS Installer Builder${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Clean previous build
echo -e "${YELLOW}Cleaning previous build...${NC}"
rm -rf "$BUILD_DIR"
rm -rf "$OUTPUT_DIR"
mkdir -p "$BUILD_DIR/service_root"
mkdir -p "$BUILD_DIR/agent_root"
mkdir -p "$BUILD_DIR/scripts"
mkdir -p "$OUTPUT_DIR"

# ============================================
# Step 1: Build the Service
# ============================================
echo ""
echo -e "${BLUE}[1/5] Building ScreenControl Service...${NC}"

cd "$SERVICE_DIR"

# Create build directory if needed
if [[ ! -d "build" ]]; then
    mkdir -p build
fi

cd build

# Configure with CMake
echo "  Configuring with CMake..."
cmake .. -DCMAKE_BUILD_TYPE=Release -DPLATFORM_MACOS=1

# Build
echo "  Compiling..."
cmake --build . --config Release -j$(sysctl -n hw.ncpu)

# Verify binary exists
SERVICE_BINARY="$SERVICE_DIR/build/bin/ScreenControlService"
if [[ ! -f "$SERVICE_BINARY" ]]; then
    echo -e "${RED}Error: Service binary not found at $SERVICE_BINARY${NC}"
    exit 1
fi

echo -e "${GREEN}  Service built successfully${NC}"

# ============================================
# Step 2: Build the Tray App
# ============================================
echo ""
echo -e "${BLUE}[2/5] Building ScreenControl Agent...${NC}"

cd "$MACOS_DIR"

# Build with xcodebuild
echo "  Building with Xcode..."
xcodebuild -project ScreenControl.xcodeproj \
    -scheme ScreenControl \
    -configuration Release \
    -derivedDataPath "$BUILD_DIR/DerivedData" \
    build \
    ONLY_ACTIVE_ARCH=NO \
    CODE_SIGN_IDENTITY="-" \
    CODE_SIGNING_REQUIRED=NO \
    2>&1 | grep -E "^(Build|Compile|Link|error:|warning:|\*\*)" || true

APP_BUNDLE="$BUILD_DIR/DerivedData/Build/Products/Release/ScreenControl.app"
if [[ ! -d "$APP_BUNDLE" ]]; then
    echo -e "${RED}Error: App bundle not found at $APP_BUNDLE${NC}"
    exit 1
fi

echo -e "${GREEN}  Agent built successfully${NC}"

# ============================================
# Step 3: Create Package Roots
# ============================================
echo ""
echo -e "${BLUE}[3/5] Creating package roots...${NC}"

# Service package root
echo "  Creating service package root..."
mkdir -p "$BUILD_DIR/service_root/Library/PrivilegedHelperTools"
mkdir -p "$BUILD_DIR/service_root/Library/LaunchDaemons"
mkdir -p "$BUILD_DIR/service_root/Library/Application Support/ScreenControl"

cp "$SERVICE_BINARY" "$BUILD_DIR/service_root/Library/PrivilegedHelperTools/com.screencontrol.service"
cp "$SCRIPT_DIR/../com.screencontrol.service.plist" "$BUILD_DIR/service_root/Library/LaunchDaemons/"

# Copy uninstall script to Application Support
cp "$SCRIPT_DIR/../uninstall.sh" "$BUILD_DIR/service_root/Library/Application Support/ScreenControl/"
chmod 755 "$BUILD_DIR/service_root/Library/Application Support/ScreenControl/uninstall.sh"

# Agent package root
echo "  Creating agent package root..."
mkdir -p "$BUILD_DIR/agent_root/Applications"
cp -R "$APP_BUNDLE" "$BUILD_DIR/agent_root/Applications/"

# Copy scripts
echo "  Copying installer scripts..."
cp "$SCRIPT_DIR/scripts/preinstall" "$BUILD_DIR/scripts/"
cp "$SCRIPT_DIR/scripts/postinstall" "$BUILD_DIR/scripts/"
chmod 755 "$BUILD_DIR/scripts/preinstall"
chmod 755 "$BUILD_DIR/scripts/postinstall"

echo -e "${GREEN}  Package roots created${NC}"

# ============================================
# Step 4: Build Component Packages
# ============================================
echo ""
echo -e "${BLUE}[4/5] Building component packages...${NC}"

# Build service.pkg
echo "  Building service.pkg..."
pkgbuild \
    --root "$BUILD_DIR/service_root" \
    --identifier "com.screencontrol.service.pkg" \
    --version "$VERSION" \
    --scripts "$BUILD_DIR/scripts" \
    --install-location "/" \
    "$BUILD_DIR/service.pkg"

# Build agent.pkg (no scripts needed - postinstall handles everything)
echo "  Building agent.pkg..."
pkgbuild \
    --root "$BUILD_DIR/agent_root" \
    --identifier "com.screencontrol.agent.pkg" \
    --version "$VERSION" \
    --install-location "/" \
    "$BUILD_DIR/agent.pkg"

echo -e "${GREEN}  Component packages built${NC}"

# ============================================
# Step 5: Build Product Archive
# ============================================
echo ""
echo -e "${BLUE}[5/5] Building product archive...${NC}"

INSTALLER_NAME="ScreenControl-${VERSION}.pkg"
INSTALLER_PATH="$OUTPUT_DIR/$INSTALLER_NAME"

# Copy component packages to resources for productbuild
cp "$BUILD_DIR/service.pkg" "$SCRIPT_DIR/resources/"
cp "$BUILD_DIR/agent.pkg" "$SCRIPT_DIR/resources/"

# Build the product archive
if [[ -n "$INSTALLER_IDENTITY" ]]; then
    echo "  Building signed installer..."
    productbuild \
        --distribution "$SCRIPT_DIR/Distribution.xml" \
        --resources "$SCRIPT_DIR/resources" \
        --package-path "$SCRIPT_DIR/resources" \
        --sign "$INSTALLER_IDENTITY" \
        "$INSTALLER_PATH"
else
    echo "  Building unsigned installer..."
    productbuild \
        --distribution "$SCRIPT_DIR/Distribution.xml" \
        --resources "$SCRIPT_DIR/resources" \
        --package-path "$SCRIPT_DIR/resources" \
        "$INSTALLER_PATH"
fi

# Clean up temporary component packages from resources
rm -f "$SCRIPT_DIR/resources/service.pkg"
rm -f "$SCRIPT_DIR/resources/agent.pkg"

echo -e "${GREEN}  Product archive built${NC}"

# ============================================
# Notarization (optional)
# ============================================
if [[ "$NOTARIZE" == true ]] && [[ -n "$INSTALLER_IDENTITY" ]]; then
    echo ""
    echo -e "${BLUE}Submitting for notarization...${NC}"
    echo -e "${YELLOW}Note: Notarization requires Apple Developer credentials in Keychain${NC}"

    # Submit for notarization
    xcrun notarytool submit "$INSTALLER_PATH" \
        --keychain-profile "notarytool-profile" \
        --wait

    # Staple the ticket
    xcrun stapler staple "$INSTALLER_PATH"

    echo -e "${GREEN}Notarization complete${NC}"
fi

# ============================================
# Summary
# ============================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Build Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Installer: $INSTALLER_PATH"
echo "Size: $(du -h "$INSTALLER_PATH" | cut -f1)"
echo ""

if [[ -n "$INSTALLER_IDENTITY" ]]; then
    echo "Signed: Yes"
    if [[ "$NOTARIZE" == true ]]; then
        echo "Notarized: Yes"
    else
        echo "Notarized: No (use --notarize to notarize)"
    fi
else
    echo -e "${YELLOW}Signed: No (use --sign to sign)${NC}"
    echo "Note: Unsigned installers will show a Gatekeeper warning on macOS."
fi

echo ""
echo "To install:"
echo "  open \"$INSTALLER_PATH\""
echo ""
echo "To install silently:"
echo "  sudo installer -pkg \"$INSTALLER_PATH\" -target /"
