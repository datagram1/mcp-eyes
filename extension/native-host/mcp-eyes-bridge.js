#!/opt/homebrew/bin/node

/**
 * ScreenControl Native Messaging Host
 *
 * This script acts as a bridge between the browser extension and the ScreenControl native app.
 * It receives JSON messages from the extension via stdin and sends responses via stdout.
 *
 * Communicates with MCPEyes.app via HTTP on localhost:3456
 *
 * Native Messaging Protocol:
 * - Each message is prefixed with a 4-byte length (little-endian uint32)
 * - Messages are JSON-encoded
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Configuration
const TOKEN_FILE = path.join(process.env.HOME || '/tmp', '.screencontrol-token');
const LOG_FILE = process.env.MCP_EYES_LOG || '/tmp/screencontrol-bridge.log';
const DEBUG = true;

function log(...args) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
    fs.appendFileSync(LOG_FILE, message);
  }
}

// Load token configuration
function loadTokenConfig() {
  try {
    const content = fs.readFileSync(TOKEN_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    log('Failed to load token file:', err.message);
    return null;
  }
}

/**
 * Read a native messaging message from stdin
 */
function readMessage() {
  return new Promise((resolve, reject) => {
    const lengthBuffer = Buffer.alloc(4);
    let bytesRead = 0;

    const readLength = () => {
      let chunk = process.stdin.read(4 - bytesRead);
      if (chunk === null) {
        process.stdin.once('readable', readLength);
        return;
      }

      if (typeof chunk === 'string') {
        chunk = Buffer.from(chunk, 'binary');
      }

      chunk.copy(lengthBuffer, bytesRead);
      bytesRead += chunk.length;

      if (bytesRead < 4) {
        process.stdin.once('readable', readLength);
        return;
      }

      const messageLength = lengthBuffer.readUInt32LE(0);
      log('Reading message of length:', messageLength);

      if (messageLength > 1024 * 1024) {
        reject(new Error('Message too large'));
        return;
      }

      const messageBuffer = Buffer.alloc(messageLength);
      let messageBytesRead = 0;

      const readContent = () => {
        let messageChunk = process.stdin.read(messageLength - messageBytesRead);
        if (messageChunk === null) {
          process.stdin.once('readable', readContent);
          return;
        }

        if (typeof messageChunk === 'string') {
          messageChunk = Buffer.from(messageChunk, 'binary');
        }

        messageChunk.copy(messageBuffer, messageBytesRead);
        messageBytesRead += messageChunk.length;

        if (messageBytesRead < messageLength) {
          process.stdin.once('readable', readContent);
          return;
        }

        try {
          const message = JSON.parse(messageBuffer.toString('utf8'));
          log('Received message:', message);
          resolve(message);
        } catch (error) {
          reject(new Error('Invalid JSON: ' + error.message));
        }
      };

      readContent();
    };

    process.stdin.once('readable', readLength);
  });
}

/**
 * Write a native messaging message to stdout
 */
