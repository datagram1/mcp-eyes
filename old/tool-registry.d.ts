#!/usr/bin/env node
/**
 * Tool Registry
 *
 * Manages tool configuration and enables/disables tools per profile.
 * Configuration is stored in tools.json (macOS: ~/Library/Application Support/MCPEyes/tools.json,
 * fallback: ~/.mcp-eyes-tools.json).
 */
export interface ToolDefinition {
    id: string;
    name: string;
    description: string;
    category: string;
    inputSchema: any;
    enabled: boolean;
}
export interface ToolCategory {
    id: string;
    label: string;
    enabled: boolean;
    tools: ToolDefinition[];
}
export interface ToolProfile {
    id: string;
    label: string;
    enabled: boolean;
    categories: ToolCategory[];
}
export interface ToolRegistryConfig {
    version: number;
    activeProfile: string;
    profiles: ToolProfile[];
}
export declare class ToolRegistry {
    private config;
    private configPath;
    private registeredTools;
    constructor(configPath?: string);
    /**
     * Load configuration from tools.json
     * If file doesn't exist, create default config with all tools enabled
     */
    loadConfig(): void;
    /**
     * Save configuration to tools.json
     */
    saveConfig(): void;
    /**
     * Create default configuration with all registered tools enabled
     */
    private createDefaultConfig;
    /**
     * Register a tool (called during server initialization)
     */
    registerTool(tool: ToolDefinition): void;
    /**
     * Get enabled tools for MCP (only tools that are enabled in active profile)
     */
    getEnabledTools(): ToolDefinition[];
    /**
     * Get MCP tool definitions (for list_tools response)
     */
    getMCPToolDefinitions(): any[];
    /**
     * Check if a tool is enabled
     */
    isToolEnabled(toolId: string): boolean;
    /**
     * Get full tool definition by ID or name
     */
    getTool(toolId: string): ToolDefinition | undefined;
    /**
     * Get category label (human-readable)
     */
    private getCategoryLabel;
    /**
     * Get current configuration (for UI)
     */
    getConfig(): ToolRegistryConfig | null;
    /**
     * Update configuration (from UI)
     */
    updateConfig(config: ToolRegistryConfig): void;
}
//# sourceMappingURL=tool-registry.d.ts.map