# TestServer API Reference

TestServer is a debug-only HTTP API for automated testing and remote control of the ScreenControl agent. It runs on port **3458** and is only available in DEBUG builds.

## Connection

- **URL:** `http://<agent-ip>:3458/`
- **Method:** POST (JSON-RPC style) or GET for health check
- **Content-Type:** `application/json`

## Methods

### ping

Health check endpoint. Also available as `GET /ping`.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"ping"}' \
  http://localhost:3458/
```

**Response:**
```json
{
  "pong": true,
  "version": "1.0.0",
  "debug": true,
  "port": 3458
}
```

---

### getState

Get the current connection state of the agent.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"getState"}' \
  http://localhost:3458/
```

**Response:**
```json
{
  "connected": true,
  "serverUrl": "wss://screencontrol.example.com/ws",
  "endpointUuid": "abc123",
  "customerId": "customer456",
  "connectionStatus": "Connected",
  "autoReconnectEnabled": true,
  "reconnectAttempt": 0,
  "reconnectPending": false
}
```

---

### getFields

Get all UI field values from the settings window.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"getFields"}' \
  http://localhost:3458/
```

**Response:**
```json
{
  "serverUrl": "wss://screencontrol.example.com/ws",
  "endpointUuid": "abc123",
  "customerId": "customer456",
  "connectOnStartup": true,
  "mcpUrl": "https://screencontrol.example.com/mcp/abc123",
  "oauthStatus": "Authenticated",
  "controlServerUrl": "https://control.example.com",
  "controlServerStatus": "Connected"
}
```

---

### setField

Set a field value in the settings UI.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"setField","params":{"field":"serverUrl","value":"wss://new-server.com/ws"}}' \
  http://localhost:3458/
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `field` | string | Field name to set |
| `value` | string | Value to set |

**Available Fields:**
| Field | Description |
|-------|-------------|
| `serverUrl` | WebSocket server URL |
| `endpointUuid` | Endpoint UUID |
| `customerId` | Customer ID |
| `connectOnStartup` | Auto-connect on startup ("true" or "false") |
| `mcpUrl` | MCP URL for OAuth discovery |
| `controlServerUrl` | Control server address (General tab) |

**Response:**
```json
{
  "success": true,
  "field": "serverUrl",
  "value": "wss://new-server.com/ws"
}
```

---

### clickButton

Simulate clicking a button in the UI.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"clickButton","params":{"button":"connect"}}' \
  http://localhost:3458/
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `button` | string | Button identifier |

**Available Buttons:**
| Button | Description |
|--------|-------------|
| `connect` | Connect to WebSocket server |
| `disconnect` | Disconnect from server |
| `reconnect` | Force reconnection |
| `saveSettings` | Save debug settings |
| `discoverAndJoin` | Trigger OAuth discovery and join |
| `controlServerConnect` | Connect to control server (General tab) |

**Response:**
```json
{
  "success": true,
  "action": "connect"
}
```

---

### getLogs

Get recent log entries from the debug log view.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"getLogs","params":{"limit":20}}' \
  http://localhost:3458/
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Maximum number of log lines to return |

**Response:**
```json
{
  "logs": [
    "[00:47:45] <- REQUEST: tools/list",
    "[00:47:45] <- REQUEST: resources/list",
    "[00:47:48] <- PING (server keepalive)"
  ],
  "total": 150,
  "returned": 3
}
```

---

### getVersion

Get detailed version and build information.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"getVersion"}' \
  http://localhost:3458/
```

**Response:**
```json
{
  "version": "1.0.0",
  "build": "42",
  "buildDate": "2024-12-08",
  "gitCommit": "abc1234",
  "platform": "macos",
  "arch": "arm64",
  "uptime": 3600
}
```

---

### quit

Terminate the application.

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"quit"}' \
  http://localhost:3458/
```

**Response:**
```json
{
  "success": true,
  "action": "quit"
}
```

---

### restart

Restart the application (launches new instance, then terminates current).

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"restart"}' \
  http://localhost:3458/
```

**Response:**
```json
{
  "success": true,
  "action": "restart"
}
```

---

## Example Workflows

### Connect to a Server

```bash
# Set connection parameters
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"setField","params":{"field":"serverUrl","value":"wss://screencontrol.example.com/ws"}}' \
  http://localhost:3458/

curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"setField","params":{"field":"endpointUuid","value":"my-endpoint-uuid"}}' \
  http://localhost:3458/

curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"setField","params":{"field":"customerId","value":"my-customer-id"}}' \
  http://localhost:3458/

# Click connect
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"clickButton","params":{"button":"connect"}}' \
  http://localhost:3458/

# Check connection state
sleep 2
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"getState"}' \
  http://localhost:3458/
```

### Monitor Connection

```bash
# Watch logs continuously
while true; do
  curl -s -X POST -H "Content-Type: application/json" \
    -d '{"method":"getLogs","params":{"limit":5}}' \
    http://localhost:3458/ | python3 -m json.tool
  sleep 5
done
```

### Remote Access

For remote access (from another machine on the network), use the agent's IP address:

```bash
# Get agent IP on the Mac
ifconfig en0 | grep 'inet '

# Access from remote machine
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"method":"ping"}' \
  http://192.168.1.100:3458/
```

## Error Responses

All errors return a JSON object with an `error` field:

```json
{
  "error": "Unknown method: invalidMethod"
}
```

```json
{
  "error": "Missing field or value"
}
```

```json
{
  "error": "Unknown or disabled button: invalidButton"
}
```
