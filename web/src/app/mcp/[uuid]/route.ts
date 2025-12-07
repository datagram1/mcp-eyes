/**
 * MCP Tenant Endpoint
 *
 * POST/GET /mcp/{uuid}
 *
 * Per-tenant MCP endpoint that:
 * - Validates OAuth Bearer tokens
 * - Verifies token audience matches this endpoint
 * - Handles MCP JSON-RPC requests (POST)
 * - Handles SSE streams (GET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashToken, isTokenExpired, validateTokenAudience } from '@/lib/oauth';
import { RateLimiters, getClientIp, rateLimitExceeded } from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.APP_URL || 'https://screencontrol.knws.co.uk';

interface RouteParams {
  params: Promise<{ uuid: string }>;
}

// MCP Server capabilities
const MCP_CAPABILITIES = {
  tools: {},
  resources: {},
  prompts: {},
};

// Logging helper
function logMcp(stage: string, data: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[MCP Endpoint] ${stage} - ${timestamp}`);
  console.log('='.repeat(60));
  Object.entries(data).forEach(([key, value]) => {
    if (key.toLowerCase().includes('token') && typeof value === 'string' && value.length > 20) {
      console.log(`  ${key}: ${value.substring(0, 12)}...${value.substring(value.length - 4)} (${value.length} chars)`);
    } else if (typeof value === 'object') {
      console.log(`  ${key}:`, JSON.stringify(value, null, 2));
    } else {
      console.log(`  ${key}: ${value}`);
    }
  });
}

/**
 * Extract and validate Bearer token from Authorization header
 */
async function validateRequest(request: NextRequest, endpointUuid: string) {
  const authHeader = request.headers.get('authorization');

  logMcp('VALIDATE REQUEST', {
    endpointUuid,
    hasAuthHeader: !!authHeader,
    authHeaderPrefix: authHeader?.substring(0, 20) || 'NONE',
  });

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logMcp('ERROR', { error: 'invalid_token', reason: 'Missing or invalid Authorization header' });
    return {
      error: 'invalid_token',
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="mcp", error="invalid_token", error_description="Missing or invalid Authorization header"',
      },
    };
  }

  const token = authHeader.slice(7);
  const tokenHash = hashToken(token);
  const expectedAudience = APP_URL + '/mcp/' + endpointUuid;

  logMcp('TOKEN LOOKUP', {
    tokenHash: tokenHash.substring(0, 16) + '...',
    expectedAudience,
  });

  // Find the token
  const tokenRecord = await prisma.oAuthAccessToken.findUnique({
    where: { accessTokenHash: tokenHash },
    include: {
      connection: true,
      user: true,
    },
  });

  if (!tokenRecord) {
    logMcp('ERROR', { error: 'invalid_token', reason: 'Token not found in database' });
    return {
      error: 'invalid_token',
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="mcp", error="invalid_token"',
      },
    };
  }

  logMcp('TOKEN FOUND', {
    tokenId: tokenRecord.id,
    userId: tokenRecord.userId,
    userEmail: tokenRecord.user.email,
    connectionId: tokenRecord.connectionId,
    connectionName: tokenRecord.connection.name,
    connectionStatus: tokenRecord.connection.status,
    audience: tokenRecord.audience,
    expectedAudience,
    scope: tokenRecord.scope,
    revokedAt: tokenRecord.revokedAt?.toISOString() || 'NOT REVOKED',
    expiresAt: tokenRecord.accessExpiresAt.toISOString(),
  });

  // Check if revoked
  if (tokenRecord.revokedAt) {
    logMcp('ERROR', { error: 'invalid_token', reason: 'Token has been revoked' });
    return {
      error: 'invalid_token',
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="mcp", error="invalid_token", error_description="Token has been revoked"',
      },
    };
  }

  // Check if expired
  if (isTokenExpired(tokenRecord.accessExpiresAt)) {
    logMcp('ERROR', { error: 'invalid_token', reason: 'Token has expired' });
    return {
      error: 'invalid_token',
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="mcp", error="invalid_token", error_description="Token has expired"',
      },
    };
  }

  // Check audience
  const audienceValid = validateTokenAudience(tokenRecord.audience, expectedAudience);
  logMcp('AUDIENCE CHECK', {
    tokenAudience: tokenRecord.audience,
    expectedAudience,
    valid: audienceValid,
  });
  if (!audienceValid) {
    logMcp('ERROR', { error: 'insufficient_scope', reason: 'Token not valid for this resource' });
    return {
      error: 'insufficient_scope',
      status: 403,
      headers: {
        'WWW-Authenticate': 'Bearer realm="mcp", error="insufficient_scope", error_description="Token not valid for this resource"',
      },
    };
  }

  // Check connection is active
  if (tokenRecord.connection.status !== 'ACTIVE') {
    logMcp('ERROR', { error: 'invalid_token', reason: 'Connection is not active', status: tokenRecord.connection.status });
    return {
      error: 'invalid_token',
      status: 403,
      headers: {
        'WWW-Authenticate': 'Bearer realm="mcp", error="invalid_token", error_description="Connection is not active"',
      },
    };
  }

  logMcp('VALIDATION SUCCESS', { userId: tokenRecord.userId, connectionId: tokenRecord.connectionId });

  // Update last used timestamp
  await Promise.all([
    prisma.oAuthAccessToken.update({
      where: { id: tokenRecord.id },
      data: { lastUsedAt: new Date() },
    }),
    prisma.mcpConnection.update({
      where: { id: tokenRecord.connectionId },
      data: {
        lastUsedAt: new Date(),
        totalRequests: { increment: 1 },
      },
    }),
  ]);

  return {
    valid: true,
    userId: tokenRecord.userId,
    connectionId: tokenRecord.connectionId,
    scope: tokenRecord.scope,
  };
}

