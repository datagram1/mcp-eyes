#!/bin/bash
# ScreenControl Rescue - Local Build Script
# This script builds the rescue ISO using Docker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
VERSION="${VERSION:-1.0.0}"
ARCH="${ARCH:-x86_64}"
TENANT_ID="${TENANT_ID:-}"
IMAGE_NAME="screencontrol-rescue-builder"

echo "=========================================="
echo "ScreenControl Rescue - Build System"
echo "=========================================="
echo ""

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is required but not installed."
    echo "Please install Docker and try again."
    exit 1
fi

# Check for static agent binary
if [ ! -f "overlay/opt/screencontrol/ScreenControlService" ]; then
    echo "Warning: ScreenControlService binary not found in overlay/"
    echo "The ISO will build but without the agent binary."
    echo ""
    echo "To include the agent, build a static binary and copy it to:"
    echo "  $SCRIPT_DIR/overlay/opt/screencontrol/ScreenControlService"
    echo ""
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Build Docker image
echo "[1/3] Building Docker image..."
docker build -t "$IMAGE_NAME" .

# Create output directory
mkdir -p dist

# Run build
echo "[2/3] Running ISO build..."
docker run --rm \
    -v "$SCRIPT_DIR/dist:/output" \
    -e VERSION="$VERSION" \
    -e ARCH="$ARCH" \
    -e TENANT_ID="$TENANT_ID" \
    "$IMAGE_NAME"

# Show results
echo ""
echo "[3/3] Build complete!"
echo ""
echo "Output files:"
ls -lh dist/

echo ""
echo "To write to USB (Linux/macOS):"
echo "  sudo dd if=dist/screencontrol-rescue-$VERSION-$ARCH.iso of=/dev/sdX bs=4M status=progress"
echo ""
echo "To test in QEMU:"
echo "  qemu-system-x86_64 -cdrom dist/screencontrol-rescue-$VERSION-$ARCH.iso -m 2G"
