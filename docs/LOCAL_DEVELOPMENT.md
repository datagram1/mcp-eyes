# Local Development Setup for MCP Eyes

This guide helps you run MCP Eyes locally for debugging and development purposes.

## Quick Start

### 1. Test Your Local Build
```bash
node test-local.js
```

### 2. Run Local Development Server
```bash
# Run advanced server
./local-dev.sh advanced

# Run basic server  
./local-dev.sh basic
```

### 3. Use with Cursor MCP

Copy the configuration from `local-mcp-config.json` to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "mcp-eyes-local": {
      "command": "node",
      "args": ["/Users/richardbrown/dev/mcp_eyes/dist/advanced-server-simple.js"],
      "env": {
        "USE_APPLE_WINDOW_MANAGER": "true",
        "USE_OCR": "true",
        "USE_LOCAL_LLM": "true",
        "LLM_PROVIDER": "lm-studio",
        "LLM_BASE_URL": "http://127.0.0.1:1234",
        "LLM_MODEL": "openai/gpt-oss-20b"
      }
    }
  }
}
```

## Files Created for Local Development

- `local-dev.sh` - Script to run local builds with environment variables
- `test-local.js` - Test script to verify build files and setup
- `local-mcp-config.json` - MCP configuration for Cursor
- `LOCAL_DEVELOPMENT.md` - This documentation

## Environment Variables

The local development setup automatically sets these environment variables:

- `USE_APPLE_WINDOW_MANAGER=true` - Enable Apple Window Manager
- `USE_OCR=true` - Enable OCR capabilities
- `USE_LOCAL_LLM=true` - Enable local LLM integration
- `LLM_PROVIDER=lm-studio` - Use LM Studio as LLM provider
- `LLM_BASE_URL=http://127.0.0.1:1234` - LM Studio API endpoint
- `LLM_MODEL=openai/gpt-oss-20b` - Model to use

## Direct Execution

You can also run the servers directly:

```bash
# Set environment variables
export USE_APPLE_WINDOW_MANAGER=true
export USE_OCR=true
export USE_LOCAL_LLM=true
export LLM_PROVIDER=lm-studio
export LLM_BASE_URL=http://127.0.0.1:1234
export LLM_MODEL=openai/gpt-oss-20b

# Run servers
node dist/advanced-server-simple.js
node dist/basic-server.js
```

## Building

If you need to rebuild:

```bash
npm run build
```

## Debugging Tips

1. **Check Build Files**: Run `node test-local.js` to verify all build files exist
2. **Environment Variables**: The local-dev.sh script automatically sets all required environment variables
3. **Direct Testing**: You can test individual components by running the built JavaScript files directly
4. **MCP Protocol**: The servers communicate via stdio, so they work with any MCP-compatible client

## Troubleshooting

- **Missing Build Files**: Run `npm run build` to compile TypeScript to JavaScript
- **Permission Errors**: Make sure the scripts are executable (`chmod +x local-dev.sh test-local.js`)
- **Environment Variables**: Check that all required environment variables are set
- **Dependencies**: Ensure all npm dependencies are installed (`npm install`)

## Development Workflow

1. Make changes to TypeScript files in `src/`
2. Run `npm run build` to compile changes
3. Test with `node test-local.js`
4. Run local development server with `./local-dev.sh advanced`
5. Test with Cursor using the local MCP configuration
