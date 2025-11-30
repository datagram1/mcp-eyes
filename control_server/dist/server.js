/**
 * MCP-Eyes Control Server
 *
 * Accepts WebSocket connections from remote agents,
 * proxies MCP requests, and announces agents via Bonjour.
 */
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Bonjour } from 'bonjour-service';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ═══════════════════════════════════════════════════════════════════════════
// Agent Registry
// ═══════════════════════════════════════════════════════════════════════════
class AgentRegistry {
    agents = new Map();
    bonjour;
    bonjourServices = new Map();
    constructor() {
        this.bonjour = new Bonjour();
    }
    register(socket, msg) {
        if (!msg.agent || !msg.token) {
            return null;
        }
        // Validate token (in production, check against database)
        // For now, accept any token that starts with "agt_"
        if (!msg.token.startsWith('agt_')) {
            return null;
        }
        const id = uuidv4();
        const agent = {
            id,
            name: msg.agent,
            token: msg.token,
            os: msg.os || 'unknown',
            osVersion: msg.osVersion || '',
            arch: msg.arch || '',
            connectedAt: new Date(),
            lastPing: new Date(),
            socket,
            pendingRequests: new Map(),
        };
        this.agents.set(id, agent);
        this.announceAgent(agent);
        console.log(`[Registry] Agent registered: ${agent.name} (${agent.os})`);
        return agent;
    }
    unregister(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return;
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
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    getAgentByName(name) {
        for (const agent of this.agents.values()) {
            if (agent.name === name)
                return agent;
        }
        return undefined;
    }
    getAllAgents() {
        return Array.from(this.agents.values());
    }
    findAgentBySocket(socket) {
        for (const agent of this.agents.values()) {
            if (agent.socket === socket)
                return agent;
        }
        return undefined;
    }
    announceAgent(agent) {
        // Announce via Bonjour/mDNS
        const service = this.bonjour.publish({
            name: `mcp-eyes-${agent.name}`,
            type: 'mcp-eyes',
            port: parseInt(process.env.PORT || '3457'),
            txt: {
                id: agent.id,
                name: agent.name,
                os: agent.os,
                osVersion: agent.osVersion,
                arch: agent.arch,
                remote: 'true',
            },
        });
        this.bonjourServices.set(agent.id, service);
        console.log(`[Bonjour] Announced: ${agent.name}`);
    }
    async sendCommand(agentId, method, params = {}) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }
        const requestId = uuidv4();
        const message = {
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
    handleResponse(agent, msg) {
        if (!msg.id)
            return;
        const pending = agent.pendingRequests.get(msg.id);
        if (!pending)
            return;
        clearTimeout(pending.timeout);
        agent.pendingRequests.delete(msg.id);
        if (msg.type === 'error') {
            pending.reject(new Error(msg.error || 'Unknown error'));
        }
        else {
            pending.resolve(msg.result);
        }
    }
    updatePing(agent) {
        agent.lastPing = new Date();
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
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web')));
// ═══════════════════════════════════════════════════════════════════════════
// WebSocket Handler (Agent Connections)
// ═══════════════════════════════════════════════════════════════════════════
wss.on('connection', (socket) => {
    console.log('[WS] New connection');
    let agentInfo = null;
    socket.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            switch (msg.type) {
                case 'register':
                    agentInfo = registry.register(socket, msg);
                    if (agentInfo) {
                        socket.send(JSON.stringify({ type: 'registered', id: agentInfo.id }));
                    }
                    else {
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
        }
        catch (e) {
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
// HTTP API (for MCP Proxy / LLM)
// ═══════════════════════════════════════════════════════════════════════════
// List all connected agents
app.get('/api/agents', (req, res) => {
    const agents = registry.getAllAgents().map(a => ({
        id: a.id,
        name: a.name,
        os: a.os,
        osVersion: a.osVersion,
        arch: a.arch,
        connectedAt: a.connectedAt,
        lastPing: a.lastPing,
    }));
    res.json(agents);
});
// Get agent status
app.get('/api/agents/:id/status', async (req, res) => {
    try {
        const result = await registry.sendCommand(req.params.id, 'status');
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Proxy any command to agent
app.post('/api/agents/:id/:method', async (req, res) => {
    try {
        const { id, method } = req.params;
        const result = await registry.sendCommand(id, method, req.body);
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Convenience: find agent by name and execute
app.post('/api/agents/by-name/:name/:method', async (req, res) => {
    try {
        const { name, method } = req.params;
        const agent = registry.getAgentByName(name);
        if (!agent) {
            res.status(404).json({ error: `Agent not found: ${name}` });
            return;
        }
        const result = await registry.sendCommand(agent.id, method, req.body);
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', agents: registry.getAllAgents().length });
});
// ═══════════════════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════════════════
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              MCP-Eyes Control Server v1.0.0                   ║
╠═══════════════════════════════════════════════════════════════╣
║  HTTP API:    http://localhost:${PORT}                          ║
║  WebSocket:   ws://localhost:${PORT}/ws                         ║
║  Bonjour:     Enabled                                         ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
