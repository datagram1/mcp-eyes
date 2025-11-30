#!/bin/bash
# Remote Docker build script for Windows MCP-Eyes
# Usage: ./docker-build.sh [remote_host]

set -e

REMOTE_HOST="${1:-richardbrown@192.168.10.31}"
REMOTE_DIR="~/mcp-eyes-build"

echo "Building Windows MCP-Eyes on remote Docker server: $REMOTE_HOST"

# Get the project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "Project root: $PROJECT_ROOT"

# Create a temporary directory for the build context
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "Creating build context in: $TEMP_DIR"

# Copy necessary files to temp directory
mkdir -p "$TEMP_DIR/windows"
cp -r "$PROJECT_ROOT/windows"/* "$TEMP_DIR/windows/"
cp -r "$PROJECT_ROOT/native" "$TEMP_DIR/"

# Create a minimal CMakeLists.txt in project root if needed
if [ ! -f "$TEMP_DIR/CMakeLists.txt" ]; then
    cat > "$TEMP_DIR/CMakeLists.txt" << 'EOF'
cmake_minimum_required(VERSION 3.20)
project(MCPEyes)
add_subdirectory(windows)
EOF
fi

# Copy to remote server
echo "Copying files to remote server..."
ssh "$REMOTE_HOST" "mkdir -p $REMOTE_DIR"
rsync -avz --delete "$TEMP_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

# Build on remote server
echo "Building on remote server..."
ssh "$REMOTE_HOST" << 'ENDSSH'
set -e
cd ~/mcp-eyes-build
cd windows
chmod +x build.sh
./build.sh
ENDSSH

# Copy built executable back
echo "Copying built executable back..."
mkdir -p "$PROJECT_ROOT/windows/build/bin"
scp "$REMOTE_HOST:$REMOTE_DIR/windows/build/bin/MCPEyes.exe" "$PROJECT_ROOT/windows/build/bin/" 2>/dev/null || \
scp "$REMOTE_HOST:$REMOTE_DIR/windows/build/MCPEyes.exe" "$PROJECT_ROOT/windows/build/bin/" 2>/dev/null || \
echo "Note: Executable location may vary, check remote server"

echo "Build complete! Check $PROJECT_ROOT/windows/build/bin/"

