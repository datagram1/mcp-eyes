#!/bin/bash

# Test script for sending browser commands via HTTP endpoint
# Usage: ./test-browser-command.sh [action] [url]

ACTION=${1:-navigate}
URL=${2:-https://www.anthropic.com}

echo "========================================="
echo "Browser Command Test"
echo "========================================="
echo "Action: $ACTION"
echo "URL: $URL"
echo ""

# Check if server is running
if ! lsof -i :3457 > /dev/null 2>&1; then
    echo "❌ ERROR: Browser Bridge Server is not running on port 3457"
    exit 1
fi

echo "✅ Browser Bridge Server is running"
echo ""

# Check if any browser is connected
BROWSERS=$(curl -s http://localhost:3457/browsers)
BROWSER_COUNT=$(echo "$BROWSERS" | grep -o '"browsers":\[[^]]*\]' | grep -o '"' | wc -l)

if [ "$BROWSER_COUNT" -lt 2 ]; then
    echo "❌ ERROR: No browser extension connected"
    echo "Please load the extension in Firefox first"
    echo "Run: ./test/test-extension-connection.sh for instructions"
    exit 1
fi

echo "✅ Browser extension connected"
echo "Connected browsers: $BROWSERS"
echo ""

# Send command
echo "📤 Sending command to browser..."
PAYLOAD=$(cat <<EOF
{
  "action": "$ACTION",
  "payload": {"url": "$URL"},
  "browser": "firefox"
}
EOF
)

echo "Payload:"
echo "$PAYLOAD" | jq '.'
echo ""

RESPONSE=$(curl -s -X POST http://localhost:3457/command \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "📥 Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Check if successful
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ Command executed successfully!"
else
    echo "❌ Command failed!"
    echo "Check the browser console for errors"
fi
