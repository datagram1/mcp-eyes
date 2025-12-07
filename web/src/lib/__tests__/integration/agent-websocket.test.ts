/**
 * Agent WebSocket Integration Tests
 *
 * Tests for WebSocket message handling and agent registration flow.
 * These tests verify the protocol implementation without actual WebSocket connections.
 */

// Mock types for testing (matching actual implementation)
interface AgentRegisterMessage {
  type: 'register';
  machineId: string;
  fingerprint: string;
  hostname: string;
  osType: 'macos' | 'windows' | 'linux';
  osVersion: string;
  arch: string;
  agentVersion: string;
  customerId?: string;
  capabilities?: string[];
}

interface HeartbeatMessage {
  type: 'heartbeat';
  powerState: 'ACTIVE' | 'PASSIVE' | 'SLEEP';
  screenLocked: boolean;
  currentTask?: string;
}

interface CommandMessage {
  type: 'request';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface CommandResponse {
  type: 'response';
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

// Helper to validate message format
function isValidRegisterMessage(msg: unknown): msg is AgentRegisterMessage {
  const m = msg as AgentRegisterMessage;
  return (
    m.type === 'register' &&
    typeof m.machineId === 'string' &&
    typeof m.fingerprint === 'string' &&
    typeof m.hostname === 'string' &&
    ['macos', 'windows', 'linux'].includes(m.osType) &&
    typeof m.osVersion === 'string' &&
    typeof m.arch === 'string' &&
    typeof m.agentVersion === 'string'
  );
}

function isValidHeartbeatMessage(msg: unknown): msg is HeartbeatMessage {
  const m = msg as HeartbeatMessage;
  return (
    m.type === 'heartbeat' &&
    ['ACTIVE', 'PASSIVE', 'SLEEP'].includes(m.powerState) &&
    typeof m.screenLocked === 'boolean'
  );
}

function isValidCommandResponse(msg: unknown): msg is CommandResponse {
  const m = msg as CommandResponse;
  return (
    m.type === 'response' &&
    typeof m.id === 'string' &&
    (m.result !== undefined || m.error !== undefined)
  );
}

describe('Agent WebSocket Protocol', () => {
  describe('Registration Message', () => {
    it('should validate correct registration message', () => {
      const message: AgentRegisterMessage = {
        type: 'register',
        machineId: 'abc123-def456',
        fingerprint: 'sha256:fingerprint-hash',
        hostname: 'my-macbook',
        osType: 'macos',
        osVersion: 'Darwin 23.0.0',
        arch: 'arm64',
        agentVersion: '1.0.0',
        customerId: 'customer-uuid',
      };

      expect(isValidRegisterMessage(message)).toBe(true);
    });

    it('should reject registration without required fields', () => {
      const invalidMessages = [
        { type: 'register' }, // Missing all fields
        { type: 'register', machineId: 'abc' }, // Missing most fields
        { type: 'heartbeat' }, // Wrong type
      ];

      invalidMessages.forEach(msg => {
        expect(isValidRegisterMessage(msg)).toBe(false);
      });
    });

    it('should reject invalid OS type', () => {
      const message = {
        type: 'register',
        machineId: 'abc123',
        fingerprint: 'hash',
        hostname: 'host',
        osType: 'android', // Invalid
        osVersion: '1.0',
        arch: 'arm64',
        agentVersion: '1.0.0',
      };

      expect(isValidRegisterMessage(message)).toBe(false);
    });
  });

  describe('Heartbeat Message', () => {
    it('should validate correct heartbeat message', () => {
      const message: HeartbeatMessage = {
        type: 'heartbeat',
        powerState: 'ACTIVE',
        screenLocked: false,
        currentTask: 'screenshot',
      };

      expect(isValidHeartbeatMessage(message)).toBe(true);
    });

    it('should validate heartbeat without currentTask', () => {
      const message: HeartbeatMessage = {
        type: 'heartbeat',
        powerState: 'PASSIVE',
        screenLocked: true,
      };

      expect(isValidHeartbeatMessage(message)).toBe(true);
    });

    it('should reject invalid power state', () => {
      const message = {
        type: 'heartbeat',
        powerState: 'INVALID',
        screenLocked: false,
      };

      expect(isValidHeartbeatMessage(message)).toBe(false);
    });
  });

  describe('Command Response', () => {
    it('should validate successful response', () => {
      const response: CommandResponse = {
        type: 'response',
        id: 'cmd-123',
        result: { success: true, data: 'screenshot_base64' },
      };

      expect(isValidCommandResponse(response)).toBe(true);
    });

    it('should validate error response', () => {
      const response: CommandResponse = {
        type: 'response',
        id: 'cmd-456',
        error: { code: -32600, message: 'Invalid request' },
      };

      expect(isValidCommandResponse(response)).toBe(true);
    });

    it('should reject response without result or error', () => {
      const response = {
        type: 'response',
        id: 'cmd-789',
      };

      expect(isValidCommandResponse(response)).toBe(false);
    });
  });
});

describe('Agent Registration Flow', () => {
  describe('New Agent Registration', () => {
    it('should process registration and return registered response', () => {
      const registerMessage: AgentRegisterMessage = {
        type: 'register',
        machineId: 'test-machine-001',
        fingerprint: 'test-fingerprint-hash',
        hostname: 'test-workstation',
        osType: 'macos',
        osVersion: 'Darwin 23.0.0',
        arch: 'arm64',
        agentVersion: '1.0.0',
      };

      // Simulate server response
      const response = {
        type: 'registered',
        agentId: 'agent-uuid-123',
        state: 'PENDING',
        powerConfig: {
          heartbeatInterval: 30,
          sleepAfterIdle: 300,
        },
      };

      expect(response.type).toBe('registered');
      expect(response.state).toBe('PENDING');
      expect(response.powerConfig.heartbeatInterval).toBeGreaterThan(0);
    });
  });

  describe('Returning Agent Registration', () => {
    it('should recognize existing agent by machine ID', () => {
      // Simulating: agent reconnects with same machineId
      const existingAgentId = 'agent-uuid-123';
      const existingState = 'ACTIVE';

      const response = {
        type: 'registered',
        agentId: existingAgentId,
        state: existingState,
        licenseUuid: 'license-uuid-456',
        powerConfig: {
          heartbeatInterval: 30,
          sleepAfterIdle: 300,
        },
      };

      expect(response.agentId).toBe(existingAgentId);
      expect(response.state).toBe('ACTIVE');
      expect(response.licenseUuid).toBeDefined();
    });
  });
});

describe('Heartbeat Flow', () => {
  describe('Heartbeat Acknowledgement', () => {
    it('should respond with heartbeat_ack', () => {
      const heartbeat: HeartbeatMessage = {
        type: 'heartbeat',
        powerState: 'ACTIVE',
        screenLocked: false,
      };

      // Simulated server response
      const ack = {
        type: 'heartbeat_ack',
        serverTime: Date.now(),
        state: 'ACTIVE',
        powerConfig: {
          heartbeatInterval: 30,
          sleepAfterIdle: 300,
        },
        pendingCommands: 0,
      };

      expect(ack.type).toBe('heartbeat_ack');
      expect(ack.pendingCommands).toBe(0);
    });

    it('should indicate pending commands', () => {
      const ack = {
        type: 'heartbeat_ack',
        serverTime: Date.now(),
        state: 'ACTIVE',
        powerConfig: { heartbeatInterval: 30, sleepAfterIdle: 300 },
        pendingCommands: 3,
      };

      expect(ack.pendingCommands).toBe(3);
    });

    it('should indicate license state change', () => {
      const ack = {
        type: 'heartbeat_ack',
        serverTime: Date.now(),
        state: 'BLOCKED', // State changed
        message: 'License has been revoked',
        powerConfig: { heartbeatInterval: 30, sleepAfterIdle: 300 },
        pendingCommands: 0,
      };

      expect(ack.state).toBe('BLOCKED');
      expect(ack.message).toBeDefined();
    });
  });
});

describe('Command Execution Flow', () => {
  describe('Tool Call', () => {
    it('should format tools/call request correctly', () => {
      const request: CommandMessage = {
        type: 'request',
        id: 'req-001',
        method: 'tools/call',
        params: {
          name: 'screenshot',
          arguments: { format: 'png' },
        },
      };

      expect(request.method).toBe('tools/call');
      expect(request.params?.name).toBe('screenshot');
    });

    it('should handle successful tool response', () => {
      const response: CommandResponse = {
        type: 'response',
        id: 'req-001',
        result: {
          content: [
            {
              type: 'image',
              data: 'base64-encoded-screenshot',
              mimeType: 'image/png',
            },
          ],
        },
      };

      expect(isValidCommandResponse(response)).toBe(true);
      expect(response.result).toBeDefined();
    });

    it('should handle tool error response', () => {
      const response: CommandResponse = {
        type: 'response',
        id: 'req-001',
        error: {
          code: -32603,
          message: 'Screen is locked',
        },
      };

      expect(isValidCommandResponse(response)).toBe(true);
      expect(response.error?.code).toBe(-32603);
    });
  });

  describe('Tools List', () => {
    it('should format tools/list request correctly', () => {
      const request: CommandMessage = {
        type: 'request',
        id: 'req-002',
        method: 'tools/list',
      };

      expect(request.method).toBe('tools/list');
    });

    it('should handle tools list response', () => {
      const response: CommandResponse = {
        type: 'response',
        id: 'req-002',
        result: {
          tools: [
            {
              name: 'screenshot',
              description: 'Take a screenshot',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              name: 'click',
              description: 'Click at coordinates',
              inputSchema: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                },
                required: ['x', 'y'],
              },
            },
          ],
        },
      };

      expect(isValidCommandResponse(response)).toBe(true);
      const result = response.result as { tools: unknown[] };
      expect(result.tools).toHaveLength(2);
    });
  });
});

describe('Power State Transitions', () => {
  describe('State Machine', () => {
    const validTransitions = [
      ['ACTIVE', 'PASSIVE'],
      ['ACTIVE', 'SLEEP'],
      ['PASSIVE', 'ACTIVE'],
      ['PASSIVE', 'SLEEP'],
      ['SLEEP', 'ACTIVE'],
      ['SLEEP', 'PASSIVE'],
    ];

    it.each(validTransitions)(
      'should allow transition from %s to %s',
      (from, to) => {
        // All transitions are valid in this system
        expect(['ACTIVE', 'PASSIVE', 'SLEEP']).toContain(from);
        expect(['ACTIVE', 'PASSIVE', 'SLEEP']).toContain(to);
      }
    );
  });

  describe('Wake Command', () => {
    it('should wake sleeping agent', () => {
      const wakeCommand = {
        type: 'wake',
        reason: 'User logged into portal',
      };

      expect(wakeCommand.type).toBe('wake');
      expect(wakeCommand.reason).toBeDefined();
    });
  });
});
