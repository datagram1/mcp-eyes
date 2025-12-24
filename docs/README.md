# ScreenControl Documentation

Welcome to the ScreenControl documentation. This guide covers all features of the cross-platform desktop and browser automation system.

## Getting Started

| Document | Description |
|----------|-------------|
| [Tool Selection Guide](tool-selection-guide.md) | **Start here** - Decision trees for choosing the right tool |
| [claude_mcp_setup.md](claude_mcp_setup.md) | Setting up ScreenControl with Claude MCP |
| [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) | Development environment setup |

## Core Features

### Desktop Automation

| Document | Description |
|----------|-------------|
| [Desktop Automation](desktop-automation.md) | Screenshots, mouse, keyboard, and app management |
| [Grid Tools](grid-tools.md) | Visual grid-based clicking for native apps |
| [Multi-Monitor Support](multi-monitor.md) | Working with multiple displays |

### Browser Automation

| Document | Description |
|----------|-------------|
| [Browser Automation](browser-automation.md) | Browser extension tools for web automation |
| [MCP Dynamic Tools](mcp-dynamic-tools.md) | Dynamic tool registration |

### Filesystem & Shell

| Document | Description |
|----------|-------------|
| [Filesystem & Shell](filesystem-shell.md) | File operations and shell command execution |

## Platform-Specific Guides

| Document | Description |
|----------|-------------|
| [Linux Grid Tools](linux_grid_tools.md) | Grid tools on Linux |
| [Linux Dependency Installer](linux_dependency_installer.md) | Installing dependencies on Linux |
| [Linux Agent Docs](linux_agent_docs.md) | Linux agent documentation |
| [Windows Agent Install](windows_agent_install.md) | Windows installation guide |
| [Cross Compilation Notes](cross_compilation_notes.md) | Building for multiple platforms |

## Development & CI/CD

| Document | Description |
|----------|-------------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines |
| [CI/CD Pipeline](CI_CD_PIPELINE.md) | Continuous integration setup |
| [CI/CD Monitoring](CI_CD_MONITORING.md) | Monitoring build status |
| [CI/CD Testing](CI_CD_TESTING.md) | Test automation |
| [Version Management](VERSION_MANAGEMENT.md) | Version numbering and releases |
| [Auto Update Plan](AUTO_UPDATE_PLAN.md) | Automatic update system |

## Troubleshooting & Reference

| Document | Description |
|----------|-------------|
| [Logging System](LOGGING_SYSTEM.md) | Debug logging configuration |
| [Crash Analysis](CRASH_ANALYSIS_AND_FIXES.md) | Common crashes and fixes |
| [Screenshot Debug Report](SCREENSHOT_DEBUG_REPORT.md) | Screenshot troubleshooting |
| [LLM Config Examples](llm-config-examples.md) | Example configurations for AI assistants |

## Quick Reference

### Most Common Tools

| Task | Tool | Fallback |
|------|------|----------|
| Click web button | `browser_clickElement` | `screenshot_grid` + `click_grid` |
| Click native app button | `screenshot_grid` + `click_grid` | `click_relative` |
| Fill web form | `browser_fillElement` | `click_grid` + `typeText` |
| Type text | `typeText` | `pressKey` |
| Take screenshot | `screenshot_grid` | `screenshot` or `screenshot_app` |
| Read web page | `browser_getVisibleText` | OCR via `screenshot_grid` |
| Navigate browser | `browser_navigate` | `browser_createTab` |

### Tool Categories

1. **Browser Tools** (`browser_*`) - For web page automation via extension
2. **Grid Tools** (`screenshot_grid`, `click_grid`, `click_relative`) - For native apps and blocked sites
3. **Desktop Tools** (`screenshot`, `typeText`, `pressKey`) - System-level automation
4. **App Tools** (`launchApplication`, `focusApplication`, `closeApp`) - Application management
5. **File Tools** (`fs_*`) - Filesystem operations
6. **Shell Tools** (`shell_*`) - Command execution

## Version History

See the main [README.md](../README.md) for version history and changelog.

## Support

For issues and feature requests, please visit the [GitHub repository](https://github.com/anthropics/screen-control).
