# Agent Test Server (Debug Builds Only)

The Agent Test Server enables fully automated testing of ScreenControl agents. It provides a local HTTP API that allows external test harnesses to control the agent UI, trigger connections, inspect state, and verify behavior - eliminating the need for manual testing.

## Overview

**Security**: The test server ONLY binds to `127.0.0.1` (localhost) and is ONLY compiled in DEBUG builds. It is completely absent from release/production builds.

**Port**: Default `3456`, fallback `3457` if busy

**Protocol**: JSON-RPC style over HTTP

## Platform Support

| Platform | Status | Implementation |
|----------|--------|----------------|
| macOS    | ✅ Complete | `TestServer.m` (Objective-C) |
| Windows  | 🔜 Planned  | Will be in C++ service |
| Linux    | 🔜 Planned  | Will be in C++ service |

## Quick Start

### 1. Build Debug Version

```bash
# macOS
xcodebuild -project ScreenControl.xcodeproj -scheme ScreenControl -configuration Debug build

# Launch
open /path/to/Build/Products/Debug/ScreenControl.app
```

### 2. Verify Test Server is Running

```bash
curl http://localhost:3456/ping
```

Response:
```json
{
  "pong": true,
  "version": "1.0.0",
  "debug": true,
  "port": 3456
}
```

## API Reference

All endpoints accept POST requests with JSON body (except `/ping` which also accepts GET).

### Health Check

**GET/POST** `/ping`

```bash
curl http://localhost:3456/ping
```

Response:
```json
{
  "pong": true,
  "version": "1.0.0",
  "debug": true,
  "port": 3456
}
```

### Get Connection State

**POST** with `{"method": "getState"}`

```bash
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"method": "getState"}'
```

Response:
```json
{
  "connected": false,
  "serverUrl": "ws://localhost:3000/ws",
  "endpointUuid": "cmivv9aar000310vcfp9lg0qj",
  "customerId": "cmivqj7nk000054pkib1rkjdb",
  "connectionStatus": "Status: Disconnected"
}
```

### Get All Field Values

**POST** with `{"method": "getFields"}`

```bash
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"method": "getFields"}'
```

Response:
```json
{
  "serverUrl": "ws://localhost:3000/ws",
  "endpointUuid": "cmivv9aar000310vcfp9lg0qj",
  "customerId": "cmivqj7nk000054pkib1rkjdb",
  "connectOnStartup": false
}
```

### Set Field Value

**POST** with `{"method": "setField", "params": {"field": "...", "value": "..."}}`

Available fields:
- `serverUrl` - WebSocket server URL
- `endpointUuid` - MCP connection endpoint UUID
- `customerId` - Customer/user ID
- `connectOnStartup` - Boolean (as string "true"/"false")

```bash
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"method": "setField", "params": {"field": "serverUrl", "value": "ws://localhost:3000/ws"}}'
```

Response:
```json
{
  "success": true,
  "field": "serverUrl",
  "value": "ws://localhost:3000/ws"
}
```

### Click Button

**POST** with `{"method": "clickButton", "params": {"button": "..."}}`

Available buttons:
- `connect` - Connect to control server
- `disconnect` - Disconnect from control server
- `saveSettings` - Save debug settings

```bash
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"method": "clickButton", "params": {"button": "connect"}}'
```

Response:
```json
{
  "success": true,
  "action": "connect"
}
```

### Get Logs

**POST** with `{"method": "getLogs", "params": {"limit": N}}`

```bash
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"method": "getLogs", "params": {"limit": 20}}'
```

Response:
```json
{
  "logs": [
    "[14:32:01] Connecting to ws://localhost:3000/ws...",
    "[14:32:02] → REGISTER: Richards-MacBook-Pro",
    "[14:32:02] ← REGISTERED: License active"
  ],
  "total": 45,
  "returned": 20
}
```

### Restart Agent

**POST** with `{"method": "restart"}`

```bash
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"method": "restart"}'
```

Response:
```json
{
  "success": true,
  "action": "restart"
}
```

The agent will quit and relaunch automatically.

### Quit Agent

**POST** with `{"method": "quit"}`

```bash
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"method": "quit"}'
```

Response:
```json
{
  "success": true,
  "action": "quit"
}
```

## Example Test Script

Here's a complete test script that verifies agent connectivity:

