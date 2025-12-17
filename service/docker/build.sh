#!/bin/bash
# Cross-compilation build script
# Usage: ./build.sh [target]
# Targets: windows-arm64, windows-x64, linux-x64, linux-arm64 (native), all

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${SERVICE_DIR}/dist"

# Build the Docker image if needed
build_image() {
    echo "Building cross-compilation Docker image..."
    docker build -t screencontrol-cross:latest -f "${SCRIPT_DIR}/Dockerfile.cross" "${SCRIPT_DIR}"
}

# Run build in container
build_target() {
    local target=$1
    local toolchain="/toolchains/${target}.cmake"
    local build_dir="/build/build-${target}"
    local output_name="ScreenControlService"

    if [[ "$target" == "windows"* ]]; then
        output_name="ScreenControlService.exe"
    fi

    echo "Building for ${target}..."

    mkdir -p "${OUTPUT_DIR}"

    if [[ "$target" == "linux-arm64" ]]; then
        # Native build, no toolchain needed
        docker run --rm \
            -v "${SERVICE_DIR}:/src:ro" \
            -v "${OUTPUT_DIR}:/dist" \
            screencontrol-cross:latest \
            -c "mkdir -p ${build_dir} && \
                cd ${build_dir} && \
                cmake /src -G Ninja && \
                cmake --build . && \
                cp bin/${output_name} /dist/${target}/"
    else
        docker run --rm \
            -v "${SERVICE_DIR}:/src:ro" \
            -v "${OUTPUT_DIR}:/dist" \
            screencontrol-cross:latest \
            -c "mkdir -p ${build_dir} && \
                cd ${build_dir} && \
                cmake /src -G Ninja -DCMAKE_TOOLCHAIN_FILE=${toolchain} && \
                cmake --build . && \
                mkdir -p /dist/${target} && \
                cp bin/${output_name} /dist/${target}/"
    fi

    echo "✓ Built: ${OUTPUT_DIR}/${target}/${output_name}"
}

# Main
case "${1:-all}" in
    windows-arm64|windows-x64|linux-x64|linux-arm64)
        build_image
        build_target "$1"
        ;;
    all)
        build_image
        build_target "windows-arm64"
        build_target "windows-x64"
        build_target "linux-x64"
        build_target "linux-arm64"
        echo ""
        echo "All builds complete. Output in ${OUTPUT_DIR}/"
        ;;
    image)
        build_image
        ;;
    *)
        echo "Usage: $0 [windows-arm64|windows-x64|linux-x64|linux-arm64|all|image]"
        exit 1
        ;;
esac
