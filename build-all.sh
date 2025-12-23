#!/bin/bash
# ScreenControl Cross-Platform Build Script
# Builds all components from macOS (Apple Silicon) or Linux ARM64
#
# Requirements:
#   - Zig: brew install zig (macOS) or download from ziglang.org
#   - .NET 8 SDK: brew install dotnet (macOS) or https://dot.net
#
# Usage:
#   ./build-all.sh                    # Build all targets
#   ./build-all.sh windows            # Build Windows (ARM64 + x64)
#   ./build-all.sh windows-arm64      # Build specific target
#   ./build-all.sh service            # Build C++ service only
#   ./build-all.sh tray               # Build C# tray app only

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/dist"
SERVICE_DIR="${SCRIPT_DIR}/service"
TRAY_DIR="${SCRIPT_DIR}/windows/ScreenControlTray"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Find dotnet - prefer official installer over homebrew
find_dotnet() {
    if [[ -x "$HOME/.dotnet/dotnet" ]]; then
        echo "$HOME/.dotnet/dotnet"
    elif command -v dotnet &> /dev/null; then
        echo "dotnet"
    else
        echo ""
    fi
}

DOTNET_CMD=""

# Check prerequisites
check_prereqs() {
    local missing=()

    if ! command -v zig &> /dev/null; then
        missing+=("zig (brew install zig)")
    fi

    DOTNET_CMD=$(find_dotnet)
    if [[ -z "$DOTNET_CMD" ]]; then
        missing+=("dotnet (.NET 8 SDK - run: curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0)")
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing prerequisites:"
        for m in "${missing[@]}"; do
            echo "  - $m"
        done
        exit 1
    fi

    log_info "Zig version: $(zig version)"
    log_info ".NET: $DOTNET_CMD (v$($DOTNET_CMD --version))"
}

# Build C++ service using Zig
build_service() {
    local target=$1
    local zig_target=""
    local output_name="ScreenControlService"
    local platform_def=""

    case "$target" in
        windows-arm64)
            zig_target="aarch64-windows-gnu"
            output_name="ScreenControlService.exe"
            platform_def="-DPLATFORM_WINDOWS=1"
            ;;
        windows-x64)
            zig_target="x86_64-windows-gnu"
            output_name="ScreenControlService.exe"
            platform_def="-DPLATFORM_WINDOWS=1"
            ;;
        linux-arm64)
            zig_target="aarch64-linux-gnu"
            platform_def="-DPLATFORM_LINUX=1"
            ;;
        linux-x64)
            zig_target="x86_64-linux-gnu"
            platform_def="-DPLATFORM_LINUX=1"
            ;;
        *)
            log_error "Unknown service target: $target"
            return 1
            ;;
    esac

    local dist_dir="${OUTPUT_DIR}/${target}"
    mkdir -p "$dist_dir"

    log_info "Building C++ service for ${target}..."

    cd "$SERVICE_DIR"

    # Compile with Zig
    # Note: For Windows we use MinGW-style linking (-windows-gnu)
    local src_files=(
        src/core/config.cpp
        src/core/logger.cpp
        src/core/security.cpp
        src/server/http_server.cpp
        src/control_server/command_dispatcher.cpp
        src/tools/filesystem_tools.cpp
        src/tools/shell_tools.cpp
        src/tools/system_tools.cpp
    )

    local platform_files=()
    local link_libs=()

    if [[ "$target" == "windows"* ]]; then
        # Windows-specific: use native crypto/websocket (no OpenSSL)
        src_files+=(
            src/core/crypto_windows.cpp
            src/control_server/websocket_client_windows.cpp
        )
        platform_files=(
            src/platform/windows/main_windows.cpp
            src/platform/windows/platform_windows.cpp
        )
        link_libs=(-lws2_32 -ladvapi32 -luser32 -lgdi32 -lgdiplus -lole32 -loleaut32 -lpsapi -lshlwapi -lshell32 -lbcrypt -lwtsapi32 -luserenv -lcredui -lsecur32 -lcrypt32)
    elif [[ "$target" == "linux"* ]]; then
        # Linux: use stub crypto/websocket for cross-compilation (no OpenSSL dependency)
        # For production, build natively with OpenSSL using Docker
        src_files+=(
            src/core/crypto_linux_stub.cpp
            src/control_server/websocket_client_linux_stub.cpp
        )
        platform_files=(
            src/platform/linux/main_linux.cpp
            src/platform/linux/platform_linux.cpp
        )
        link_libs=(-lpthread)
    fi

    zig c++ -target ${zig_target} \
        -std=c++17 \
        -O2 \
        -I include \
        -I src/libs \
        ${platform_def} \
        -D_WIN32_WINNT=0x0600 \
        -DUNICODE -D_UNICODE \
        -DWIN32_LEAN_AND_MEAN \
        -DNOMINMAX \
        "${src_files[@]}" \
        "${platform_files[@]}" \
        "${link_libs[@]}" \
        -o "${dist_dir}/${output_name}" \
        2>&1 || {
            log_warn "Build failed for ${target} - check source compatibility"
            return 1
        }

    log_info "Built: ${dist_dir}/${output_name}"
    ls -lh "${dist_dir}/${output_name}"
}

