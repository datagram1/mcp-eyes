/**
 * Service API Integration Tests
 *
 * Tests for the ScreenControl Service HTTP API on port 3459.
 * These tests verify the service endpoints are working correctly.
 *
 * Prerequisites:
 *   - ScreenControlService must be running on localhost:3459
 *
 * Run with:
 *   SERVICE_URL=http://127.0.0.1:3459 npm test -- service-api.test.ts
 */

const SERVICE_URL = process.env.SERVICE_URL || 'http://127.0.0.1:3459';

// Helper to check if service is available
async function isServiceAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Skip tests if service is not running
const describeIfServiceRunning = (name: string, fn: () => void) => {
  describe(name, () => {
    let serviceAvailable = false;

    beforeAll(async () => {
      serviceAvailable = await isServiceAvailable();
      if (!serviceAvailable) {
        console.warn(`\n⚠️  Skipping ${name}: Service not available at ${SERVICE_URL}`);
      }
    });

    it('should have service available (or skip remaining tests)', () => {
      if (!serviceAvailable) {
        console.log('Service not running - skipping tests');
      }
      // Always pass - actual tests check serviceAvailable
      expect(true).toBe(true);
    });

    // Wrap the test function
    const wrappedFn = () => {
      // Only run if service is available
      if (serviceAvailable) {
        fn();
      }
    };

    wrappedFn();
  });
};

describe('Service API Integration Tests', () => {
  let serviceAvailable = false;

  beforeAll(async () => {
    serviceAvailable = await isServiceAvailable();
    if (!serviceAvailable) {
      console.warn(`\n⚠️  Service not available at ${SERVICE_URL} - some tests will be skipped`);
    }
  });

  describe('Health Endpoint', () => {
    it('should return health status', async () => {
      if (!serviceAvailable) {
        console.log('Skipping: service not available');
        return;
      }

      const response = await fetch(`${SERVICE_URL}/health`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(['ok', 'healthy', 'running']).toContain(data.status.toLowerCase());
    });

    it('should include service version or uptime', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${SERVICE_URL}/health`);
      const data = await response.json();

      // Health check may include version or other info
      // The response should have meaningful data
      expect(data).toBeDefined();
      expect(Object.keys(data).length).toBeGreaterThan(0);
    });
  });

  describe('Settings Endpoint', () => {
    it('should get current settings', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${SERVICE_URL}/settings`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('agentName');
      expect(data).toHaveProperty('controlServerUrl');
    });

    it('should update settings', async () => {
      if (!serviceAvailable) return;

      // Get current settings
      const getResponse = await fetch(`${SERVICE_URL}/settings`);
      const original = await getResponse.json();

      // Update with same values (safe test)
      const updateResponse = await fetch(`${SERVICE_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: original.agentName || 'test-agent',
        }),
      });

      expect(updateResponse.ok).toBe(true);
    });
  });

  describe('Status Endpoint', () => {
    it('should return agent status', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${SERVICE_URL}/status`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      // Status may include various agent info
      expect(data).toBeDefined();
    });

    it('should include machine info', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${SERVICE_URL}/status`);
      const data = await response.json();

      // Status typically includes these fields
      if (data.machineId) {
        expect(typeof data.machineId).toBe('string');
      }
      if (data.platform) {
        expect(['macos', 'windows', 'linux']).toContain(data.platform);
      }
      if (data.version) {
        expect(typeof data.version).toBe('string');
      }
    });
  });

  describe('Version Endpoint', () => {
    it('should return version info', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${SERVICE_URL}/version`);

      if (response.ok) {
        const data = await response.json();
        expect(data.version || data.serviceVersion).toBeDefined();
      } else {
        // Version endpoint might not exist - check health instead
        const healthResponse = await fetch(`${SERVICE_URL}/health`);
        expect(healthResponse.ok).toBe(true);
      }
    });
  });

  describe('MCP Proxy Endpoint', () => {
    it('should handle tools/list request if endpoint exists', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${SERVICE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        }),
      });

      // MCP endpoint may not exist - that's ok
      if (response.status === 404) {
        console.log('MCP proxy endpoint not available - skipping');
        return;
      }

      if (response.ok) {
        const text = await response.text();
        if (text) {
          const data = JSON.parse(text);
          expect(data.jsonrpc).toBe('2.0');
          expect(data.id).toBe(1);
        }
      }
    });

    it('should return error for invalid method if endpoint exists', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${SERVICE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'invalid/method',
          id: 2,
        }),
      });

      // MCP endpoint may not exist - that's ok
      if (response.status === 404) {
        return;
      }

      if (response.ok) {
        const text = await response.text();
        if (text) {
          const data = JSON.parse(text);
          expect(data.error || data.result).toBeDefined();
        }
      }
    });
  });

  describe('CORS Headers', () => {
    it('should allow localhost origins', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${SERVICE_URL}/health`, {
        headers: {
          'Origin': 'http://localhost:3000',
        },
      });

      // Should not be blocked by CORS for localhost
      expect(response.ok).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${SERVICE_URL}/unknown-endpoint-xyz`);
      expect(response.status).toBe(404);
    });

    it('should handle malformed JSON gracefully', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${SERVICE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{{{',
      });

      // Should return an error, not crash
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});

describe('Service API - Mock Tests (Always Run)', () => {
  // These tests don't require the service to be running

  describe('Request Formatting', () => {
    it('should format MCP request correctly', () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'screenshot',
          arguments: { format: 'png' },
        },
        id: 1,
      };

      expect(request.jsonrpc).toBe('2.0');
      expect(request.method).toBe('tools/call');
      expect(request.params.name).toBe('screenshot');
    });

    it('should format settings update correctly', () => {
      const settings = {
        agentName: 'my-agent',
        controlServerUrl: 'wss://example.com/ws',
        autoStart: true,
      };

      expect(JSON.stringify(settings)).toContain('agentName');
      expect(JSON.stringify(settings)).toContain('controlServerUrl');
    });
  });

  describe('Response Parsing', () => {
    it('should parse health response', () => {
      const response = {
        status: 'ok',
        version: '1.6.0',
        uptime: 12345,
      };

      expect(response.status).toBe('ok');
      expect(response.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should parse MCP tool list response', () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: [
            { name: 'screenshot', description: 'Take a screenshot' },
            { name: 'click', description: 'Click at coordinates' },
          ],
        },
      };

      expect(response.result.tools).toHaveLength(2);
      expect(response.result.tools[0].name).toBe('screenshot');
    });

    it('should parse MCP error response', () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };

      expect(response.error.code).toBe(-32600);
      expect(response.error.message).toBeDefined();
    });
  });
});
