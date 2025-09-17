# Contributing to MCP-Eyes

Thank you for your interest in contributing to MCP-Eyes! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- TypeScript >= 5.0.0
- Git
- Platform-specific development tools (see below)

### Development Setup

1. Fork the repository
2. Clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/mcp-eyes.git
   cd mcp-eyes
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Build the project:

   ```bash
   npm run build:all
   ```

## 🛠️ Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and single-purpose

### File Structure

```text
src/
├── index.ts                 # Basic server
├── enhanced-index.ts        # Full enhanced server
├── simplified-enhanced.ts   # Enhanced server
├── advanced-screenshot.ts   # Advanced screenshot server
├── cross-platform.ts        # Cross-platform server
├── coordinate-helper.ts     # Coordinate mapping utilities
├── window-bounds-helper.ts  # Window bounds utilities
└── nut-js-compat.ts        # nut.js compatibility layer

dist/                        # Compiled JavaScript output
test-screenshots/           # Test screenshots and debug logs
scripts/                    # Build and utility scripts
```

### Testing

- Add tests for new functionality
- Test on multiple platforms when possible
- Use the existing test files as examples
- Ensure all tests pass before submitting

### Platform-Specific Development

#### macOS

- Requires Screen Recording and Accessibility permissions
- Test with various applications (Safari, TextEdit, Finder)
- Verify multi-display functionality

#### Windows

- Test with PowerShell 5.1+ and PowerShell 7+
- Verify administrator rights handling
- Test with common Windows applications

#### Linux

- Ensure wmctrl is installed
- Test with X11 display server
- Verify window management functions

## 📝 Submitting Changes

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Add tests if applicable
4. Update documentation if needed
5. Ensure all tests pass
6. Submit a pull request

### Pull Request Guidelines

- Provide a clear description of changes
- Reference any related issues
- Include screenshots for UI changes
- Ensure the PR is up to date with main branch

### Commit Messages

Use clear, descriptive commit messages:

```text
feat: add multi-display screenshot support
fix: resolve coordinate mapping issues on Windows
docs: update README with new installation instructions
test: add integration tests for cross-platform server
```

## 🐛 Bug Reports

When reporting bugs, please include:

- Operating system and version
- Node.js version
- MCP-Eyes version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Error messages or logs

## 💡 Feature Requests

For feature requests, please:

- Check existing issues first
- Provide a clear description
- Explain the use case
- Consider implementation complexity
- Be open to discussion and feedback

## 🔧 Building and Testing

### Build Commands

```bash
# Build all variants
npm run build:all

# Build specific variant
npm run build:cross-platform
npm run build:enhanced
npm run build:advanced
npm run build:simplified
```

### Test Commands

```bash
# Test all variants
node test-all-versions.js

# Test cross-platform functionality
node test-cross-platform.js

# Test specific fixes
node test-fixes.js

# Test coordinate mapping
node test-coordinates.js
```

### Development Mode

```bash
# Watch mode for development
npm run dev

# Start specific server variant
npm run start:cross-platform
npm run start:enhanced
npm run start:advanced
```

## 📚 Documentation

### Code Documentation

- Add JSDoc comments for all public functions
- Include parameter types and return types
- Provide usage examples for complex functions
- Document any platform-specific behavior

### User Documentation

- Update README.md for user-facing changes
- Add examples for new features
- Update installation instructions if needed
- Document any breaking changes

## 🏗️ Architecture

### MCP Server Structure

Each server variant follows the same basic structure:

1. Import MCP SDK and platform-specific dependencies
2. Define tool schemas with parameters and descriptions
3. Implement tool handlers with error handling
4. Export server configuration

### Cross-Platform Considerations

- Use platform detection for conditional logic
- Provide fallbacks for unsupported features
- Handle platform-specific errors gracefully
- Test on all supported platforms

### Error Handling

- Use try-catch blocks for all external operations
- Provide meaningful error messages
- Log errors for debugging
- Handle permission errors gracefully

## 🤝 Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Follow the golden rule

### Communication

- Use clear, professional language
- Be patient with questions
- Provide helpful responses
- Stay on topic in discussions

## 📋 Release Process

### Versioning

We follow semantic versioning (SemVer):

- **Major** (1.0.0): Breaking changes
- **Minor** (1.1.0): New features, backward compatible
- **Patch** (1.1.1): Bug fixes, backward compatible

### Release Checklist

- [ ] All tests pass
- [ ] Documentation updated
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated
- [ ] Release notes prepared
- [ ] npm package published

## 🆘 Getting Help

If you need help:

- Check the [README](README.md) for basic usage
- Search existing [issues](https://github.com/datagram1/mcp-eyes/issues)
- Ask questions in [discussions](https://github.com/datagram1/mcp-eyes/discussions)
- Join our community chat (if available)

## 🙏 Recognition

Contributors will be recognized in:

- README.md contributors section
- Release notes
- GitHub contributors page
- Project documentation

Thank you for contributing to MCP-Eyes! 🚀
