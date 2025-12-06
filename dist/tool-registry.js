#!/usr/bin/env node
"use strict";
/**
 * Tool Registry
 *
 * Manages tool configuration and enables/disables tools per profile.
 * Configuration is stored in tools.json (macOS: ~/Library/Application Support/MCPEyes/tools.json,
 * fallback: ~/.mcp-eyes-tools.json).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
class ToolRegistry {
    config = null;
    configPath;
    registeredTools = new Map();
    constructor(configPath) {
        // macOS: prefer ~/Library/Application Support/MCPEyes/tools.json
        // Fallback: ~/.mcp-eyes-tools.json
        if (configPath) {
            this.configPath = configPath;
        }
        else {
            const home = os.homedir();
            const platform = process.platform;
            if (platform === 'darwin') {
                const appSupport = path.join(home, 'Library', 'Application Support', 'MCPEyes');
                // Ensure directory exists
                if (!fs.existsSync(appSupport)) {
                    fs.mkdirSync(appSupport, { recursive: true });
                }
                this.configPath = path.join(appSupport, 'tools.json');
            }
            else {
                this.configPath = path.join(home, '.mcp-eyes-tools.json');
            }
        }
        this.loadConfig();
    }
    /**
     * Load configuration from tools.json
     * If file doesn't exist, create default config with all tools enabled
     */
    loadConfig() {
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
            }
            else {
                // Create default config
                this.config = this.createDefaultConfig();
                this.saveConfig();
            }
        }
        catch (error) {
            console.error('[ToolRegistry] Failed to load config:', error);
            this.config = this.createDefaultConfig();
        }
    }
    /**
     * Save configuration to tools.json
     */
    saveConfig() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        }
        catch (error) {
            console.error('[ToolRegistry] Failed to save config:', error);
            throw error;
        }
    }
    /**
     * Create default configuration with all registered tools enabled
     */
    createDefaultConfig() {
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
    registerTool(tool) {
        this.registeredTools.set(tool.id, tool);
        // If config doesn't have this tool yet, add it to the active profile
        if (this.config) {
            const activeProfile = this.config.profiles.find(p => p.id === this.config.activeProfile);
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
                }
                else {
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
    getEnabledTools() {
        if (!this.config) {
            return [];
        }
        const activeProfile = this.config.profiles.find(p => p.id === this.config.activeProfile);
        if (!activeProfile || !activeProfile.enabled) {
            return [];
        }
        const enabledTools = [];
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
    getMCPToolDefinitions() {
        return this.getEnabledTools().map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
        }));
    }
    /**
     * Check if a tool is enabled
     */
    isToolEnabled(toolId) {
        const enabledTools = this.getEnabledTools();
        return enabledTools.some(tool => tool.id === toolId || tool.name === toolId);
    }
    /**
     * Get full tool definition by ID or name
     */
    getTool(toolId) {
        return this.registeredTools.get(toolId) ||
            Array.from(this.registeredTools.values()).find(t => t.name === toolId);
    }
    /**
     * Get category label (human-readable)
     */
    getCategoryLabel(categoryId) {
        const labels = {
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
    getConfig() {
        return this.config;
    }
    /**
     * Update configuration (from UI)
     */
    updateConfig(config) {
        this.config = config;
        this.saveConfig();
    }
}
exports.ToolRegistry = ToolRegistry;
//# sourceMappingURL=tool-registry.js.map