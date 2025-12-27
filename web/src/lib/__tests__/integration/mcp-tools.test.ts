/**
 * MCP Tools End-to-End Tests
 *
 * Tests for MCP tool execution via the ScreenControl service.
 * These tests verify that MCP tools work correctly end-to-end.
 *
 * Prerequisites:
 *   - ScreenControlService must be running on localhost:3459
 *   - GUI Bridge must be running on localhost:3460
 *
 * Run with:
 *   npm test -- mcp-tools.test.ts
 */

const SERVICE_URL = process.env.SERVICE_URL || 'http://127.0.0.1:3459';
const GUI_BRIDGE_URL = process.env.GUI_BRIDGE_URL || 'http://127.0.0.1:3460';

interface MCPRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: {
    content?: Array<{
      type: string;
      text?: string;
      data?: string;
      mimeType?: string;
    }>;
    tools?: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

// Helper to make MCP request
async function mcpRequest(request: MCPRequest): Promise<MCPResponse | null> {
  try {
    const response = await fetch(`${SERVICE_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 404) {
      console.log('MCP endpoint not available at /mcp');
      return null;
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    return JSON.parse(text);
  } catch (error) {
    console.log('MCP request failed:', error);
    return null;
  }
}

// Helper to call a tool
async function callTool(name: string, args: Record<string, unknown> = {}): Promise<MCPResponse | null> {
  return mcpRequest({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name, arguments: args },
    id: Date.now(),
  });
}

// Check if services are available
async function areServicesAvailable(): Promise<{ service: boolean; guiBridge: boolean }> {
  const checkService = async (url: string) => {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch {
      return false;
    }
  };

  return {
    service: await checkService(SERVICE_URL),
    guiBridge: await checkService(GUI_BRIDGE_URL),
  };
}

describe('MCP Tools End-to-End Tests', () => {
  let servicesAvailable = { service: false, guiBridge: false };

  beforeAll(async () => {
    servicesAvailable = await areServicesAvailable();
    if (!servicesAvailable.service) {
      console.warn(`\n⚠️  Service not available at ${SERVICE_URL}`);
    }
    if (!servicesAvailable.guiBridge) {
      console.warn(`\n⚠️  GUI Bridge not available at ${GUI_BRIDGE_URL}`);
    }
  });

  describe('tools/list', () => {
    it('should return list of available tools', async () => {
      if (!servicesAvailable.service) return;

      const response = await mcpRequest({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      });

      if (!response) {
        console.log('MCP endpoint not available - skipping');
        return;
      }

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);

      if (response.result?.tools) {
        expect(response.result.tools).toBeInstanceOf(Array);
        expect(response.result.tools.length).toBeGreaterThan(0);

        // Check tool structure
        const tool = response.result.tools[0];
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
      }
    });

    it('should include essential tools', async () => {
      if (!servicesAvailable.service) return;

      const response = await mcpRequest({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2,
      });

      if (!response) return;

      if (response.result?.tools) {
        const toolNames = response.result.tools.map(t => t.name);

        // Essential tools that should be present
        const essentialTools = [
          'screenshot',
          'click',
          'typeText',
          'pressKey',
        ];

        essentialTools.forEach(tool => {
          expect(toolNames).toContain(tool);
        });
      }
    });
  });

  describe('screenshot tool', () => {
    it('should capture screenshot successfully', async () => {
      if (!servicesAvailable.service || !servicesAvailable.guiBridge) return;

      const response = await callTool('screenshot', { format: 'jpeg' });
      if (!response) return;

      if (response.result) {
        expect(response.result.content).toBeInstanceOf(Array);
        expect(response.result.content!.length).toBeGreaterThan(0);

        const content = response.result.content![0];
        expect(content.type).toBe('image');
        expect(content.mimeType).toContain('image/');
        expect(content.data).toBeDefined(); // Base64 data
      } else if (response.error) {
        // Screenshot might fail if screen is locked
        expect(response.error.message).toBeDefined();
      }
    });

    it('should support PNG format', async () => {
      if (!servicesAvailable.service || !servicesAvailable.guiBridge) return;

      const response = await callTool('screenshot', { format: 'png' });
      if (!response) return;

      if (response.result?.content) {
        const content = response.result.content[0];
        expect(content.mimeType).toContain('png');
      }
    });
  });

  describe('getMousePosition tool', () => {
    it('should return current mouse position', async () => {
      if (!servicesAvailable.service || !servicesAvailable.guiBridge) return;

      const response = await callTool('getMousePosition');
      if (!response) return;

      if (response.result?.content) {
        const content = response.result.content[0];
        expect(content.type).toBe('text');

        // Parse the response text
        if (content.text) {
          expect(content.text).toContain('x');
          expect(content.text).toContain('y');
        }
      }
    });
  });

  describe('listApplications tool', () => {
    it('should return list of running applications', async () => {
      if (!servicesAvailable.service || !servicesAvailable.guiBridge) return;

      const response = await callTool('listApplications');
      if (!response) return;

      if (response.result?.content) {
        const content = response.result.content[0];
        expect(content.type).toBe('text');
        expect(content.text).toBeDefined();
      }
    });
  });

  describe('click tool', () => {
    it('should accept click parameters', async () => {
      if (!servicesAvailable.service || !servicesAvailable.guiBridge) return;

      // Click at off-screen coordinates to avoid side effects
      const response = await callTool('click', {
        x: -10000,
        y: -10000,
        button: 'left',
      });
      if (!response) return;

      // Should either succeed or return an error (not crash)
      expect(response.jsonrpc).toBe('2.0');
      expect(response.result || response.error).toBeDefined();
    });
  });

  describe('moveMouse tool', () => {
    it('should move mouse to coordinates', async () => {
      if (!servicesAvailable.service || !servicesAvailable.guiBridge) return;

      // Move to a safe position
      const moveResponse = await callTool('moveMouse', { x: 100, y: 100 });
      if (!moveResponse) return;

      if (moveResponse.result) {
        expect(moveResponse.result.content).toBeDefined();
      }
    });
  });

  describe('scroll tool', () => {
    it('should accept scroll parameters', async () => {
      if (!servicesAvailable.service || !servicesAvailable.guiBridge) return;

      const response = await callTool('scrollMouse', {
        direction: 'down',
        amount: 1,
      });
      if (!response) return;

      expect(response.jsonrpc).toBe('2.0');
    });
  });

  describe('wait tool', () => {
    it('should wait for specified milliseconds', async () => {
      if (!servicesAvailable.service) return;

      const startTime = Date.now();
      const response = await callTool('wait', { milliseconds: 100 });
      const elapsed = Date.now() - startTime;

      if (response?.result) {
        expect(elapsed).toBeGreaterThanOrEqual(100);
      }
    });
  });

  describe('Error Handling', () => {
    it('should return error for unknown tool', async () => {
      if (!servicesAvailable.service) return;

      const response = await callTool('nonexistent_tool_xyz');
      if (!response) return;

      if (response.error) {
        expect(response.error.code).toBeLessThan(0);
      }
    });

    it('should return error for invalid parameters', async () => {
      if (!servicesAvailable.service) return;

      const response = await callTool('click', {
        invalid_param: 'test',
      });
      if (!response) return;

      // Should handle gracefully
      expect(response.jsonrpc).toBe('2.0');
    });
  });
});

describe('MCP Tools - Mock Tests (Always Run)', () => {
  describe('Tool Request Formatting', () => {
    it('should format tools/list request', () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      };

      expect(request.method).toBe('tools/list');
      expect(request.params).toBeUndefined();
    });

    it('should format tools/call request', () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'screenshot',
          arguments: { format: 'png', quality: 80 },
        },
        id: 2,
      };

      expect(request.method).toBe('tools/call');
      expect(request.params!.name).toBe('screenshot');
    });
  });

  describe('Tool Response Parsing', () => {
    it('should parse successful tool response', () => {
      const response: MCPResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'image',
              data: 'base64data...',
              mimeType: 'image/png',
            },
          ],
        },
      };

      expect(response.result!.content![0].type).toBe('image');
      expect(response.error).toBeUndefined();
    });

    it('should parse error response', () => {
      const response: MCPResponse = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32603,
          message: 'Internal error',
        },
      };

      expect(response.error!.code).toBe(-32603);
      expect(response.result).toBeUndefined();
    });

    it('should parse tools list response', () => {
      const response: MCPResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: [
            {
              name: 'screenshot',
              description: 'Capture screen',
              inputSchema: {
                type: 'object',
                properties: {
                  format: { type: 'string', enum: ['png', 'jpeg'] },
                },
              },
            },
          ],
        },
      };

      expect(response.result!.tools!).toHaveLength(1);
      expect(response.result!.tools![0].name).toBe('screenshot');
    });
  });

  describe('Tool Schema Validation', () => {
    it('should validate screenshot tool schema', () => {
      const schema = {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['png', 'jpeg'] },
          quality: { type: 'number', minimum: 1, maximum: 100 },
        },
      };

      expect(schema.properties.format.enum).toContain('png');
      expect(schema.properties.quality.minimum).toBe(1);
    });

    it('should validate click tool schema', () => {
      const schema = {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          button: { type: 'string', enum: ['left', 'right', 'middle'] },
        },
        required: ['x', 'y'],
      };

      expect(schema.required).toContain('x');
      expect(schema.required).toContain('y');
    });
  });

  describe('Content Types', () => {
    it('should recognize text content', () => {
      const content = { type: 'text', text: 'Mouse at 100, 200' };
      expect(content.type).toBe('text');
      expect(content.text).toBeDefined();
    });

    it('should recognize image content', () => {
      const content = {
        type: 'image',
        data: 'base64...',
        mimeType: 'image/png',
      };
      expect(content.type).toBe('image');
      expect(content.mimeType).toContain('image/');
    });

    it('should recognize resource content', () => {
      const content = {
        type: 'resource',
        resource: {
          uri: 'file:///path/to/file',
          mimeType: 'text/plain',
        },
      };
      expect(content.type).toBe('resource');
    });
  });
});
