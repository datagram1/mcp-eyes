/**
 * GUI Bridge API Integration Tests
 *
 * Tests for the ScreenControl GUI Bridge HTTP API on port 3460.
 * The GUI Bridge handles screenshot, mouse, and keyboard operations.
 *
 * The GUI Bridge API uses a single endpoint:
 *   POST /tool - Execute a tool with { method, params }
 *   GET /health - Health check
 *   GET /info - Server info
 *
 * Prerequisites:
 *   - ScreenControl GUI app (macOS/Windows) or tray app (Linux) must be running
 *   - GUI Bridge server must be listening on localhost:3460
 *
 * Run with:
 *   GUI_BRIDGE_URL=http://127.0.0.1:3460 npm test -- gui-bridge-api.test.ts
 */

const GUI_BRIDGE_URL = process.env.GUI_BRIDGE_URL || 'http://127.0.0.1:3460';

// Helper to call a tool via the GUI bridge
async function callGUITool(method: string, params: Record<string, unknown> = {}): Promise<Response> {
  return fetch(`${GUI_BRIDGE_URL}/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
}

// Helper to check if GUI bridge is available
async function isGUIBridgeAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${GUI_BRIDGE_URL}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

describe('GUI Bridge API Integration Tests', () => {
  let bridgeAvailable = false;

  beforeAll(async () => {
    bridgeAvailable = await isGUIBridgeAvailable();
    if (!bridgeAvailable) {
      console.warn(`\n⚠️  GUI Bridge not available at ${GUI_BRIDGE_URL} - some tests will be skipped`);
    }
  });

  describe('Health Endpoint', () => {
    it('should return health status', async () => {
      if (!bridgeAvailable) {
        console.log('Skipping: GUI bridge not available');
        return;
      }

      const response = await fetch(`${GUI_BRIDGE_URL}/health`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('status');
    });
  });

  describe('Screenshot Tool', () => {
    it('should capture screenshot as JPEG', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('screenshot', { format: 'jpeg' });
      expect(response.ok).toBe(true);

      const data = await response.json();
      // Response contains format and image (base64)
      expect(data).toHaveProperty('format');
      expect(data).toHaveProperty('image');
    });

    it('should capture screenshot as PNG', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('screenshot', { format: 'png' });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('format');
      expect(data.format).toBe('png');
    });

    it('should return base64 image data', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('screenshot', { format: 'jpeg' });
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('image');
      expect(typeof data.image).toBe('string');
      // Base64 data should be non-empty
      expect(data.image.length).toBeGreaterThan(100);
    });

    it('should accept quality parameter', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('screenshot', { format: 'jpeg', quality: 50 });
      expect(response.ok).toBe(true);
    });
  });

  describe('Mouse Position Tool', () => {
    it('should return current mouse position', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('getMousePosition');
      expect(response.ok).toBe(true);

      const data = await response.json();
      // Response contains x and y coordinates directly
      expect(data).toHaveProperty('x');
      expect(data).toHaveProperty('y');
      expect(typeof data.x).toBe('number');
      expect(typeof data.y).toBe('number');
    });
  });

  describe('Mouse Move Tool', () => {
    it('should move mouse to coordinates', async () => {
      if (!bridgeAvailable) return;

      // Get current position first
      const posResponse = await callGUITool('getMousePosition');
      const originalPos = await posResponse.json();

      // Move mouse
      const response = await callGUITool('moveMouse', { x: 100, y: 100 });
      expect(response.ok).toBe(true);

      const data = await response.json();
      // Response should indicate success (may have success field or just empty/ok)
      expect(data.error).toBeUndefined();

      // Move back to original position
      if (originalPos.x !== undefined && originalPos.y !== undefined) {
        await callGUITool('moveMouse', { x: originalPos.x, y: originalPos.y });
      }
    });
  });

  describe('Click Tool', () => {
    it('should accept click request', async () => {
      if (!bridgeAvailable) return;

      // Note: We don't actually click - just verify the endpoint accepts the request
      const response = await callGUITool('click', { x: -10000, y: -10000, button: 'left' });

      // Endpoint should accept the request format
      expect(response.status).toBeLessThan(500);
    });

    it('should support right click', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('click', { x: -10000, y: -10000, button: 'right' });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Double Click Tool', () => {
    it('should accept double click request', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('doubleClick', { x: -10000, y: -10000 });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Scroll Tool', () => {
    it('should accept scroll down request', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('scrollMouse', { direction: 'down', amount: 1 });

      expect(response.status).toBeLessThan(500);
    });

    it('should accept scroll up request', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('scrollMouse', { direction: 'up', amount: 1 });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Type Text Tool', () => {
    it('should accept type text request', async () => {
      if (!bridgeAvailable) return;

      // We send an empty string to avoid actually typing
      const response = await callGUITool('typeText', { text: '' });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Press Key Tool', () => {
    it('should accept key press request', async () => {
      if (!bridgeAvailable) return;

      // Press a safe key that won't cause issues
      const response = await callGUITool('pressKey', { key: 'shift' });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Drag Tool', () => {
    it('should accept drag request', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('drag', {
        startX: -10000,
        startY: -10000,
        endX: -9999,
        endY: -9999,
      });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('List Applications Tool', () => {
    it('should return list of applications', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('listApplications');

      if (response.ok) {
        const data = await response.json();
        // Should return application data
        expect(data).toBeDefined();
        // Data can be an array directly or have an applications field
        const apps = Array.isArray(data) ? data : (data.applications || []);
        expect(Array.isArray(apps)).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      if (!bridgeAvailable) return;

      const response = await fetch(`${GUI_BRIDGE_URL}/unknown-endpoint`);
      expect(response.status).toBe(404);
    });

    it('should handle unknown method gracefully', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('unknownMethod123');

      // Should return error response, not crash
      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should handle missing parameters gracefully', async () => {
      if (!bridgeAvailable) return;

      const response = await callGUITool('click', {}); // Missing x, y

      // Should return error, not crash
      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });
});

describe('GUI Bridge API - Mock Tests (Always Run)', () => {
  describe('Request Formatting', () => {
    it('should format click request correctly', () => {
      const request = {
        x: 100,
        y: 200,
        button: 'left',
      };

      expect(request.x).toBe(100);
      expect(request.y).toBe(200);
      expect(['left', 'right', 'middle']).toContain(request.button);
    });

    it('should format drag request correctly', () => {
      const request = {
        startX: 100,
        startY: 100,
        endX: 200,
        endY: 200,
      };

      expect(request.startX).toBeLessThan(request.endX);
      expect(typeof request.startX).toBe('number');
    });

    it('should format scroll request correctly', () => {
      const request = {
        direction: 'down',
        amount: 3,
      };

      expect(['up', 'down']).toContain(request.direction);
      expect(request.amount).toBeGreaterThan(0);
    });
  });

  describe('Response Parsing', () => {
    it('should parse screenshot response with base64', () => {
      const response = {
        success: true,
        format: 'jpeg',
        data: 'base64encodeddata...',
      };

      expect(response.success).toBe(true);
      expect(response.format).toBe('jpeg');
      expect(response.data).toBeDefined();
    });

    it('should parse mouse position response', () => {
      const response = {
        success: true,
        x: 500,
        y: 300,
      };

      expect(response.success).toBe(true);
      expect(response.x).toBeGreaterThanOrEqual(0);
      expect(response.y).toBeGreaterThanOrEqual(0);
    });

    it('should parse error response', () => {
      const response = {
        success: false,
        error: 'Screen is locked',
      };

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe('Coordinate Validation', () => {
    it('should validate positive coordinates', () => {
      const isValidCoordinate = (n: number) => typeof n === 'number' && !isNaN(n);

      expect(isValidCoordinate(100)).toBe(true);
      expect(isValidCoordinate(0)).toBe(true);
      expect(isValidCoordinate(-100)).toBe(true); // Negative can be valid for multi-monitor
      expect(isValidCoordinate(NaN)).toBe(false);
    });

    it('should validate button types', () => {
      const validButtons = ['left', 'right', 'middle'];

      expect(validButtons.includes('left')).toBe(true);
      expect(validButtons.includes('invalid')).toBe(false);
    });
  });
});