# Build C# tray app using .NET SDK
build_tray() {
    local target=$1
    local rid=""

    case "$target" in
        windows-arm64) rid="win-arm64" ;;
        windows-x64)   rid="win-x64" ;;
        *)
            log_error "Tray app only supports Windows targets"
            return 1
            ;;
    esac

    local dist_dir="${OUTPUT_DIR}/${target}"
    mkdir -p "$dist_dir"

    log_info "Building C# tray app for ${target} (RID: ${rid})..."

    cd "$TRAY_DIR"

    # Clean previous builds
    rm -rf bin obj

    # Publish for target architecture
    $DOTNET_CMD publish \
        -c Release \
        -r "$rid" \
        --self-contained true \
        -p:PublishSingleFile=true \
        -p:IncludeNativeLibrariesForSelfExtract=true \
        -o "${dist_dir}" \
        2>&1

    log_info "Built: ${dist_dir}/ScreenControlTray.exe"
    ls -lh "${dist_dir}/ScreenControlTray.exe"
}

# Build specific target
build_target() {
    local target=$1

    case "$target" in
        windows-arm64|windows-x64)
            build_service "$target" || true
            build_tray "$target"
            ;;
        linux-arm64|linux-x64)
            build_service "$target"
            ;;
        *)
            log_error "Unknown target: $target"
            exit 1
            ;;
    esac
}

# Main
main() {
    check_prereqs

    mkdir -p "$OUTPUT_DIR"

    case "${1:-all}" in
        all)
            log_info "Building all targets..."
            build_target "windows-arm64"
            build_target "windows-x64"
            build_target "linux-arm64"
            build_target "linux-x64"
            ;;
        windows)
            build_target "windows-arm64"
            build_target "windows-x64"
            ;;
        linux)
            build_target "linux-arm64"
            build_target "linux-x64"
            ;;
        service)
            for t in windows-arm64 windows-x64 linux-arm64 linux-x64; do
                build_service "$t" || true
            done
            ;;
        tray)
            build_tray "windows-arm64"
            build_tray "windows-x64"
            ;;
        windows-arm64|windows-x64|linux-arm64|linux-x64)
            build_target "$1"
            ;;
        *)
            echo "Usage: $0 [target]"
            echo ""
            echo "Targets:"
            echo "  all            Build everything (default)"
            echo "  windows        Build Windows ARM64 + x64"
            echo "  linux          Build Linux ARM64 + x64"
            echo "  windows-arm64  Build Windows ARM64 only"
            echo "  windows-x64    Build Windows x64 only"
            echo "  linux-arm64    Build Linux ARM64 only"
            echo "  linux-x64      Build Linux x64 only"
            echo "  service        Build C++ service only (all platforms)"
            echo "  tray           Build C# tray app only (Windows)"
            exit 1
            ;;
    esac

    echo ""
    log_info "Build complete. Output in ${OUTPUT_DIR}/"
    echo ""
    find "${OUTPUT_DIR}" -type f \( -name "*.exe" -o -name "ScreenControlService" \) -exec ls -lh {} \; 2>/dev/null || true
}

main "$@"
