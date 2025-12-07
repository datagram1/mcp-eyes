/**
 * ScreenControl Control Server Types
 */

import { WebSocket } from 'ws';

// ═══════════════════════════════════════════════════════════════════════════
// Agent Types
// ═══════════════════════════════════════════════════════════════════════════

export type PowerState = 'ACTIVE' | 'PASSIVE' | 'SLEEP';
export type AgentState = 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED';
export type OSType = 'WINDOWS' | 'MACOS' | 'LINUX';

export interface ConnectedAgent {
  // Connection identity
  id: string;                  // Connection session ID (ephemeral)
  dbId?: string;               // Database ID (persistent)
  socket: WebSocket;
  remoteAddress: string;
  isInternal: boolean;

  // Agent identity (from registration)
  customerId?: string;         // From stamped installer
  licenseUuid?: string;        // Issued on activation
  licenseStatus?: 'active' | 'pending' | 'expired' | 'blocked';
  machineId?: string;          // Hardware identifier
  machineName?: string;

  // System info
  osType: OSType;
  osVersion?: string;
  arch?: string;
  agentVersion?: string;

  // Fingerprinting
  fingerprint?: string;        // SHA256 hash
  fingerprintRaw?: FingerprintData;

  // State
  state: AgentState;
  powerState: PowerState;
  isScreenLocked: boolean;
  currentTask?: string;

  // Timestamps
  connectedAt: Date;
  lastPing: Date;
  lastActivity: Date;

  // Capabilities (cached from agent on connect)
  tools?: MCPTool[];
  toolsFetchedAt?: Date;
  resources?: MCPResource[];
  prompts?: MCPPrompt[];

  // Pending requests (for request/response correlation)
  pendingRequests: Map<string, PendingRequest>;
}

// ═══════════════════════════════════════════════════════════════════════════
// MCP Capability Types
// ═══════════════════════════════════════════════════════════════════════════

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface FingerprintData {
  cpuModel?: string;
  cpuCores?: number;
  totalMemory?: number;
  diskSerial?: string;
  motherboardUuid?: string;
  macAddresses?: string[];
  hostname?: string;
  username?: string;
}

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  startedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// Message Types
// ═══════════════════════════════════════════════════════════════════════════

// Messages FROM agent TO control server
export interface AgentMessage {
  type: 'register' | 'response' | 'pong' | 'error' | 'heartbeat' | 'state_change';
  id?: string;

  // Registration data
  customerId?: string;
  licenseUuid?: string;
  machineId?: string;
  machineName?: string;
  osType?: string;
  osVersion?: string;
  arch?: string;
  agentVersion?: string;
  fingerprint?: FingerprintData;
  agentSecret?: string;  // API key for re-authentication after token expiry

  // Response data
  result?: unknown;
  error?: string;

  // State change data
  powerState?: PowerState;
  isScreenLocked?: boolean;
  currentTask?: string;
}

// Messages FROM control server TO agent
export interface CommandMessage {
  type: 'request' | 'ping' | 'command' | 'config';
  id: string;
  method?: string;
  params?: Record<string, unknown>;

  // Config updates
  config?: {
    heartbeatInterval?: number;
    powerState?: PowerState;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MCP Types
// ═══════════════════════════════════════════════════════════════════════════

export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// Registry Interface (for future Redis implementation)
// ═══════════════════════════════════════════════════════════════════════════

export interface IAgentRegistry {
  // Connection management
  register(socket: WebSocket, msg: AgentMessage, remoteAddress: string): Promise<ConnectedAgent | null>;
  unregister(agentId: string): void;

  // Lookups
  getAgent(agentId: string): ConnectedAgent | undefined;
  getAgentByMachineId(machineId: string): ConnectedAgent | undefined;
  getAgentsByCustomerId(customerId: string): ConnectedAgent[];
  getAllAgents(): ConnectedAgent[];

  // Commands
  sendCommand(agentId: string, method: string, params?: Record<string, unknown>): Promise<unknown>;
  handleResponse(agent: ConnectedAgent, msg: AgentMessage): void;

  // State updates
  updatePing(agent: ConnectedAgent): void;
  updateState(agent: ConnectedAgent, state: Partial<ConnectedAgent>): void;

  // Cleanup
  cleanup(): void;
}
