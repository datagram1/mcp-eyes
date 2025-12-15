#!/bin/bash
# Build script for Windows ScreenControlService using Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# What to build: "service" (default), "gui", or "all"
BUILD_TARGET="${1:-service}"

echo -e "${GREEN}Building Windows ScreenControl ($BUILD_TARGET) with Docker${NC}"

# Check if we're in Docker or need to run Docker
if [ -f /.dockerenv ]; then
    echo -e "${YELLOW}Running inside Docker container${NC}"
    BUILD_DIR=/build
else
    echo -e "${YELLOW}Running Docker container${NC}"
    # Get the directory of this script
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

    # Build Docker image if needed
    docker build -t screencontrol-windows-builder "$SCRIPT_DIR"

    # Run Docker container
    docker run --rm -v "$PROJECT_ROOT:/project" -w /project/windows \
        screencontrol-windows-builder /bin/bash -c "chmod +x build.sh && ./build.sh $BUILD_TARGET"
    exit $?
fi

# Inside Docker - actual build process
BUILD_DIR="${BUILD_DIR:-/build}"
BUILD_TYPE="${BUILD_TYPE:-Release}"

echo -e "${GREEN}Setting up build environment${NC}"

# Create MinGW toolchain file
cat > /tmp/mingw-toolchain.cmake << 'EOF'
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR x86_64)

# Specify cross compilers
set(CMAKE_C_COMPILER x86_64-w64-mingw32-gcc-posix)
set(CMAKE_CXX_COMPILER x86_64-w64-mingw32-g++-posix)
set(CMAKE_RC_COMPILER x86_64-w64-mingw32-windres)

# Target environment
set(CMAKE_FIND_ROOT_PATH /usr/x86_64-w64-mingw32)

# Search for programs in host, libraries and headers in target
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)

# Compiler flags
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -static-libgcc")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -static-libgcc -static-libstdc++")

# Disable some warnings for cross-compilation
add_compile_options(-Wno-unknown-pragmas)
EOF

# Function to build with CMake
build_project() {
    local SRC_DIR="$1"
    local OUTPUT_NAME="$2"

    echo -e "${GREEN}Building $OUTPUT_NAME from $SRC_DIR${NC}"

    mkdir -p "$BUILD_DIR/build-$OUTPUT_NAME"
    cd "$BUILD_DIR/build-$OUTPUT_NAME"

    cmake "$SRC_DIR" \
        -DCMAKE_TOOLCHAIN_FILE=/tmp/mingw-toolchain.cmake \
        -DCMAKE_BUILD_TYPE="$BUILD_TYPE"

    cmake --build . --config "$BUILD_TYPE" -j$(nproc)
}

# Build based on target
case "$BUILD_TARGET" in
    service)
        build_project "$BUILD_DIR/ScreenControlService" "ScreenControlService"
        OUTPUT_DIR="$BUILD_DIR/build-ScreenControlService"
        ;;
    gui)
        build_project "$BUILD_DIR" "MCPEyes"
        OUTPUT_DIR="$BUILD_DIR/build-MCPEyes"
        ;;
    all)
        build_project "$BUILD_DIR/ScreenControlService" "ScreenControlService"
        build_project "$BUILD_DIR" "MCPEyes"
        OUTPUT_DIR="$BUILD_DIR"
        ;;
    *)
        echo -e "${RED}Unknown target: $BUILD_TARGET${NC}"
        echo "Usage: $0 [service|gui|all]"
        exit 1
        ;;
esac

# Check if build succeeded
echo -e "${GREEN}Build successful!${NC}"
echo -e "${GREEN}Output files:${NC}"
find "$BUILD_DIR" -name "*.exe" -type f 2>/dev/null | head -10

# Copy outputs to a common bin folder
mkdir -p "$BUILD_DIR/bin"
find "$BUILD_DIR" -name "*.exe" -type f -exec cp {} "$BUILD_DIR/bin/" \; 2>/dev/null || true
echo -e "${GREEN}Executables copied to $BUILD_DIR/bin/${NC}"
ls -lh "$BUILD_DIR/bin/" 2>/dev/null || true

# Copy to project output folder (accessible outside Docker)
if [ -d "/project/windows" ]; then
    mkdir -p /project/windows/output
    cp "$BUILD_DIR/build-ScreenControlService/bin/ScreenControlService.exe" /project/windows/output/ 2>/dev/null || true
    echo -e "${GREEN}Output copied to /project/windows/output/${NC}"
    ls -lh /project/windows/output/ 2>/dev/null || true
fi

