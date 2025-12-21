#!/bin/bash
# Build static ScreenControlService for Alpine Linux
# Run this on an Alpine build machine or in Docker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$SCRIPT_DIR/../../service"
OUTPUT_DIR="$SCRIPT_DIR/../overlay/opt/screencontrol"

echo "=========================================="
echo "Building Static ScreenControlService"
echo "=========================================="

# Check if we're on Alpine or in Docker
if [ -f /etc/alpine-release ]; then
    echo "Building on Alpine Linux..."

    # Install build dependencies
    apk add --no-cache \
        build-base \
        cmake \
        openssl-dev \
        openssl-libs-static \
        linux-headers \
        musl-dev

    # Build with static linking
    mkdir -p "$SERVICE_DIR/build-alpine"
    cd "$SERVICE_DIR/build-alpine"

    cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_STATIC=ON \
        -DCMAKE_EXE_LINKER_FLAGS="-static"

    make -j$(nproc)

    # Copy to overlay
    mkdir -p "$OUTPUT_DIR"
    cp ScreenControlService "$OUTPUT_DIR/"
    chmod +x "$OUTPUT_DIR/ScreenControlService"

    echo "Static binary created: $OUTPUT_DIR/ScreenControlService"
    ls -lh "$OUTPUT_DIR/ScreenControlService"

else
    echo "Not on Alpine Linux. Use Docker to build:"
    echo ""
    echo "  docker run --rm -v \$(pwd)/..:/build alpine:3.19 /build/scripts/build-agent-static.sh"
    echo ""
    exit 1
fi
