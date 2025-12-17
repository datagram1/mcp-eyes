#!/bin/bash
# Local cross-compilation using Zig (works on macOS Apple Silicon, Linux ARM64, etc.)
# Usage: ./build-cross.sh [target]
# Targets: windows-arm64, windows-x64, linux-x64, linux-arm64, macos-arm64, macos-x64, all

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/dist"

# Check for zig
if ! command -v zig &> /dev/null; then
    echo "Zig not found. Install with: brew install zig (macOS) or download from ziglang.org"
    exit 1
fi

echo "Using Zig $(zig version)"

build_target() {
    local target=$1
    local zig_target=""
    local output_name="ScreenControlService"
    local cmake_system=""

    case "$target" in
        windows-arm64)
            zig_target="aarch64-windows-gnu"
            cmake_system="Windows"
            output_name="ScreenControlService.exe"
            ;;
        windows-x64)
            zig_target="x86_64-windows-gnu"
            cmake_system="Windows"
            output_name="ScreenControlService.exe"
            ;;
        linux-arm64)
            zig_target="aarch64-linux-gnu"
            cmake_system="Linux"
            ;;
        linux-x64)
            zig_target="x86_64-linux-gnu"
            cmake_system="Linux"
            ;;
        macos-arm64)
            zig_target="aarch64-macos"
            cmake_system="Darwin"
            ;;
        macos-x64)
            zig_target="x86_64-macos"
            cmake_system="Darwin"
            ;;
        *)
            echo "Unknown target: $target"
            return 1
            ;;
    esac

    local build_dir="${SCRIPT_DIR}/build-${target}"
    local dist_dir="${OUTPUT_DIR}/${target}"

    echo "Building for ${target} (zig target: ${zig_target})..."

    mkdir -p "$build_dir" "$dist_dir"

    # Create a temporary toolchain file
    cat > "${build_dir}/toolchain.cmake" << EOF
set(CMAKE_SYSTEM_NAME ${cmake_system})
set(CMAKE_C_COMPILER "${SCRIPT_DIR}/zig-cc")
set(CMAKE_CXX_COMPILER "${SCRIPT_DIR}/zig-cxx")
set(CMAKE_C_COMPILER_WORKS TRUE)
set(CMAKE_CXX_COMPILER_WORKS TRUE)
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)
EOF

    # Create wrapper scripts for zig
    cat > "${SCRIPT_DIR}/zig-cc" << EOF
#!/bin/bash
zig cc -target ${zig_target} "\$@"
EOF
    cat > "${SCRIPT_DIR}/zig-cxx" << EOF
#!/bin/bash
zig c++ -target ${zig_target} "\$@"
EOF
    chmod +x "${SCRIPT_DIR}/zig-cc" "${SCRIPT_DIR}/zig-cxx"

    cd "$build_dir"
    cmake "${SCRIPT_DIR}" -DCMAKE_TOOLCHAIN_FILE="${build_dir}/toolchain.cmake" 2>&1 || true
    cmake --build . 2>&1 || {
        echo "⚠ CMake build failed, trying direct compilation..."
        cd "${SCRIPT_DIR}"

        # Direct zig compilation as fallback
        zig c++ -target ${zig_target} \
            -std=c++17 \
            -I include \
            -I src/libs \
            -DPLATFORM_WINDOWS=1 \
            src/core/*.cpp \
            src/server/*.cpp \
            src/tools/*.cpp \
            src/control_server/*.cpp \
            -o "${dist_dir}/${output_name}" \
            -lws2_32 -ladvapi32 -luser32 -lgdi32 \
            2>&1 || echo "Direct compilation also failed - may need source adjustments"
    }

    if [[ -f "${build_dir}/bin/${output_name}" ]]; then
        cp "${build_dir}/bin/${output_name}" "${dist_dir}/"
        echo "✓ Built: ${dist_dir}/${output_name}"
    elif [[ -f "${dist_dir}/${output_name}" ]]; then
        echo "✓ Built: ${dist_dir}/${output_name}"
    fi

    # Cleanup wrappers
    rm -f "${SCRIPT_DIR}/zig-cc" "${SCRIPT_DIR}/zig-cxx"
}

# Main
case "${1:-}" in
    windows-arm64|windows-x64|linux-arm64|linux-x64|macos-arm64|macos-x64)
        build_target "$1"
        ;;
    all)
        for t in windows-arm64 windows-x64 linux-arm64 linux-x64; do
            build_target "$t" || true
        done
        echo ""
        echo "Builds complete. Output in ${OUTPUT_DIR}/"
        ls -la "${OUTPUT_DIR}"/*/ 2>/dev/null || true
        ;;
    "")
        echo "Usage: $0 <target>"
        echo "Targets: windows-arm64, windows-x64, linux-arm64, linux-x64, macos-arm64, macos-x64, all"
        ;;
    *)
        echo "Unknown target: $1"
        exit 1
        ;;
esac