/**
 * Handle POST requests (Streamable HTTP JSON-RPC)
 */
export async function POST(request: NextRequest, context: RouteParams): Promise<Response> {
  const { uuid } = await context.params;
  const clientIp = getClientIp(request);

  // Rate limit unauthenticated requests by IP (before validation)
  const unauthRateLimit = RateLimiters.mcpUnauthenticated(clientIp);
  if (!unauthRateLimit.success) {
    return rateLimitExceeded(unauthRateLimit);
  }

  // Validate the endpoint exists
  const connection = await prisma.mcpConnection.findUnique({
    where: { endpointUuid: uuid },
  });

  if (!connection) {
    return NextResponse.json(
      { error: 'not_found', error_description: 'MCP endpoint not found' },
      { status: 404 }
    );
  }

  // Validate the request
  const validation = await validateRequest(request, uuid);
  if ('error' in validation) {
    return NextResponse.json(
      { error: validation.error },
      {
        status: validation.status,
        headers: validation.headers,
      }
    );
  }

  // Rate limit authenticated requests by connection (100 requests/minute)
  const connRateLimit = RateLimiters.mcpRequest(validation.connectionId);
  if (!connRateLimit.success) {
    return rateLimitExceeded(connRateLimit);
  }

  // Parse JSON-RPC request
  let rpcRequest;
  try {
    rpcRequest = await request.json();
  } catch (e) {
    return jsonRpcError(null, -32700, 'Parse error');
  }

  // Handle JSON-RPC
  const { id, method, params } = rpcRequest;

  logMcp('JSON-RPC REQUEST', {
    id: id ?? 'NOTIFICATION (no id)',
    method,
    params: params || {},
  });

  // Check if this is a notification (no id field = no response expected)
  const isNotification = id === undefined || id === null;

  // Log the request
  const startTime = Date.now();

  try {
    const response = await handleMcpMethod(method, params, validation);

    logMcp('JSON-RPC RESPONSE SUCCESS', {
      id: id ?? 'NOTIFICATION',
      method,
      responseKeys: Object.keys(response || {}),
      isNotification,
    });

    // Log request
    await logRequest(validation.connectionId, method, params, true, Date.now() - startTime, request);

    // Notifications don't get responses per JSON-RPC spec
    if (isNotification) {
      return new NextResponse(null, {
        status: 202,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: response,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': uuidv4(),
      },
    });
  } catch (error: any) {
    const code = error.code || -32603;
    const message = error.message || 'Internal error';

    logMcp('JSON-RPC RESPONSE ERROR', {
      id: id ?? 'NOTIFICATION',
      method,
      errorCode: code,
      errorMessage: message,
      isNotification,
    });

    // Log request
    await logRequest(validation.connectionId, method, params, false, Date.now() - startTime, request, code, message);

    // Notifications don't get error responses either
    if (isNotification) {
      return new NextResponse(null, {
        status: 202,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return jsonRpcError(id, code, message);
  }
}

/**
 * Handle MCP methods
 */
async function handleMcpMethod(method: string, params: any, auth: { userId: string; scope: string[] }) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        capabilities: MCP_CAPABILITIES,
        serverInfo: {
          name: 'ScreenControl MCP',
          version: '1.0.0',
        },
      };

    case 'tools/list':
      // Get user's active agents and their tools
      const agents = await prisma.agent.findMany({
        where: {
          ownerUserId: auth.userId,
          status: 'ONLINE',
        },
        select: {
          id: true,
          hostname: true,
          osType: true,
        },
      });

      // Return available tools
      return {
        tools: [
          {
            name: 'screenshot',
            description: 'Take a screenshot of the remote machine',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: { type: 'string', description: 'ID of the agent to screenshot (optional, uses first available if not specified)' },
              },
            },
          },
          {
            name: 'click',
            description: 'Click at a position on the remote machine',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: { type: 'string' },
                x: { type: 'number', description: 'X coordinate' },
                y: { type: 'number', description: 'Y coordinate' },
                button: { type: 'string', enum: ['left', 'right', 'middle'], default: 'left' },
              },
              required: ['x', 'y'],
            },
          },
          {
            name: 'type',
            description: 'Type text on the remote machine',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: { type: 'string' },
                text: { type: 'string', description: 'Text to type' },
              },
              required: ['text'],
            },
          },
          {
            name: 'agents/list',
            description: 'List connected agents',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };

    case 'tools/call':
      const { name, arguments: args } = params;
      return await executeToolCall(name, args, auth.userId);

    case 'resources/list':
      return { resources: [] };

    case 'prompts/list':
      return { prompts: [] };

    case 'ping':
      return {};

    // MCP Notifications - these don't require meaningful responses
    case 'notifications/initialized':
      // Client confirms it received our initialize response
      return {};

    case 'notifications/cancelled':
      // Client cancelled a pending request
      return {};

    case 'notifications/progress':
      // Progress update from client
      return {};

    default:
      throw { code: -32601, message: 'Method not found: ' + method };
  }
}

