# LLM Provider Configuration Examples

The web content detector supports multiple LLM providers. Create a `llm-config.json` file in the project root to configure your preferred provider.

## Supported Providers

### 1. LM Studio (Default)

```json
{
  "provider": "lm-studio",
  "baseUrl": "http://127.0.0.1:1234",
  "model": "openai/gpt-oss-20b"
}
```

### 2. Ollama

```json
{
  "provider": "ollama",
  "baseUrl": "http://127.0.0.1:11434",
  "model": "llama3.2",
  "visionModel": "llava"
}
```

### 3. Claude (Anthropic)

```json
{
  "provider": "claude",
  "apiKey": "your-claude-api-key-here",
  "model": "claude-3-5-sonnet-20241022"
}
```

Or set environment variable:

```bash
export CLAUDE_API_KEY="your-claude-api-key-here"
```

### 4. OpenAI

```json
{
  "provider": "openai",
  "apiKey": "your-openai-api-key-here",
  "model": "gpt-4o"
}
```

Or set environment variable:

```bash
export OPENAI_API_KEY="your-openai-api-key-here"
```

### 5. OpenRouter

```json
{
  "provider": "openrouter",
  "apiKey": "your-openrouter-api-key-here",
  "model": "anthropic/claude-3.5-sonnet"
}
```

Or set environment variable:

```bash
export OPENROUTER_API_KEY="your-openrouter-api-key-here"
```

## Configuration Options

- **provider**: Required. One of: `lm-studio`, `ollama`, `claude`, `openai`, `openrouter`
- **baseUrl**: Optional. Override default URL for the provider
- **apiKey**: Optional. API key for the provider (can also use environment variables)
- **model**: Optional. Override default model for the provider
- **visionModel**: Optional. Specific model for vision tasks (used by Ollama)

## Environment Variables

You can use environment variables instead of putting API keys in the config file:

- `CLAUDE_API_KEY` - For Claude provider
- `OPENAI_API_KEY` - For OpenAI provider
- `OPENROUTER_API_KEY` - For OpenRouter provider

## Vision Support

The system automatically detects if your configured provider supports vision/image analysis:

- **LM Studio**: Depends on the loaded model
- **Ollama**: Supports vision with models like `llava`
- **Claude**: Full vision support
- **OpenAI**: Full vision support with `gpt-4o`
- **OpenRouter**: Depends on the selected model

## Usage

1. Copy the example config: `cp llm-config.json.example llm-config.json`
2. Edit `llm-config.json` with your preferred provider settings
3. Set API keys via environment variables if using paid providers
4. Run the web-aware server: `npm run start:web`

The system will automatically use your configured provider for web content analysis.
