#!/usr/bin/env node
"use strict";
/**
 * MCP-Eyes SSE Server
 *
 * Provides Server-Sent Events (SSE) transport for MCP protocol.
 * Compatible with Open WebUI and other HTTP-based MCP clients.
 *
 * Supports:
 * - Direct connections from Open WebUI
 * - Proxied connections via Control Server
 * - API key authentication
 * - CORS for cross-origin requests
 *
 * Architecture:
 *
 * Simple (Direct):
 *   Open WebUI ──SSE──► MCP-Eyes Agent
 *
 * Complex (Via Control Server):
 *   Open WebUI ──SSE──► Control Server ──SSE──► MCP-Eyes Agent
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const events_1 = require("events");
const tool_registry_1 = require("./tool-registry");
const filesystem_tools_1 = require("./filesystem-tools");
const shell_tools_1 = require("./shell-tools");
// Configuration
const PORT = parseInt(process.env.MCP_SSE_PORT || '3458', 10);
const HOST = process.env.MCP_SSE_HOST || '0.0.0.0'; // LAN accessible by default
const API_KEY = process.env.MCP_API_KEY || generateApiKey();
const AGENT_NAME = process.env.MCP_AGENT_NAME || `mcp-eyes-${require('os').hostname()}`;
// Token file for local discovery
const TOKEN_FILE = path_1.default.join(process.env.HOME || '/tmp', '.mcp-eyes-sse-token');
function generateApiKey() {
    return 'mcp_' + crypto_1.default.randomBytes(24).toString('hex');
}
class MCPSSEServer extends events_1.EventEmitter {
    httpServer;
    clients = new Map();
    pendingRequests = new Map();
    messageIdCounter = 0;
    // Tool Registry
    toolRegistry;
    filesystemTools;
    shellTools;
    constructor() {
        super();
        this.toolRegistry = new tool_registry_1.ToolRegistry();
        this.filesystemTools = new filesystem_tools_1.FilesystemTools();
        this.shellTools = new shell_tools_1.ShellTools();
        // Forward shell session events to SSE clients
        this.shellTools.on('shell_session_output', (data) => {
            this.broadcastSSE('shell_session_output', data);
        });
        this.shellTools.on('shell_session_exit', (data) => {
            this.broadcastSSE('shell_session_exit', data);
        });
        this.httpServer = http_1.default.createServer(this.handleRequest.bind(this));
        this.startPingInterval();
        this.saveTokenFile();
        // Register all tools
        this.registerAllTools();
    }
    saveTokenFile() {
        const config = {
            apiKey: API_KEY,
            port: PORT,
            host: HOST,
            agentName: AGENT_NAME,
            sseEndpoint: `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/mcp/sse`,
            messagesEndpoint: `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/mcp/messages`,
            createdAt: new Date().toISOString(),
        };
        try {
            fs_1.default.writeFileSync(TOKEN_FILE, JSON.stringify(config, null, 2));
            console.log(`[SSE Server] Token saved to ${TOKEN_FILE}`);
        }
        catch (err) {
            console.error('[SSE Server] Failed to save token file:', err);
        }
    }
    startPingInterval() {
        // Send ping every 30 seconds to keep connections alive
        setInterval(() => {
            const now = new Date();
            for (const [id, client] of this.clients.entries()) {
                try {
                    this.sendSSE(client, { type: 'ping', timestamp: now.toISOString() });
                    client.lastPing = now;
                }
                catch (err) {
                    console.log(`[SSE Server] Client ${id} disconnected (ping failed)`);
                    this.clients.delete(id);
                }
            }
        }, 30000);
    }
    async handleRequest(req, res) {
        // CORS headers for Open WebUI
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Forwarded-For, X-Client-Id');
        res.setHeader('Access-Control-Expose-Headers', 'X-Client-Id');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        const url = new url_1.URL(req.url || '/', `http://localhost:${PORT}`);
        const pathname = url.pathname;
        // Health check (no auth required)
        if (pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                agent: AGENT_NAME,
                clients: this.clients.size,
                uptime: process.uptime(),
            }));
            return;
        }
        // Agent info (no auth required - for discovery)
        if (pathname === '/info') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                name: AGENT_NAME,
                version: '1.1.15',
                capabilities: ['screenshot', 'click', 'type', 'ocr', 'browser'],
                sseEndpoint: '/mcp/sse',
                messagesEndpoint: '/mcp/messages',
            }));
            return;
        }
        // All other endpoints require API key
        if (!this.verifyApiKey(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing API key' }));
            return;
        }
        // Detect if request is proxied through control server
        const forwardedFor = req.headers['x-forwarded-for'];
        const origin = forwardedFor ? 'control-server' : 'direct';
        // SSE endpoint
        if (pathname === '/mcp/sse') {
            this.handleSSEConnection(req, res, origin, forwardedFor);
            return;
        }
        // Messages endpoint
        if (pathname === '/mcp/messages' && req.method === 'POST') {
            await this.handleMessage(req, res, origin);
            return;
        }
        // List tools (convenience endpoint)
        if (pathname === '/mcp/tools') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ tools: this.getToolDefinitions() }));
            return;
        }
        // Not found
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
    verifyApiKey(req) {
        // Check Authorization header
        const authHeader = req.headers['authorization'];
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            if (token === API_KEY)
                return true;
        }
        // Check X-API-Key header
        const apiKeyHeader = req.headers['x-api-key'];
        if (apiKeyHeader === API_KEY)
            return true;
        // Check query parameter (for SSE connections where headers are tricky)
        const url = new url_1.URL(req.url || '/', `http://localhost:${PORT}`);
        const queryKey = url.searchParams.get('api_key');
        if (queryKey === API_KEY)
            return true;
        return false;
    }
    handleSSEConnection(req, res, origin, forwardedFor) {
        const clientId = crypto_1.default.randomBytes(16).toString('hex');
        // SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Client-Id': clientId,
        });
        const client = {
            id: clientId,
            res,
            connectedAt: new Date(),
            lastPing: new Date(),
            origin,
            forwardedFor,
        };
        this.clients.set(clientId, client);
        console.log(`[SSE Server] Client ${clientId} connected (${origin}${forwardedFor ? ` via ${forwardedFor}` : ''})`);
        // Send initial connection event with session info
        this.sendSSE(client, {
            type: 'connection',
            clientId,
            agent: AGENT_NAME,
            capabilities: this.getToolDefinitions().map(t => t.name),
        });
        // Send server capabilities (MCP initialize response)
        this.sendMCPMessage(client, {
            jsonrpc: '2.0',
            id: 0,
            result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {},
                },
                serverInfo: {
                    name: AGENT_NAME,
                    version: '1.1.15',
                },
            },
        });
        // Handle disconnect
        req.on('close', () => {
            console.log(`[SSE Server] Client ${clientId} disconnected`);
            this.clients.delete(clientId);
            // Clean up shell sessions on client disconnect
            // Note: In a multi-client scenario, we might want to keep sessions alive
            // For now, we'll keep sessions alive across disconnects
        });
        req.on('error', (err) => {
            console.error(`[SSE Server] Client ${clientId} error:`, err);
            this.clients.delete(clientId);
        });
    }
    sendSSE(client, data) {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        client.res.write(message);
    }
    sendMCPMessage(client, message) {
        this.sendSSE(client, { type: 'message', message });
    }
    async handleMessage(req, res, origin) {
        try {
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString());
            // Get client ID from header or body
            const clientId = req.headers['x-client-id'] || body.clientId;
            // Handle MCP message
            const response = await this.processMCPMessage(body, clientId);
            // Send response
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
            // Also send via SSE if client is connected
            if (clientId && this.clients.has(clientId)) {
                const client = this.clients.get(clientId);
                this.sendMCPMessage(client, response);
            }
        }
        catch (err) {
            console.error('[SSE Server] Message handling error:', err);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32700, message: 'Parse error', data: err.message },
            }));
        }
    }
    async processMCPMessage(message, clientId) {
        const { method, params, id } = message;
        try {
            switch (method) {
                case 'initialize':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            protocolVersion: '2024-11-05',
                            capabilities: { tools: {} },
                            serverInfo: { name: AGENT_NAME, version: '1.1.15' },
                        },
                    };
                case 'tools/list':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: { tools: this.getToolDefinitions() },
                    };
                case 'tools/call':
                    const toolResult = await this.callTool(params.name, params.arguments || {});
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: toolResult,
                    };
                case 'ping':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: { pong: true, timestamp: new Date().toISOString() },
                    };
                default:
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32601, message: `Method not found: ${method}` },
                    };
            }
        }
        catch (err) {
            return {
                jsonrpc: '2.0',
                id,
                error: { code: -32603, message: err.message },
            };
        }
    }
    async callTool(name, args) {
        // Check if tool is enabled
        if (!this.toolRegistry.isToolEnabled(name)) {
            throw new Error(`Tool ${name} is disabled`);
        }
        console.log(`[SSE Server] Calling tool: ${name}`, args);
        // Route filesystem tools
        if (name.startsWith('fs_')) {
            return await this.handleFilesystemTool(name, args);
        }
        // Route shell tools
        if (name.startsWith('shell_')) {
            return await this.handleShellTool(name, args);
        }
        // Route GUI tools
        switch (name) {
            case 'listApplications':
                return await this.proxyToHttpBackend('/listApplications');
            case 'focusApplication':
                return await this.proxyToHttpBackend('/focusApplication', 'POST', args);
            case 'screenshot':
                return await this.proxyToHttpBackend('/screenshot', 'POST', args);
            case 'click':
                return await this.proxyToHttpBackend('/click', 'POST', args);
            case 'getClickableElements':
                return await this.proxyToHttpBackend('/getClickableElements');
            case 'typeText':
                return await this.proxyToHttpBackend('/typeText', 'POST', args);
            case 'pressKey':
                return await this.proxyToHttpBackend('/pressKey', 'POST', args);
            case 'analyzeWithOCR':
                return await this.proxyToHttpBackend('/analyzeWithOCR');
            case 'checkPermissions':
                return await this.proxyToHttpBackend('/permissions');
            // Browser tools - proxy to browser bridge
            case 'browser_listConnected':
                return await this.proxyToBrowserBridge('/browsers');
            case 'browser_getTabs':
                return await this.proxyToBrowserBridge('/browser/getTabs', 'POST', args);
            case 'browser_getActiveTab':
                return await this.proxyToBrowserBridge('/browser/getActiveTab', 'POST', args);
            case 'browser_getPageInfo':
                return await this.proxyToBrowserBridge('/browser/getPageInfo', 'POST', args);
            case 'browser_getInteractiveElements':
                return await this.proxyToBrowserBridge('/browser/getInteractiveElements', 'POST', args);
            case 'browser_clickElement':
                return await this.proxyToBrowserBridge('/browser/clickElement', 'POST', args);
            case 'browser_fillElement':
                return await this.proxyToBrowserBridge('/browser/fillElement', 'POST', args);
            case 'browser_executeScript':
                return await this.proxyToBrowserBridge('/browser/executeScript', 'POST', args);
            // Enhanced browser tools
            case 'browser_inspectCurrentPage':
                return await this.proxyToBrowserBridge('/browser/inspectCurrentPage', 'POST', args);
            case 'browser_getUIElements':
                return await this.proxyToBrowserBridge('/browser/getUIElements', 'POST', args);
            case 'browser_fillFormField':
                return await this.proxyToBrowserBridge('/browser/fillFormField', 'POST', args);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    /**
     * Handle filesystem tool calls
     */
    async handleFilesystemTool(name, args) {
        switch (name) {
            case 'fs_list':
                return await this.filesystemTools.listDirectory(args);
            case 'fs_read':
                return await this.filesystemTools.readFile(args);
            case 'fs_read_range':
                return await this.filesystemTools.readFileRange(args);
            case 'fs_write':
                return await this.filesystemTools.writeFile(args);
            case 'fs_delete':
                return await this.filesystemTools.deletePath(args);
            case 'fs_move':
                return await this.filesystemTools.movePath(args);
            case 'fs_search':
                return await this.filesystemTools.searchFiles(args);
            case 'fs_grep':
                return await this.filesystemTools.grepFiles(args);
            case 'fs_patch':
                return await this.filesystemTools.patchFile(args);
            default:
                throw new Error(`Unknown filesystem tool: ${name}`);
        }
    }
    /**
     * Handle shell tool calls
     */
    async handleShellTool(name, args) {
        switch (name) {
            case 'shell_exec':
                return await this.shellTools.executeCommand(args);
            case 'shell_start_session':
                return this.shellTools.startSession(args);
            case 'shell_send_input':
                return this.shellTools.sendInput(args.session_id, args.input);
            case 'shell_stop_session':
                return this.shellTools.stopSession(args.session_id, args.signal);
            default:
                throw new Error(`Unknown shell tool: ${name}`);
        }
    }
    /**
     * Broadcast SSE events to all connected clients
     */
    broadcastSSE(eventType, data) {
        for (const client of this.clients.values()) {
            try {
                this.sendSSE(client, {
                    type: eventType,
                    ...data,
                });
            }
            catch (err) {
                // Client may have disconnected
                console.warn(`[SSE Server] Failed to send event to client ${client.id}:`, err);
            }
        }
    }
    async proxyToHttpBackend(endpoint, method = 'GET', body) {
        // Read HTTP backend config
        const httpTokenFile = path_1.default.join(process.env.HOME || '/tmp', '.mcp-eyes-token');
        let config;
        try {
            config = JSON.parse(fs_1.default.readFileSync(httpTokenFile, 'utf-8'));
        }
        catch {
            // Fallback to default
            config = { port: 3456, host: '127.0.0.1', apiKey: '' };
        }
        return this.httpRequest(config.host, config.port, endpoint, method, body, config.apiKey);
    }
    async proxyToBrowserBridge(endpoint, method = 'GET', body) {
        const port = parseInt(process.env.BROWSER_BRIDGE_PORT || '3457', 10);
        return this.httpRequest('127.0.0.1', port, endpoint, method, body);
    }
    httpRequest(host, port, endpoint, method, body, apiKey) {
        return new Promise((resolve, reject) => {
            const headers = {
                'Content-Type': 'application/json',
            };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }
            const options = {
                hostname: host,
                port,
                path: endpoint,
                method,
                headers,
                timeout: 30000,
            };
            const req = http_1.default.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    }
                    catch {
                        resolve({ raw: data });
                    }
                });
            });
            req.on('error', (e) => reject(new Error(`Backend request failed: ${e.message}`)));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Backend request timeout'));
            });
            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }
    /**
     * Register all tools with the Tool Registry
     * This includes stub filesystem and shell tools for testing
     */
    registerAllTools() {
        // Register stub filesystem tools (9 tools)
        this.toolRegistry.registerTool({
            id: 'fs_list',
            name: 'fs_list',
            description: 'List files and directories at or under a given path.',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to list' },
                    recursive: { type: 'boolean', description: 'Recursive listing', default: false },
                    max_depth: { type: 'number', description: 'Maximum depth for recursive listing', default: 3 }
                },
                required: ['path']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_read',
            name: 'fs_read',
            description: 'Read the contents of a file (with size limit).',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to file' },
                    max_bytes: { type: 'number', description: 'Maximum bytes to read', default: 131072 }
                },
                required: ['path']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_read_range',
            name: 'fs_read_range',
            description: 'Read a file segment by line range (1-based, inclusive).',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to file' },
                    start_line: { type: 'number', description: 'Start line (1-based)' },
                    end_line: { type: 'number', description: 'End line (1-based, inclusive)' }
                },
                required: ['path', 'start_line', 'end_line']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_write',
            name: 'fs_write',
            description: 'Create or overwrite a file.',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to file' },
                    content: { type: 'string', description: 'File content' },
                    create_dirs: { type: 'boolean', description: 'Create parent directories', default: true },
                    mode: { type: 'string', enum: ['overwrite', 'append', 'create_if_missing'], description: 'Write mode', default: 'overwrite' }
                },
                required: ['path', 'content']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_delete',
            name: 'fs_delete',
            description: 'Delete a file or directory.',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to delete' },
                    recursive: { type: 'boolean', description: 'Recursive deletion', default: false }
                },
                required: ['path']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_move',
            name: 'fs_move',
            description: 'Move or rename a file or directory.',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    from: { type: 'string', description: 'Source path' },
                    to: { type: 'string', description: 'Destination path' }
                },
                required: ['from', 'to']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_search',
            name: 'fs_search',
            description: 'Find files by pattern (glob).',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    base: { type: 'string', description: 'Base directory' },
                    glob: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts")' },
                    max_results: { type: 'number', description: 'Maximum results', default: 200 }
                },
                required: ['base']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_grep',
            name: 'fs_grep',
            description: 'Search within files (ripgrep wrapper).',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    base: { type: 'string', description: 'Directory to search' },
                    pattern: { type: 'string', description: 'Search pattern' },
                    glob: { type: 'string', description: 'Glob pattern for file filtering' },
                    max_matches: { type: 'number', description: 'Maximum matches', default: 200 }
                },
                required: ['base', 'pattern']
            }
        });
        this.toolRegistry.registerTool({
            id: 'fs_patch',
            name: 'fs_patch',
            description: 'Apply focused transformations to a file.',
            category: 'filesystem',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to file' },
                    operations: {
                        type: 'array',
                        description: 'Patch operations',
                        items: {
                            type: 'object',
                            properties: {
                                type: { type: 'string', enum: ['replace_first', 'replace_all', 'insert_after', 'insert_before'] },
                                pattern: { type: 'string', description: 'Pattern for replace operations' },
                                match: { type: 'string', description: 'Match for insert operations' },
                                replacement: { type: 'string', description: 'Replacement text' },
                                insert: { type: 'string', description: 'Text to insert' }
                            }
                        }
                    },
                    dry_run: { type: 'boolean', description: 'Preview changes without applying', default: false }
                },
                required: ['path', 'operations']
            }
        });
        // Register stub shell tools (4 tools)
        this.toolRegistry.registerTool({
            id: 'shell_exec',
            name: 'shell_exec',
            description: 'Run a command and return output when it finishes.',
            category: 'shell',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Command to execute' },
                    cwd: { type: 'string', description: 'Working directory' },
                    timeout_seconds: { type: 'number', description: 'Timeout in seconds', default: 600 },
                    capture_stderr: { type: 'boolean', description: 'Capture stderr', default: true }
                },
                required: ['command']
            }
        });
        this.toolRegistry.registerTool({
            id: 'shell_start_session',
            name: 'shell_start_session',
            description: 'Start an interactive or long-running command session.',
            category: 'shell',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Command to execute' },
                    cwd: { type: 'string', description: 'Working directory' },
                    env: { type: 'object', description: 'Additional environment variables' },
                    capture_stderr: { type: 'boolean', description: 'Capture stderr', default: true }
                },
                required: ['command']
            }
        });
        this.toolRegistry.registerTool({
            id: 'shell_send_input',
            name: 'shell_send_input',
            description: 'Send input to a running shell session.',
            category: 'shell',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    session_id: { type: 'string', description: 'Session ID' },
                    input: { type: 'string', description: 'Input to send' }
                },
                required: ['session_id', 'input']
            }
        });
        this.toolRegistry.registerTool({
            id: 'shell_stop_session',
            name: 'shell_stop_session',
            description: 'Stop/terminate a running shell session.',
            category: 'shell',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    session_id: { type: 'string', description: 'Session ID' },
                    signal: { type: 'string', description: 'Signal to send (default: TERM)', default: 'TERM' }
                },
                required: ['session_id']
            }
        });
        // Register existing GUI tools
        this.toolRegistry.registerTool({
            id: 'listApplications',
            name: 'listApplications',
            description: 'List all running applications with their window bounds and identifiers.',
            category: 'gui',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        this.toolRegistry.registerTool({
            id: 'focusApplication',
            name: 'focusApplication',
            description: 'Focus on a specific application by bundle ID or name.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    identifier: { type: 'string', description: 'Bundle ID or app name' },
                },
                required: ['identifier'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'screenshot',
            name: 'screenshot',
            description: 'Take a screenshot of the focused application.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    padding: { type: 'number', description: 'Padding around window in pixels' },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'click',
            name: 'click',
            description: 'Click at normalized coordinates (0-1) relative to focused window.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    x: { type: 'number', description: 'X coordinate (0-1)' },
                    y: { type: 'number', description: 'Y coordinate (0-1)' },
                    button: { type: 'string', enum: ['left', 'right'], description: 'Mouse button' },
                },
                required: ['x', 'y'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'getClickableElements',
            name: 'getClickableElements',
            description: 'Get all clickable UI elements via Accessibility API.',
            category: 'gui',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        this.toolRegistry.registerTool({
            id: 'typeText',
            name: 'typeText',
            description: 'Type text into the focused application.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Text to type' },
                },
                required: ['text'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'pressKey',
            name: 'pressKey',
            description: 'Press keyboard key with optional modifiers.',
            category: 'gui',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'Key to press (e.g., Enter, Command+L)' },
                },
                required: ['key'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'analyzeWithOCR',
            name: 'analyzeWithOCR',
            description: 'Analyze current screen using OCR.',
            category: 'gui',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        this.toolRegistry.registerTool({
            id: 'checkPermissions',
            name: 'checkPermissions',
            description: 'Check accessibility permission status.',
            category: 'gui',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        // Register existing browser tools
        this.toolRegistry.registerTool({
            id: 'browser_listConnected',
            name: 'browser_listConnected',
            description: 'List connected browser extensions.',
            category: 'browser',
            enabled: true,
            inputSchema: { type: 'object', properties: {} }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getTabs',
            name: 'browser_getTabs',
            description: 'List all open browser tabs.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getActiveTab',
            name: 'browser_getActiveTab',
            description: 'Get info about the currently active browser tab.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getPageInfo',
            name: 'browser_getPageInfo',
            description: 'Get current page URL, title, and metadata.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getInteractiveElements',
            name: 'browser_getInteractiveElements',
            description: 'Get all interactive DOM elements (buttons, links, inputs).',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_clickElement',
            name: 'browser_clickElement',
            description: 'Click a DOM element by CSS selector.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['selector'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_fillElement',
            name: 'browser_fillElement',
            description: 'Fill a form field by CSS selector.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector' },
                    value: { type: 'string', description: 'Value to fill' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['selector', 'value'],
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_executeScript',
            name: 'browser_executeScript',
            description: 'Execute JavaScript in page context.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    script: { type: 'string', description: 'JavaScript code' },
                    tabId: { type: 'number' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['script'],
            }
        });
        // Enhanced browser tools
        this.toolRegistry.registerTool({
            id: 'browser_inspectCurrentPage',
            name: 'browser_inspectCurrentPage',
            description: 'START HERE for any new page. Single call that gives you EVERYTHING: page info + all form fields with labels + coordinates. Returns: (1) Page URL/title, (2) All interactive elements with specific types (email-input, password-input, dropdown, checkbox, radio, submit-button), extracted labels from <label> tags or aria-label, current values, and BOTH absolute pixels AND normalized 0-1 coordinates, (3) Radio button groups, (4) Summary stats. Use browser_fillFormField with the returned labels to fill forms easily. Replaces multiple calls to browser_getPageInfo + browser_getInteractiveElements.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                    includeScreenshot: { type: 'boolean', description: 'Include screenshot in response (default: true)', default: true },
                    includeOCR: { type: 'boolean', description: 'Include OCR text extraction (default: false)', default: false },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_getUIElements',
            name: 'browser_getUIElements',
            description: 'Enhanced form field detection - same elements data as browser_inspectCurrentPage but WITHOUT page info. Only use if you need to refresh element data. Returns: 14 specific element types (email-input, password-input, text-input, number-input, tel-input, url-input, date-input, file-input, dropdown, textarea, checkbox, radio, button, submit-button), labels extracted from multiple sources, current values, BOTH absolute pixels AND normalized 0-1 coordinates, grouped radio buttons by name. Prefer browser_inspectCurrentPage which gives you this PLUS page info.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
            }
        });
        this.toolRegistry.registerTool({
            id: 'browser_fillFormField',
            name: 'browser_fillFormField',
            description: 'The EASIEST way to fill forms. Finds field by label → clicks → fills in ONE atomic operation. Smart fuzzy matching: (1) Exact match (100%), (2) Contains match (50%), (3) Placeholder match (30%), (4) Name/ID match (20%). Handles all field types: text inputs set value, dropdowns select option, checkboxes/radios set checked state. Returns success with actual element used, or error with availableFields list to help debug. Use this for ALL form filling - much simpler than find → click → fill. Example: browser_fillFormField("Email", "user@example.com") matches "Email Address", "Email:", "Enter your email", etc.',
            category: 'browser',
            enabled: true,
            inputSchema: {
                type: 'object',
                properties: {
                    label: { type: 'string', description: 'Label text of the form field (e.g., "Email", "Password", "First Name"). Fuzzy matching supported - partial labels work!' },
                    value: { type: 'string', description: 'Value to fill in the field. For dropdowns: option value or text. For checkboxes/radios: "true"/"yes"/"1" to check.' },
                    tabId: { type: 'number', description: 'Optional tab ID (defaults to active tab)' },
                    browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                },
                required: ['label', 'value'],
            }
        });
    }
    getToolDefinitions() {
        // Return only enabled tools from registry
        return this.toolRegistry.getMCPToolDefinitions();
    }
    // Legacy method kept for reference - now returns empty array
    getToolDefinitions_legacy() {
        return [
            // Native tools
            {
                name: 'listApplications',
                description: 'List all running applications with their window bounds and identifiers.',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'focusApplication',
                description: 'Focus on a specific application by bundle ID or name.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        identifier: { type: 'string', description: 'Bundle ID or app name' },
                    },
                    required: ['identifier'],
                },
            },
            {
                name: 'screenshot',
                description: 'Take a screenshot of the focused application.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        padding: { type: 'number', description: 'Padding around window in pixels' },
                    },
                },
            },
            {
                name: 'click',
                description: 'Click at normalized coordinates (0-1) relative to focused window.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        x: { type: 'number', description: 'X coordinate (0-1)' },
                        y: { type: 'number', description: 'Y coordinate (0-1)' },
                        button: { type: 'string', enum: ['left', 'right'], description: 'Mouse button' },
                    },
                    required: ['x', 'y'],
                },
            },
            {
                name: 'getClickableElements',
                description: 'Get all clickable UI elements via Accessibility API.',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'typeText',
                description: 'Type text into the focused application.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        text: { type: 'string', description: 'Text to type' },
                    },
                    required: ['text'],
                },
            },
            {
                name: 'pressKey',
                description: 'Press keyboard key with optional modifiers.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Key to press (e.g., Enter, Command+L)' },
                    },
                    required: ['key'],
                },
            },
            {
                name: 'analyzeWithOCR',
                description: 'Analyze current screen using OCR.',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'checkPermissions',
                description: 'Check accessibility permission status.',
                inputSchema: { type: 'object', properties: {} },
            },
            // Browser tools
            {
                name: 'browser_listConnected',
                description: 'List connected browser extensions.',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'browser_getTabs',
                description: 'List all open browser tabs.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                    },
                },
            },
            {
                name: 'browser_getActiveTab',
                description: 'Get info about the currently active browser tab.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                    },
                },
            },
            {
                name: 'browser_getPageInfo',
                description: 'Get current page URL, title, and metadata.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tabId: { type: 'number' },
                        browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                    },
                },
            },
            {
                name: 'browser_getInteractiveElements',
                description: 'Get all interactive DOM elements (buttons, links, inputs).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tabId: { type: 'number' },
                        browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                    },
                },
            },
            {
                name: 'browser_clickElement',
                description: 'Click a DOM element by CSS selector.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'CSS selector' },
                        tabId: { type: 'number' },
                        browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                    },
                    required: ['selector'],
                },
            },
            {
                name: 'browser_fillElement',
                description: 'Fill a form field by CSS selector.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'CSS selector' },
                        value: { type: 'string', description: 'Value to fill' },
                        tabId: { type: 'number' },
                        browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                    },
                    required: ['selector', 'value'],
                },
            },
            {
                name: 'browser_executeScript',
                description: 'Execute JavaScript in page context.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        script: { type: 'string', description: 'JavaScript code' },
                        tabId: { type: 'number' },
                        browser: { type: 'string', enum: ['firefox', 'chrome', 'safari', 'edge'] },
                    },
                    required: ['script'],
                },
            },
        ];
    }
    start() {
        this.httpServer.listen(PORT, HOST, () => {
            console.log(`[SSE Server] MCP-Eyes SSE Server running on http://${HOST}:${PORT}`);
            console.log(`[SSE Server] Agent: ${AGENT_NAME}`);
            console.log(`[SSE Server] API Key: ${API_KEY.slice(0, 10)}...`);
            console.log('');
            console.log('[SSE Server] Endpoints:');
            console.log(`  SSE:      GET  http://${HOST}:${PORT}/mcp/sse`);
            console.log(`  Messages: POST http://${HOST}:${PORT}/mcp/messages`);
            console.log(`  Tools:    GET  http://${HOST}:${PORT}/mcp/tools`);
            console.log(`  Health:   GET  http://${HOST}:${PORT}/health`);
            console.log(`  Info:     GET  http://${HOST}:${PORT}/info`);
            console.log('');
            console.log('[SSE Server] For Open WebUI, configure MCP server with:');
            console.log(`  URL: http://<this-machine-ip>:${PORT}/mcp/sse`);
            console.log(`  API Key: ${API_KEY}`);
        });
    }
}
// Run the server
const server = new MCPSSEServer();
server.start();
//# sourceMappingURL=mcp-sse-server.js.map