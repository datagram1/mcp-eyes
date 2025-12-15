#!/usr/bin/env node

/**
 * Tool Registry
 * 
 * Manages tool configuration and enables/disables tools per profile.
 * Configuration is stored in tools.json (macOS: ~/Library/Application Support/MCPEyes/tools.json,
 * fallback: ~/.mcp-eyes-tools.json).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

export class ToolRegistry {
  private config: ToolRegistryConfig | null = null;
  private configPath: string;
  private registeredTools: Map<string, ToolDefinition> = new Map();

  constructor(configPath?: string) {
    // macOS: prefer ~/Library/Application Support/MCPEyes/tools.json
    // Fallback: ~/.mcp-eyes-tools.json
    if (configPath) {
      this.configPath = configPath;
    } else {
      const home = os.homedir();
      const platform = process.platform;
      
      if (platform === 'darwin') {
        const appSupport = path.join(home, 'Library', 'Application Support', 'MCPEyes');
        // Ensure directory exists
        if (!fs.existsSync(appSupport)) {
          fs.mkdirSync(appSupport, { recursive: true });
        }
        this.configPath = path.join(appSupport, 'tools.json');
      } else {
        this.configPath = path.join(home, '.mcp-eyes-tools.json');
      }
    }
    
    this.loadConfig();
  }

  /**
   * Load configuration from tools.json
   * If file doesn't exist, create default config with all tools enabled
   */
  loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(content);
        // Validate config structure
        if (!this.config || !this.config.profiles || !Array.isArray(this.config.profiles)) {
          console.warn('[ToolRegistry] Invalid config structure, creating default');
          this.config = this.createDefaultConfig();
          this.saveConfig();
        }
      } else {
        // Create default config
        this.config = this.createDefaultConfig();
        this.saveConfig();
      }
    } catch (error) {
      console.error('[ToolRegistry] Failed to load config:', error);
      this.config = this.createDefaultConfig();
    }
  }

  /**
   * Save configuration to tools.json
   */
  saveConfig(): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('[ToolRegistry] Failed to save config:', error);
      throw error;
    }
  }

  /**
   * Create default configuration with all registered tools enabled
   */
  private createDefaultConfig(): ToolRegistryConfig {
    return {
      version: 1,
      activeProfile: 'default',
      profiles: [
        {
          id: 'default',
          label: 'Default',
          enabled: true,
          categories: []
        }
      ]
    };
  }

  /**
   * Register a tool (called during server initialization)
   */
  registerTool(tool: ToolDefinition): void {
    this.registeredTools.set(tool.id, tool);
    
    // If config doesn't have this tool yet, add it to the active profile
    if (this.config) {
      const activeProfile = this.config.profiles.find(p => p.id === this.config!.activeProfile);
      if (activeProfile) {
        let category = activeProfile.categories.find(c => c.id === tool.category);
        if (!category) {
          category = {
            id: tool.category,
            label: this.getCategoryLabel(tool.category),
            enabled: true,
            tools: []
          };
          activeProfile.categories.push(category);
        }
        
        // Check if tool already exists in category
        const existingTool = category.tools.find(t => t.id === tool.id);
        if (!existingTool) {
          category.tools.push({
            ...tool,
            enabled: tool.enabled !== undefined ? tool.enabled : true
          });
        } else {
          // Update existing tool definition but preserve enabled state from config
          const existingIndex = category.tools.findIndex(t => t.id === tool.id);
          if (existingIndex >= 0) {
            category.tools[existingIndex] = {
              ...tool,
              enabled: category.tools[existingIndex].enabled
            };
          }
        }
      }
    }
  }

  /**
   * Get enabled tools for MCP (only tools that are enabled in active profile)
   */
  getEnabledTools(): ToolDefinition[] {
    if (!this.config) {
      return [];
    }

    const activeProfile = this.config.profiles.find(p => p.id === this.config!.activeProfile);
    if (!activeProfile || !activeProfile.enabled) {
      return [];
    }

    const enabledTools: ToolDefinition[] = [];

    for (const category of activeProfile.categories) {
      if (!category.enabled) {
        continue;
      }

      for (const tool of category.tools) {
        if (tool.enabled) {
          // Get full tool definition from registered tools
          const registeredTool = this.registeredTools.get(tool.id);
          if (registeredTool) {
            enabledTools.push({
              ...registeredTool,
              enabled: true
            });
          }
        }
      }
    }

    return enabledTools;
  }

  /**
   * Get MCP tool definitions (for list_tools response)
   */
  getMCPToolDefinitions(): any[] {
    return this.getEnabledTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  /**
   * Check if a tool is enabled
   */
  isToolEnabled(toolId: string): boolean {
    const enabledTools = this.getEnabledTools();
    return enabledTools.some(tool => tool.id === toolId || tool.name === toolId);
  }

  /**
   * Get full tool definition by ID or name
   */
  getTool(toolId: string): ToolDefinition | undefined {
    return this.registeredTools.get(toolId) || 
           Array.from(this.registeredTools.values()).find(t => t.name === toolId);
  }

  /**
   * Get category label (human-readable)
   */
  private getCategoryLabel(categoryId: string): string {
    const labels: Record<string, string> = {
      'filesystem': 'Filesystem Tools',
      'shell': 'Shell Tools',
      'browser': 'Browser Tools',
      'gui': 'GUI Tools',
      'ssh': 'SSH Tools'
    };
    return labels[categoryId] || categoryId;
  }

  /**
   * Get current configuration (for UI)
   */
  getConfig(): ToolRegistryConfig | null {
    return this.config;
  }

  /**
   * Update configuration (from UI)
   */
  updateConfig(config: ToolRegistryConfig): void {
    this.config = config;
    this.saveConfig();
  }
}

