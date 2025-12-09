#!/bin/bash

# Test script for Browser Extension WebSocket Connection
# This script monitors the Browser Bridge Server for extension connections

echo "========================================="
echo "Browser Extension Connection Test"
echo "========================================="
echo ""

# Check if server is running
if ! lsof -i :3457 > /dev/null 2>&1; then
    echo "❌ ERROR: Browser Bridge Server is not running on port 3457"
    echo "Start it with: node dist/browser-bridge-server.js"
    exit 1
fi

echo "✅ Browser Bridge Server is running on port 3457"
echo ""

# Check connected browsers
echo "📋 Checking connected browsers..."
RESPONSE=$(curl -s http://localhost:3457/browsers)
echo "Response: $RESPONSE"
echo ""

# Parse the response
BROWSER_COUNT=$(echo "$RESPONSE" | grep -o '"browsers":\[' | wc -l)
if [ "$BROWSER_COUNT" -gt 0 ]; then
    echo "✅ Browser extension(s) connected!"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    echo "⚠️  No browsers connected yet"
    echo ""
    echo "📝 To load the Firefox extension:"
    echo "1. Open Firefox"
    echo "2. Type 'about:debugging#/runtime/this-firefox' in the address bar"
    echo "3. Click 'Load Temporary Add-on...'"
    echo "4. Navigate to: $(pwd)/extension/firefox/"
    echo "5. Select 'manifest.json'"
    echo ""
    echo "After loading, check the Browser Console (Ctrl+Shift+J) for connection messages"
fi

echo ""
echo "========================================="
echo "Monitoring server logs (Ctrl+C to stop)"
echo "========================================="
