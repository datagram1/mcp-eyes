#!/bin/bash

# Build script for MCP macOS GUI Control Server

echo "Building MCP macOS GUI Control Server..."

# Clean previous build
rm -rf dist/

# Compile TypeScript
echo "Compiling TypeScript..."
npx tsc

# Make the binary executable
chmod +x dist/index.js

echo "Build complete! The server is ready to use."
echo ""
echo "To test the server:"
echo "  npm test"
echo ""
echo "To run the server:"
echo "  npm start"
echo ""
echo "To install globally:"
echo "  npm install -g ."
echo ""
echo "To use with npx:"
echo "  npx mcp-macos-gui-control mcp"