function writeMessage(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.from(json, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(buffer.length, 0);

  log('Sending message:', message);

  process.stdout.write(lengthBuffer);
  process.stdout.write(buffer);
}

/**
 * Make HTTP request to ScreenControl native app
 */
function httpRequest(config, method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: config.host || '127.0.0.1',
      port: config.port || 3456,
      path: endpoint,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 401) {
            reject(new Error('Unauthorized'));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Connection failed: ${e.message}`));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * ScreenControl HTTP Connection
 */
class McpEyesConnection {
  constructor() {
    this.config = null;
    this.connected = false;
  }

  async connect() {
    this.config = loadTokenConfig();
    if (!this.config) {
      log('No token config found');
      return false;
    }

    // Test connection with health check
    try {
      const result = await httpRequest(this.config, 'GET', '/health', null);
      log('Connected to ScreenControl:', result);
      this.connected = true;
      return true;
    } catch (err) {
      log('Failed to connect:', err.message);
      return false;
    }
  }

  async send(message) {
    if (!this.connected || !this.config) {
      return { error: 'Not connected to ScreenControl' };
    }

    const { action, payload, requestId } = message;

    try {
      let result;

      switch (action) {
        case 'ping':
          result = { status: 'ok', timestamp: Date.now() };
          break;

        case 'getInteractiveElements':
        case 'getClickableElements':
          result = await httpRequest(this.config, 'GET', '/getClickableElements', null);
          break;

        case 'screenshot':
          result = await httpRequest(this.config, 'GET', '/screenshot', null);
          break;

        case 'click':
          result = await httpRequest(this.config, 'POST', '/click', payload);
          break;

        case 'typeText':
          result = await httpRequest(this.config, 'POST', '/typeText', payload);
          break;

        case 'pressKey':
          result = await httpRequest(this.config, 'POST', '/pressKey', payload);
          break;

        case 'listApplications':
          result = await httpRequest(this.config, 'GET', '/listApplications', null);
          break;

        case 'focusApplication':
          result = await httpRequest(this.config, 'POST', '/focusApplication', payload);
          break;

        case 'permissions':
        case 'checkPermissions':
          result = await httpRequest(this.config, 'GET', '/permissions', null);
          break;

        // Browser-specific actions - these are handled by content script, not ScreenControl
        case 'getPageInfo':
        case 'getPageContext':
        case 'clickElement':
        case 'fillElement':
        case 'scrollTo':
        case 'executeScript':
        case 'getElementAtPoint':
        case 'getFormData':
        case 'setWatchMode':
        case 'getWatchState':
        case 'getTabs':
        case 'focusTab':
        case 'getActiveTab':
          // These need to be forwarded back to browser - return as-is for content script handling
          return { requestId, response: { needsBrowserHandling: true, action, payload } };

        default:
          result = { error: `Unknown action: ${action}` };
      }

      return { requestId, response: result };
    } catch (err) {
      log('Error sending to ScreenControl:', err.message);
      return { requestId, error: err.message };
    }
  }

  forwardEvent(event) {
    // Events from browser - log but don't forward (native app doesn't need these)
    log('Browser event received:', event.event || event.action);
  }
}

/**
 * Main entry point
 */
async function main() {
  log('ScreenControl Native Host starting...');

  process.stdin.setEncoding(null);

  const connection = new McpEyesConnection();
  const connected = await connection.connect();

  log('Running in', connected ? 'HTTP' : 'disconnected', 'mode');

  // Handle exit signals
  process.on('SIGTERM', () => {
    log('Received SIGTERM, exiting');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('Received SIGINT, exiting');
    process.exit(0);
  });

  process.stdin.on('end', () => {
    log('stdin ended (browser disconnected)');
    process.exit(0);
  });

  process.stdin.on('close', () => {
    log('stdin closed');
    process.exit(0);
  });

  // Main message loop
  while (true) {
    try {
      log('Waiting for next message...');
      const message = await readMessage();

      let response;

      if (message.response !== undefined) {
        // This is a response being echoed back, ignore
        log('Ignoring echoed response');
        continue;
      }

      if (message.event) {
        // Browser event, just log it
        connection.forwardEvent(message);
        continue;
      }

      if (message.action) {
        response = await connection.send(message);
      } else {
        response = { error: 'No action specified' };
      }

      if (response) {
        writeMessage(response);
        log('Response sent');
      }
    } catch (error) {
      log('Error processing message:', error.message);

      if (error.message.includes('closed') || error.message.includes('end')) {
        log('Input stream closed, exiting');
        break;
      }

      writeMessage({ error: error.message });
    }
  }

  log('ScreenControl Native Host exiting');
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log('Uncaught exception:', error.message);
  writeMessage({ error: 'Internal error: ' + error.message });
});

process.on('unhandledRejection', (error) => {
  log('Unhandled rejection:', error);
});

main().catch((error) => {
  log('Fatal error:', error.message);
  process.exit(1);
});
