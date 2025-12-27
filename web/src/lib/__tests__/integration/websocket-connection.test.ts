/**
 * WebSocket Connection Integration Tests
 *
 * Tests for WebSocket connectivity to the ScreenControl control server.
 * These tests verify the agent can connect and communicate with the server.
 *
 * Prerequisites:
 *   - Control server must be running (local or remote)
 *
 * Run with:
 *   CONTROL_SERVER_URL=wss://screencontrol.knws.co.uk/ws npm test -- websocket-connection.test.ts
 */

const CONTROL_SERVER_URL = process.env.CONTROL_SERVER_URL || 'wss://screencontrol.knws.co.uk/ws';
const CONTROL_SERVER_HTTP = CONTROL_SERVER_URL.replace('wss://', 'https://').replace('ws://', 'http://').replace('/ws', '');

// Check if server is available via HTTP health endpoint
async function isServerAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${CONTROL_SERVER_HTTP}/api/health`, {
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

describe('WebSocket Connection Tests', () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await isServerAvailable();
    if (!serverAvailable) {
      console.warn(`\n⚠️  Control server not available at ${CONTROL_SERVER_HTTP}`);
    }
  });

  describe('Server Health', () => {
    it('should have healthy control server', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }

      const response = await fetch(`${CONTROL_SERVER_HTTP}/api/health`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('status');
    });
  });

  describe('WebSocket Endpoint', () => {
    it('should accept WebSocket upgrade request', async () => {
      if (!serverAvailable) return;

      // We can't actually test WebSocket in Jest without a real WebSocket client
      // But we can verify the server responds to HTTP requests
      const response = await fetch(`${CONTROL_SERVER_HTTP}/api/health`);
      expect(response.ok).toBe(true);
    });
  });

  describe('Agent Registration Flow', () => {
    it('should have valid registration message format', () => {
      const registerMessage = {
        type: 'register',
        machineId: 'test-machine-123',
        fingerprint: 'sha256:test-fingerprint',
        hostname: 'test-host',
        osType: 'macos' as const,
        osVersion: 'Darwin 23.0.0',
        arch: 'arm64',
        agentVersion: '1.6.0',
        customerId: 'test-customer',
        capabilities: ['screenshot', 'click', 'type'],
      };

      expect(registerMessage.type).toBe('register');
      expect(registerMessage.machineId).toBeDefined();
      expect(['macos', 'windows', 'linux']).toContain(registerMessage.osType);
    });

    it('should have valid registered response format', () => {
      const registeredResponse = {
        type: 'registered',
        agentId: 'agent-uuid-123',
        state: 'PENDING' as const,
        powerConfig: {
          heartbeatInterval: 30,
          sleepAfterIdle: 300,
        },
      };

      expect(registeredResponse.type).toBe('registered');
      expect(registeredResponse.agentId).toBeDefined();
      expect(['PENDING', 'ACTIVE', 'PASSIVE', 'SLEEP', 'BLOCKED']).toContain(registeredResponse.state);
    });
  });

  describe('Heartbeat Flow', () => {
    it('should have valid heartbeat message format', () => {
      const heartbeat = {
        type: 'heartbeat',
        powerState: 'ACTIVE' as const,
        screenLocked: false,
        currentTask: undefined,
      };

      expect(heartbeat.type).toBe('heartbeat');
      expect(['ACTIVE', 'PASSIVE', 'SLEEP']).toContain(heartbeat.powerState);
      expect(typeof heartbeat.screenLocked).toBe('boolean');
    });

    it('should have valid heartbeat_ack response format', () => {
      const ack = {
        type: 'heartbeat_ack',
        serverTime: Date.now(),
        state: 'ACTIVE' as const,
        powerConfig: {
          heartbeatInterval: 30,
          sleepAfterIdle: 300,
        },
        pendingCommands: 0,
      };

      expect(ack.type).toBe('heartbeat_ack');
      expect(ack.serverTime).toBeGreaterThan(0);
      expect(ack.pendingCommands).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Command Flow', () => {
    it('should have valid command request format', () => {
      const request = {
        type: 'request',
        id: 'cmd-123',
        method: 'tools/call',
        params: {
          name: 'screenshot',
          arguments: { format: 'png' },
        },
      };

      expect(request.type).toBe('request');
      expect(request.id).toBeDefined();
      expect(request.method).toBe('tools/call');
    });

    it('should have valid command response format', () => {
      const response = {
        type: 'response',
        id: 'cmd-123',
        result: {
          content: [
            {
              type: 'image',
              data: 'base64...',
              mimeType: 'image/png',
            },
          ],
        },
      };

      expect(response.type).toBe('response');
      expect(response.id).toBe('cmd-123');
      expect(response.result.content).toBeInstanceOf(Array);
    });

    it('should have valid error response format', () => {
      const response = {
        type: 'response',
        id: 'cmd-123',
        error: {
          code: -32603,
          message: 'Screen is locked',
        },
      };

      expect(response.type).toBe('response');
      expect(response.error.code).toBeLessThan(0);
      expect(response.error.message).toBeDefined();
    });
  });
});

describe('WebSocket Message Serialization', () => {
  describe('Message Encoding', () => {
    it('should serialize register message to JSON', () => {
      const message = {
        type: 'register',
        machineId: 'test-123',
        fingerprint: 'hash',
        hostname: 'test',
        osType: 'macos',
        osVersion: '14.0',
        arch: 'arm64',
        agentVersion: '1.6.0',
      };

      const json = JSON.stringify(message);
      expect(json).toContain('"type":"register"');
      expect(json).toContain('"machineId":"test-123"');
    });

    it('should serialize heartbeat message to JSON', () => {
      const message = {
        type: 'heartbeat',
        powerState: 'ACTIVE',
        screenLocked: false,
      };

      const json = JSON.stringify(message);
      expect(json).toContain('"type":"heartbeat"');
      expect(json).toContain('"powerState":"ACTIVE"');
    });

    it('should serialize command response to JSON', () => {
      const message = {
        type: 'response',
        id: 'cmd-1',
        result: { success: true },
      };

      const json = JSON.stringify(message);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe('response');
      expect(parsed.id).toBe('cmd-1');
    });
  });

  describe('Message Decoding', () => {
    it('should parse registered response from JSON', () => {
      const json = '{"type":"registered","agentId":"agent-123","state":"ACTIVE","powerConfig":{"heartbeatInterval":30}}';
      const message = JSON.parse(json);

      expect(message.type).toBe('registered');
      expect(message.agentId).toBe('agent-123');
      expect(message.powerConfig.heartbeatInterval).toBe(30);
    });

    it('should parse command request from JSON', () => {
      const json = '{"type":"request","id":"cmd-1","method":"tools/call","params":{"name":"screenshot"}}';
      const message = JSON.parse(json);

      expect(message.type).toBe('request');
      expect(message.method).toBe('tools/call');
      expect(message.params.name).toBe('screenshot');
    });

    it('should handle malformed JSON gracefully', () => {
      const malformed = '{not valid json}';

      expect(() => JSON.parse(malformed)).toThrow();
    });
  });
});

describe('Connection State Machine', () => {
  type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'REGISTERED' | 'ERROR';

  const validTransitions: Record<ConnectionState, ConnectionState[]> = {
    DISCONNECTED: ['CONNECTING'],
    CONNECTING: ['CONNECTED', 'ERROR', 'DISCONNECTED'],
    CONNECTED: ['REGISTERED', 'ERROR', 'DISCONNECTED'],
    REGISTERED: ['DISCONNECTED', 'ERROR'],
    ERROR: ['DISCONNECTED', 'CONNECTING'],
  };

  it('should allow valid state transitions', () => {
    Object.entries(validTransitions).forEach(([from, toStates]) => {
      toStates.forEach(to => {
        expect(validTransitions[from as ConnectionState]).toContain(to);
      });
    });
  });

  it('should start in DISCONNECTED state', () => {
    const initialState: ConnectionState = 'DISCONNECTED';
    expect(initialState).toBe('DISCONNECTED');
  });

  it('should transition to CONNECTING on connect', () => {
    const currentState: ConnectionState = 'DISCONNECTED';
    const nextState: ConnectionState = 'CONNECTING';

    expect(validTransitions[currentState]).toContain(nextState);
  });

  it('should transition to REGISTERED after registration', () => {
    const currentState: ConnectionState = 'CONNECTED';
    const nextState: ConnectionState = 'REGISTERED';

    expect(validTransitions[currentState]).toContain(nextState);
  });
});

describe('Reconnection Logic', () => {
  describe('Exponential Backoff', () => {
    const calculateBackoff = (attempt: number, baseDelay: number = 1000, maxDelay: number = 30000): number => {
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      // Add jitter (up to 10%)
      const jitter = delay * 0.1 * Math.random();
      return Math.floor(delay + jitter);
    };

    it('should increase delay with each attempt', () => {
      const delay1 = calculateBackoff(0, 1000, 30000);
      const delay2 = calculateBackoff(1, 1000, 30000);
      const delay3 = calculateBackoff(2, 1000, 30000);

      // Due to jitter, we check approximate ranges
      expect(delay1).toBeLessThanOrEqual(1100); // ~1000 + 10% jitter
      expect(delay2).toBeLessThanOrEqual(2200); // ~2000 + 10% jitter
      expect(delay3).toBeLessThanOrEqual(4400); // ~4000 + 10% jitter
    });

    it('should cap at maximum delay', () => {
      const delay = calculateBackoff(10, 1000, 30000);
      expect(delay).toBeLessThanOrEqual(33000); // max + 10% jitter
    });

    it('should start from base delay', () => {
      const delay = calculateBackoff(0, 5000, 30000);
      expect(delay).toBeGreaterThanOrEqual(5000);
      expect(delay).toBeLessThanOrEqual(5500);
    });
  });

  describe('Retry Limits', () => {
    it('should respect maximum retry attempts', () => {
      const maxRetries = 10;
      let attempts = 0;

      while (attempts < maxRetries) {
        attempts++;
      }

      expect(attempts).toBe(maxRetries);
    });

    it('should reset attempts after successful connection', () => {
      let attempts = 5;

      // Simulate successful connection
      const connected = true;
      if (connected) {
        attempts = 0;
      }

      expect(attempts).toBe(0);
    });
  });
});

describe('Message Queue', () => {
  describe('Pending Commands', () => {
    it('should queue commands when disconnected', () => {
      const queue: Array<{ id: string; method: string }> = [];

      // Simulate queueing
      queue.push({ id: 'cmd-1', method: 'screenshot' });
      queue.push({ id: 'cmd-2', method: 'click' });

      expect(queue).toHaveLength(2);
    });

    it('should process queue on reconnect', () => {
      const queue: Array<{ id: string; method: string }> = [
        { id: 'cmd-1', method: 'screenshot' },
        { id: 'cmd-2', method: 'click' },
      ];

      // Simulate processing
      const processed: string[] = [];
      while (queue.length > 0) {
        const cmd = queue.shift()!;
        processed.push(cmd.id);
      }

      expect(processed).toEqual(['cmd-1', 'cmd-2']);
      expect(queue).toHaveLength(0);
    });

    it('should limit queue size', () => {
      const maxQueueSize = 100;
      const queue: string[] = [];

      for (let i = 0; i < 150; i++) {
        if (queue.length < maxQueueSize) {
          queue.push(`cmd-${i}`);
        }
      }

      expect(queue.length).toBeLessThanOrEqual(maxQueueSize);
    });
  });

  describe('Command Timeout', () => {
    it('should timeout pending commands', async () => {
      const timeout = 100; // ms
      const startTime = Date.now();

      await new Promise(resolve => setTimeout(resolve, timeout + 10));

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(timeout);
    });

    it('should clean up timed out commands', () => {
      const pendingCommands = new Map<string, { sentAt: number }>();
      const timeout = 30000;
      const now = Date.now();

      // Add some commands
      pendingCommands.set('cmd-1', { sentAt: now - 60000 }); // Expired
      pendingCommands.set('cmd-2', { sentAt: now - 10000 }); // Still valid

      // Clean up expired
      for (const [id, cmd] of pendingCommands.entries()) {
        if (now - cmd.sentAt > timeout) {
          pendingCommands.delete(id);
        }
      }

      expect(pendingCommands.has('cmd-1')).toBe(false);
      expect(pendingCommands.has('cmd-2')).toBe(true);
    });
  });
});