```bash
#!/bin/bash
# test-agent-connection.sh

SERVER_URL="ws://localhost:3000/ws"
ENDPOINT_UUID="cmivv9aar000310vcfp9lg0qj"
CUSTOMER_ID="cmivqj7nk000054pkib1rkjdb"
TEST_SERVER="http://localhost:3456"

echo "=== Agent Connection Test ==="

# 1. Verify test server is running
echo "1. Checking test server..."
PING=$(curl -s $TEST_SERVER/ping)
if [[ $(echo $PING | jq -r '.pong') != "true" ]]; then
    echo "   FAIL: Test server not running"
    exit 1
fi
echo "   OK: Test server running ($(echo $PING | jq -r '.version'))"

# 2. Configure connection settings
echo "2. Configuring connection..."
curl -s -X POST $TEST_SERVER \
    -H "Content-Type: application/json" \
    -d "{\"method\": \"setField\", \"params\": {\"field\": \"serverUrl\", \"value\": \"$SERVER_URL\"}}" > /dev/null

curl -s -X POST $TEST_SERVER \
    -H "Content-Type: application/json" \
    -d "{\"method\": \"setField\", \"params\": {\"field\": \"endpointUuid\", \"value\": \"$ENDPOINT_UUID\"}}" > /dev/null

curl -s -X POST $TEST_SERVER \
    -H "Content-Type: application/json" \
    -d "{\"method\": \"setField\", \"params\": {\"field\": \"customerId\", \"value\": \"$CUSTOMER_ID\"}}" > /dev/null
echo "   OK: Settings configured"

# 3. Initiate connection
echo "3. Connecting..."
curl -s -X POST $TEST_SERVER \
    -H "Content-Type: application/json" \
    -d '{"method": "clickButton", "params": {"button": "connect"}}' > /dev/null

# 4. Wait for connection
sleep 3

# 5. Check connection state
echo "4. Verifying connection..."
STATE=$(curl -s -X POST $TEST_SERVER \
    -H "Content-Type: application/json" \
    -d '{"method": "getState"}')

CONNECTED=$(echo $STATE | jq -r '.connected')
if [[ "$CONNECTED" == "true" ]]; then
    echo "   OK: Connected successfully"
else
    echo "   FAIL: Not connected"
    echo "   Status: $(echo $STATE | jq -r '.connectionStatus')"

    # Get logs for debugging
    echo "   Logs:"
    curl -s -X POST $TEST_SERVER \
        -H "Content-Type: application/json" \
        -d '{"method": "getLogs", "params": {"limit": 10}}' | jq -r '.logs[]' | sed 's/^/   /'
    exit 1
fi

# 6. Disconnect
echo "5. Disconnecting..."
curl -s -X POST $TEST_SERVER \
    -H "Content-Type: application/json" \
    -d '{"method": "clickButton", "params": {"button": "disconnect"}}' > /dev/null

sleep 1

# 7. Verify disconnection
STATE=$(curl -s -X POST $TEST_SERVER \
    -H "Content-Type: application/json" \
    -d '{"method": "getState"}')

CONNECTED=$(echo $STATE | jq -r '.connected')
if [[ "$CONNECTED" == "false" ]]; then
    echo "   OK: Disconnected successfully"
else
    echo "   WARN: Still connected after disconnect"
fi

echo ""
echo "=== TEST PASSED ==="
```

## Node.js Test Example

```javascript
// test-agent.js
const http = require('http');

const TEST_SERVER = 'http://localhost:3456';

async function callTestServer(method, params = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ method, params });
        const url = new URL(TEST_SERVER);

        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function runTest() {
    console.log('Testing agent connection...\n');

    // Ping
    const ping = await callTestServer('ping');
    console.log('Ping:', ping.pong ? 'OK' : 'FAIL');

    // Configure
    await callTestServer('setField', { field: 'serverUrl', value: 'ws://localhost:3000/ws' });
    console.log('Configured server URL');

    // Connect
    await callTestServer('clickButton', { button: 'connect' });
    console.log('Connection initiated');

    // Wait
    await new Promise(r => setTimeout(r, 3000));

    // Check state
    const state = await callTestServer('getState');
    console.log('Connected:', state.connected);
    console.log('Status:', state.connectionStatus);

    if (!state.connected) {
        const logs = await callTestServer('getLogs', { limit: 10 });
        console.log('\nRecent logs:');
        logs.logs.forEach(log => console.log(' ', log));
    }

    // Cleanup
    await callTestServer('clickButton', { button: 'disconnect' });
    console.log('\nDisconnected');
}

runTest().catch(console.error);
```

## CI/CD Integration

The test server enables automated testing in CI pipelines:

```yaml
# .github/workflows/test-agent.yml
name: Test Agent

on: [push, pull_request]

jobs:
  test-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Debug Agent
        run: |
          cd macos
          xcodebuild -project ScreenControl.xcodeproj \
            -scheme ScreenControl \
            -configuration Debug \
            build

      - name: Start Agent
        run: |
          open macos/Build/Products/Debug/ScreenControl.app
          sleep 5  # Wait for startup

      - name: Run Tests
        run: |
          ./scripts/test-agent-connection.sh

      - name: Stop Agent
        if: always()
        run: |
          curl -X POST http://localhost:3456 \
            -H "Content-Type: application/json" \
            -d '{"method": "quit"}' || true
```

## Security Considerations

1. **Localhost Only**: The test server binds exclusively to `127.0.0.1`, preventing remote access
2. **Debug Only**: Code is wrapped in `#ifdef DEBUG` / `#endif`, completely absent from release builds
3. **No Authentication**: Since it's localhost-only in debug builds, no auth is required
4. **No Secrets Exposed**: The API doesn't expose API keys or credentials

## Troubleshooting

### Test server not responding

1. Ensure you're running a DEBUG build
2. Check if port 3456 is in use: `lsof -i :3456`
3. Look for TestServer logs in Console.app (search for `[TestServer]`)

### Connection test fails

1. Ensure the control server is running (`npm run dev` in web/)
2. Verify the endpoint UUID exists in the database
3. Check the agent logs via `getLogs` method

### Button click has no effect

Some buttons may be disabled. The API will return an error:
```json
{
  "error": "Unknown or disabled button: connect"
}
```

Check button state by inspecting the connection status via `getState`.

## Future Enhancements

- **Windows/Linux**: Same API, different implementation (C++)
- **MCP Tool Testing**: Methods to invoke and verify MCP tools
- **Screenshot Capture**: Get agent screenshots for visual verification
- **Network Simulation**: Test offline/reconnection scenarios
- **Performance Metrics**: Latency and throughput measurements
