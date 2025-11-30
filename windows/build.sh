#!/bin/bash
# Build script for Windows MCP-Eyes using Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building Windows MCP-Eyes with Docker${NC}"

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
    docker build -t mcp-eyes-windows-builder "$SCRIPT_DIR"
    
    # Run Docker container
    docker run --rm -v "$PROJECT_ROOT:/project" -w /project/windows \
        mcp-eyes-windows-builder /bin/bash -c "chmod +x build.sh && ./build.sh"
    exit $?
fi

# Inside Docker - actual build process
BUILD_DIR="${BUILD_DIR:-/build}"
BUILD_TYPE="${BUILD_TYPE:-Release}"

echo -e "${GREEN}Setting up build environment${NC}"

# Create build directory
mkdir -p "$BUILD_DIR/build"
cd "$BUILD_DIR/build"

# Configure CMake for cross-compilation
echo -e "${GREEN}Configuring CMake for Windows cross-compilation${NC}"
cmake .. \
    -DCMAKE_SYSTEM_NAME=Windows \
    -DCMAKE_C_COMPILER=x86_64-w64-mingw32-gcc \
    -DCMAKE_CXX_COMPILER=x86_64-w64-mingw32-g++ \
    -DCMAKE_RC_COMPILER=x86_64-w64-mingw32-windres \
    -DCMAKE_FIND_ROOT_PATH=/usr/x86_64-w64-mingw32 \
    -DCMAKE_FIND_ROOT_PATH_MODE_PROGRAM=NEVER \
    -DCMAKE_FIND_ROOT_PATH_MODE_LIBRARY=ONLY \
    -DCMAKE_FIND_ROOT_PATH_MODE_INCLUDE=ONLY \
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE"

# Build
echo -e "${GREEN}Building project${NC}"
cmake --build . --config "$BUILD_TYPE" -j$(nproc)

# Check if build succeeded
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Build successful!${NC}"
    echo -e "${GREEN}Output: $BUILD_DIR/build/bin/MCPEyes.exe${NC}"
    ls -lh "$BUILD_DIR/build/bin/" 2>/dev/null || ls -lh "$BUILD_DIR/bin/" 2>/dev/null || true
else
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