/**
 * Execute a tool call
 */
async function executeToolCall(toolName: string, args: any, userId: string) {
  switch (toolName) {
    case 'agents/list':
      const agents = await prisma.agent.findMany({
        where: { ownerUserId: userId },
        select: {
          id: true,
          hostname: true,
          osType: true,
          status: true,
          lastSeenAt: true,
        },
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(agents, null, 2),
          },
        ],
      };

    case 'screenshot':
    case 'click':
    case 'type':
      // These would connect to the agent via WebSocket
      // For now, return a placeholder
      return {
        content: [
          {
            type: 'text',
            text: 'Tool ' + toolName + ' executed (agent integration pending)',
          },
        ],
      };

    default:
      throw { code: -32601, message: 'Unknown tool: ' + toolName };
  }
}

/**
 * Log MCP request
 */
async function logRequest(
  connectionId: string,
  method: string,
  params: any,
  success: boolean,
  durationMs: number,
  request: NextRequest,
  errorCode?: number,
  errorMessage?: string
) {
  try {
    await prisma.mcpRequestLog.create({
      data: {
        connectionId,
        method,
        toolName: method === 'tools/call' ? params?.name : undefined,
        params: params ? JSON.stringify(params) : undefined,
        success,
        errorCode,
        errorMessage,
        durationMs,
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip'),
        userAgent: request.headers.get('user-agent'),
      },
    });
  } catch (e) {
    console.error('[MCP] Failed to log request:', e);
  }
}

/**
 * Create JSON-RPC error response
 */
function jsonRpcError(id: string | number | null, code: number, message: string) {
  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  }, { status: 400 });
}

/**
 * Handle GET requests (SSE stream)
 */
export async function GET(request: NextRequest, context: RouteParams): Promise<Response> {
  const { uuid } = await context.params;
  const clientIp = getClientIp(request);

  // Rate limit unauthenticated requests by IP
  const unauthRateLimit = RateLimiters.mcpUnauthenticated(clientIp);
  if (!unauthRateLimit.success) {
    return rateLimitExceeded(unauthRateLimit);
  }

  // Validate the endpoint exists
  const connection = await prisma.mcpConnection.findUnique({
    where: { endpointUuid: uuid },
  });

  if (!connection) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404 }
    );
  }

  // Validate the request
  const validation = await validateRequest(request, uuid);
  if ('error' in validation) {
    return NextResponse.json(
      { error: validation.error },
      {
        status: validation.status,
        headers: validation.headers,
      }
    );
  }

  // Rate limit authenticated requests by connection
  const connRateLimit = RateLimiters.mcpRequest(validation.connectionId);
  if (!connRateLimit.success) {
    return rateLimitExceeded(connRateLimit);
  }

  // Create SSE stream
  const sessionId = uuidv4();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const event = 'data: ' + JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      }) + '\n\n';
      controller.enqueue(encoder.encode(event));

      // Keep connection alive
      const pingInterval = setInterval(() => {
        try {
          const ping = ': ping\n\n';
          controller.enqueue(encoder.encode(ping));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30000);

      // Cleanup on close
      (request as any)._cleanup = () => {
        clearInterval(pingInterval);
      };
    },
    cancel() {
      const cleanup = (request as any)._cleanup;
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Mcp-Session-Id': sessionId,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Handle DELETE requests (session termination)
 * MCP clients may send DELETE to close a session
 */
export async function DELETE(request: NextRequest, context: RouteParams): Promise<Response> {
  const { uuid } = await context.params;

  logMcp('DELETE REQUEST (session close)', { endpointUuid: uuid });

  // Just acknowledge the session close
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Handle OPTIONS for CORS
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
      'Access-Control-Max-Age': '86400',
    },
  });
}
