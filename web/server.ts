/**
 * ScreenControl Custom Next.js Server
 *
 * Combines the Next.js portal with the Control Server WebSocket handler.
 * This allows agents to connect via WebSocket while the portal runs on the same process.
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { handleAgentConnection } from './src/lib/control-server/websocket-handler';
import { agentRegistry } from './src/lib/control-server/agent-registry';
import os from 'os';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Get local IPs for display
function getLocalIPs(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name];
    if (addrs) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          ips.push(addr.address);
        }
      }
    }
  }
  return ips;
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // WebSocket server for agent connections
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '');

    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      // Reject non-/ws WebSocket connections
      socket.destroy();
    }
  });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket, req) => {
    handleAgentConnection(ws, req, agentRegistry);
  });

  // Heartbeat interval for connected agents
  const heartbeatInterval = setInterval(() => {
    const agents = agentRegistry.getAllAgents();
    for (const agent of agents) {
      if (agent.socket.readyState === WebSocket.OPEN) {
        agent.socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }
  }, 15000);

  // Cleanup on server close
  server.on('close', () => {
    clearInterval(heartbeatInterval);
    agentRegistry.cleanup();
  });

  server.listen(port, hostname, () => {
    const localIPs = getLocalIPs();
    console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║               ScreenControl Server v1.0.0                         ║
╠═══════════════════════════════════════════════════════════════════╣
║  Portal:      http://localhost:${port}                               ║
║  WebSocket:   ws://localhost:${port}/ws                              ║
║  API:         http://localhost:${port}/api                           ║
║  Environment: ${dev ? 'development' : 'production'}                                          ║
╠═══════════════════════════════════════════════════════════════════╣
║  Local IPs:   ${localIPs.length > 0 ? localIPs.join(', ').padEnd(52) : 'none'.padEnd(52)}║
╚═══════════════════════════════════════════════════════════════════╝
    `);
  });
});
