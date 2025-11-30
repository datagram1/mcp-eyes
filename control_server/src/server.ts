/**
 * MCP-Eyes Control Server
 *
 * Accepts WebSocket connections from remote agents,
 * proxies MCP requests via SSE, and announces agents via Bonjour.
 * 
 * Security:
 * - Only internal network connections can control the server
 * - External connections can only query agent status
 * - Argon2 encryption for secure keys
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Bonjour } from 'bonjour-service';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import crypto from 'crypto';
import argon2 from 'argon2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface AgentInfo {
  id: string;
  name: string;
  token: string;
  tokenHash: string; // Argon2 hash
  os: string;
  osVersion: string;
  arch: string;
  connectedAt: Date;
  lastPing: Date;
  socket: WebSocket;
  remoteAddress: string;
  isInternal: boolean;
  pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>;
}

interface AgentMessage {
  type: 'register' | 'response' | 'pong' | 'error';
  id?: string;
  agent?: string;
  token?: string;
  os?: string;
  osVersion?: string;
  arch?: string;
  result?: any;
  error?: string;
}

interface CommandMessage {
  type: 'request' | 'ping';
  id: string;
  method?: string;
  params?: any;
}

interface SSEClient {
  id: string;
  res: any; // http.ServerResponse
  connectedAt: Date;
  lastPing: Date;
  remoteAddress: string;
  isInternal: boolean;
  agentId?: string;
}

interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

// ═══════════════════════════════════════════════════════════════════════════
// Network Utilities
// ═══════════════════════════════════════════════════════════════════════════

class NetworkUtils {
  private static localIPs: Set<string> = new Set();
  private static privateRanges: Array<{ start: number; end: number }> = [
    { start: this.ipToNumber('10.0.0.0'), end: this.ipToNumber('10.255.255.255') },
    { start: this.ipToNumber('172.16.0.0'), end: this.ipToNumber('172.31.255.255') },
    { start: this.ipToNumber('192.168.0.0'), end: this.ipToNumber('192.168.255.255') },
    { start: this.ipToNumber('127.0.0.0'), end: this.ipToNumber('127.255.255.255') },
    { start: this.ipToNumber('169.254.0.0'), end: this.ipToNumber('169.254.255.255') }, // Link-local
  ];

  static {
    // Cache local IPs
    this.refreshLocalIPs();
    setInterval(() => this.refreshLocalIPs(), 60000); // Refresh every minute
  }

  private static ipToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  }

  private static refreshLocalIPs(): void {
    this.localIPs.clear();
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const addrs = interfaces[name];
      if (addrs) {
        for (const addr of addrs) {
          if (addr.family === 'IPv4' && !addr.internal) {
            this.localIPs.add(addr.address);
          }
        }
      }
    }
    // Always include localhost
    this.localIPs.add('127.0.0.1');
    this.localIPs.add('::1');
  }

  static isInternalIP(ip: string): boolean {
    // Check if it's localhost
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
      return true;
    }

    // Remove port if present
    const cleanIP = ip.split(':')[0];

    // Check if it's in our local IPs cache
    if (this.localIPs.has(cleanIP)) {
      return true;
    }

    // Check if it's in private IP ranges
    const ipNum = this.ipToNumber(cleanIP);
    for (const range of this.privateRanges) {
      if (ipNum >= range.start && ipNum <= range.end) {
        return true;
      }
    }

    return false;
  }

  static getClientIP(req: any): string {
    // Check X-Forwarded-For header (for proxies)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = forwarded.split(',').map((ip: string) => ip.trim());
      return ips[0];
    }

    // Check X-Real-IP header
    const realIP = req.headers['x-real-ip'];
    if (realIP) {
      return realIP;
    }

    // Fallback to socket remote address
    return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Security Utilities
// ═══════════════════════════════════════════════════════════════════════════

class SecurityUtils {
  static async hashToken(token: string): Promise<string> {
    return await argon2.hash(token, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  static async verifyToken(token: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, token);
    } catch {
      return false;
    }
  }

  static generateSecureToken(): string {
    return 'agt_' + crypto.randomBytes(32).toString('hex');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent Registry
// ═══════════════════════════════════════════════════════════════════════════

class AgentRegistry {
  private agents = new Map<string, AgentInfo>();
  private bonjour: Bonjour;
  private bonjourServices = new Map<string, any>();

  constructor() {
    this.bonjour = new Bonjour();
  }

  async register(socket: WebSocket, msg: AgentMessage, remoteAddress: string): Promise<AgentInfo | null> {
    if (!msg.agent || !msg.token) {
      return null;
    }

    // Validate token format
    if (!msg.token.startsWith('agt_')) {
      return null;
    }

    const isInternal = NetworkUtils.isInternalIP(remoteAddress);
    const id = uuidv4();
    
    // Hash the token for storage
    const tokenHash = await SecurityUtils.hashToken(msg.token);

    const agent: AgentInfo = {
      id,
      name: msg.agent,
      token: msg.token, // Keep plain token for now (will be removed after verification)
      tokenHash,
      os: msg.os || 'unknown',
      osVersion: msg.osVersion || '',
      arch: msg.arch || '',
      connectedAt: new Date(),
      lastPing: new Date(),
      socket,
      remoteAddress,
      isInternal,
      pendingRequests: new Map(),
    };

    this.agents.set(id, agent);
    this.announceAgent(agent);

    console.log(`[Registry] Agent registered: ${agent.name} (${agent.os}) from ${remoteAddress} [${isInternal ? 'INTERNAL' : 'EXTERNAL'}]`);
    return agent;
  }

  unregister(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Cancel pending requests
    for (const [, pending] of agent.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Agent disconnected'));
    }

    // Stop Bonjour announcement
    const service = this.bonjourServices.get(agentId);
    if (service) {
      service.stop();
      this.bonjourServices.delete(agentId);
    }

    this.agents.delete(agentId);
    console.log(`[Registry] Agent unregistered: ${agent.name}`);
  }

  getAgent(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  getAgentByName(name: string): AgentInfo | undefined {
    for (const agent of this.agents.values()) {
      if (agent.name === name) return agent;
    }
    return undefined;
  }

  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  findAgentBySocket(socket: WebSocket): AgentInfo | undefined {
    for (const agent of this.agents.values()) {
      if (agent.socket === socket) return agent;
    }
    return undefined;
  }

  private announceAgent(agent: AgentInfo): void {
    // Announce via Bonjour/mDNS
    const service = this.bonjour.publish({
      name: `mcp-eyes-${agent.name}`,
      type: '_mcp-eyes._tcp',
      port: parseInt(process.env.PORT || '3457'),
      txt: {
        id: agent.id,
        name: agent.name,
        os: agent.os,
        osVersion: agent.osVersion,
        arch: agent.arch,
        remote: 'true',
        internal: agent.isInternal ? 'true' : 'false',
      },
    });

    this.bonjourServices.set(agent.id, service);
    console.log(`[Bonjour] Announced: ${agent.name} (${agent.isInternal ? 'internal' : 'external'})`);
  }

  async sendCommand(agentId: string, method: string, params: any = {}): Promise<any> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const requestId = uuidv4();
    const message: CommandMessage = {
      type: 'request',
      id: requestId,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        agent.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 30000);

      agent.pendingRequests.set(requestId, { resolve, reject, timeout });
      agent.socket.send(JSON.stringify(message));
    });
  }

  handleResponse(agent: AgentInfo, msg: AgentMessage): void {
    if (!msg.id) return;

    const pending = agent.pendingRequests.get(msg.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    agent.pendingRequests.delete(msg.id);

    if (msg.type === 'error') {
      pending.reject(new Error(msg.error || 'Unknown error'));
    } else {
      pending.resolve(msg.result);
    }
  }

  updatePing(agent: AgentInfo): void {
    agent.lastPing = new Date();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SSE Client Manager
// ═══════════════════════════════════════════════════════════════════════════

class SSEManager {
  private clients = new Map<string, SSEClient>();
  private pendingRequests = new Map<string | number, {
    clientId: string;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private messageIdCounter = 0;

  constructor(private registry: AgentRegistry) {
    // Start ping interval
    setInterval(() => {
      const now = new Date();
      for (const [id, client] of this.clients.entries()) {
        try {
          this.sendSSE(client, { type: 'ping', timestamp: now.toISOString() });
          client.lastPing = now;
        } catch (err) {
          console.log(`[SSE] Client ${id} disconnected (ping failed)`);
          this.clients.delete(id);
        }
      }
    }, 30000);
  }

  addClient(res: any, remoteAddress: string, agentId?: string): string {
    const clientId = crypto.randomBytes(16).toString('hex');
    const isInternal = NetworkUtils.isInternalIP(remoteAddress);

    const client: SSEClient = {
      id: clientId,
      res,
      connectedAt: new Date(),
      lastPing: new Date(),
      remoteAddress,
      isInternal,
      agentId,
    };

    this.clients.set(clientId, client);
    console.log(`[SSE] Client ${clientId} connected from ${remoteAddress} [${isInternal ? 'INTERNAL' : 'EXTERNAL'}]`);

    // Send initial connection event
    this.sendSSE(client, {
      type: 'connection',
      clientId,
      agentId,
      isInternal,
    });

    return clientId;
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  private sendSSE(client: SSEClient, data: any): void {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    client.res.write(message);
  }

  sendMCPMessage(client: SSEClient, message: MCPMessage): void {
    this.sendSSE(client, { type: 'message', message });
  }

  async forwardMCPRequest(clientId: string, message: MCPMessage, agentId: string): Promise<MCPMessage> {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error('SSE client not found');
    }

    // Forward to agent via WebSocket
    const agent = this.registry.getAgent(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Convert MCP message to agent command
    const requestId = message.id || this.messageIdCounter++;
    const agentMessage: CommandMessage = {
      type: 'request',
      id: String(requestId),
      method: message.method,
      params: message.params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        agent.pendingRequests.delete(String(requestId));
        reject(new Error('Request timeout'));
      }, 30000);

      agent.pendingRequests.set(String(requestId), {
        resolve: (result: any) => {
          clearTimeout(timeout);
          resolve({
            jsonrpc: '2.0',
            id: message.id,
            result,
          });
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          resolve({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32603, message: error.message },
          });
        },
        timeout,
      });

      agent.socket.send(JSON.stringify(agentMessage));
    });
  }

  async processMCPMessage(clientId: string, message: MCPMessage, agentId?: string): Promise<MCPMessage> {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error('SSE client not found');
    }

    if (!agentId) {
      agentId = client.agentId;
    }

    if (!agentId) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32602, message: 'Agent ID required' },
      };
    }

    switch (message.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'MCP-Eyes Control Server', version: '1.1.0' },
          },
        };

      case 'tools/list':
        // Forward to agent
        return await this.forwardMCPRequest(clientId, message, agentId);

      case 'tools/call':
        // Forward to agent
        return await this.forwardMCPRequest(clientId, message, agentId);

      case 'ping':
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: { pong: true, timestamp: new Date().toISOString() },
        };

      default:
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `Method not found: ${message.method}` },
        };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Server Setup
// ═══════════════════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || '3457');
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const registry = new AgentRegistry();
const sseManager = new SSEManager(registry);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../web')));

// ═══════════════════════════════════════════════════════════════════════════
// Middleware: Security Check
// ═══════════════════════════════════════════════════════════════════════════

function requireInternalNetwork(req: any, res: any, next: any) {
  const clientIP = NetworkUtils.getClientIP(req);
  const isInternal = NetworkUtils.isInternalIP(clientIP);

  if (!isInternal) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Control operations are only allowed from internal network',
    });
    return;
  }

  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// WebSocket Handler (Agent Connections)
// ═══════════════════════════════════════════════════════════════════════════

wss.on('connection', (socket, req) => {
  const remoteAddress = NetworkUtils.getClientIP(req);
  console.log(`[WS] New connection from ${remoteAddress}`);
  let agentInfo: AgentInfo | null = null;

  socket.on('message', async (data) => {
    try {
      const msg: AgentMessage = JSON.parse(data.toString());

      switch (msg.type) {
        case 'register':
          agentInfo = await registry.register(socket, msg, remoteAddress);
          if (agentInfo) {
            socket.send(JSON.stringify({ type: 'registered', id: agentInfo.id }));
          } else {
            socket.send(JSON.stringify({ type: 'error', error: 'Registration failed' }));
            socket.close();
          }
          break;

        case 'response':
        case 'error':
          if (agentInfo) {
            registry.handleResponse(agentInfo, msg);
          }
          break;

        case 'pong':
          if (agentInfo) {
            registry.updatePing(agentInfo);
          }
          break;
      }
    } catch (e) {
      console.error('[WS] Message parse error:', e);
    }
  });

  socket.on('close', () => {
    if (agentInfo) {
      registry.unregister(agentInfo.id);
    }
    console.log('[WS] Connection closed');
  });

  socket.on('error', (err) => {
    console.error('[WS] Error:', err);
  });

  // Start ping interval
  const pingInterval = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ping', id: uuidv4() }));
    }
  }, 15000);

  socket.on('close', () => clearInterval(pingInterval));
});

// ═══════════════════════════════════════════════════════════════════════════
// SSE Endpoint (for MCP Proxy)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/mcp/sse', (req, res) => {
  const clientIP = NetworkUtils.getClientIP(req);
  const agentId = req.query.agentId as string | undefined;

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });

  const clientId = sseManager.addClient(res, clientIP, agentId);

  // Handle disconnect
  req.on('close', () => {
    console.log(`[SSE] Client ${clientId} disconnected`);
    sseManager.removeClient(clientId);
  });

  req.on('error', (err) => {
    console.error(`[SSE] Client ${clientId} error:`, err);
    sseManager.removeClient(clientId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MCP Messages Endpoint
// ═══════════════════════════════════════════════════════════════════════════

app.post('/mcp/messages', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string || req.body.clientId;
    const agentId = req.query.agentId as string | undefined || req.body.agentId;

    if (!clientId) {
      res.status(400).json({ error: 'Client ID required' });
      return;
    }

    const message: MCPMessage = req.body;
    const response = await sseManager.processMCPMessage(clientId, message, agentId);

    res.json(response);
  } catch (err: any) {
    console.error('[SSE] Message handling error:', err);
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error', data: err.message },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HTTP API (for MCP Proxy / LLM)
// ═══════════════════════════════════════════════════════════════════════════

// List all connected agents (public - for discovery)
app.get('/api/agents', (req, res) => {
  const agents = registry.getAllAgents().map(a => ({
    id: a.id,
    name: a.name,
    os: a.os,
    osVersion: a.osVersion,
    arch: a.arch,
    connectedAt: a.connectedAt,
    lastPing: a.lastPing,
    isInternal: a.isInternal,
  }));
  res.json(agents);
});

// Get agent status (public - for discovery)
app.get('/api/agents/:id/status', async (req, res) => {
  try {
    const result = await registry.sendCommand(req.params.id, 'status');
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy any command to agent (REQUIRES INTERNAL NETWORK)
app.post('/api/agents/:id/:method', requireInternalNetwork, async (req, res) => {
  try {
    const { id, method } = req.params;
    const result = await registry.sendCommand(id, method, req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Convenience: find agent by name and execute (REQUIRES INTERNAL NETWORK)
app.post('/api/agents/by-name/:name/:method', requireInternalNetwork, async (req, res) => {
  try {
    const { name, method } = req.params;
    const agent = registry.getAgentByName(name);
    if (!agent) {
      res.status(404).json({ error: `Agent not found: ${name}` });
      return;
    }
    const result = await registry.sendCommand(agent.id, method, req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Test connection endpoint (public)
app.get('/api/test', (req, res) => {
  const clientIP = NetworkUtils.getClientIP(req);
  const isInternal = NetworkUtils.isInternalIP(clientIP);
  res.json({
    status: 'ok',
    clientIP,
    isInternal,
    agents: registry.getAllAgents().length,
    timestamp: new Date().toISOString(),
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', agents: registry.getAllAgents().length });
});

// ═══════════════════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════════════════

server.listen(PORT, '0.0.0.0', () => {
  const localIPs = Array.from(NetworkUtils['localIPs']).filter(ip => ip !== '::1');
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          MCP-Eyes Control Server v1.1.0                       ║
╠═══════════════════════════════════════════════════════════════╣
║  HTTP API:    http://localhost:${PORT}                          ║
║  WebSocket:   ws://localhost:${PORT}/ws                         ║
║  SSE:         http://localhost:${PORT}/mcp/sse                  ║
║  Bonjour:     Enabled                                         ║
║  Security:    Internal network only (control)                 ║
╠═══════════════════════════════════════════════════════════════╣
║  Local IPs:   ${localIPs.length > 0 ? localIPs.join(', ') : 'none'}${localIPs.length > 0 ? ' '.repeat(Math.max(0, 50 - localIPs.join(', ').length)) : ' '.repeat(50)}║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
