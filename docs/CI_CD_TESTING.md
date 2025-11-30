# CI/CD Testing System

## Overview

This project uses GitHub Actions for continuous integration and continuous deployment (CI/CD). The system automatically validates all changes to ensure the MCP server remains functional and compliant with the Model Context Protocol.

## Workflows

### Main CI Pipeline (`.github/workflows/ci.yml`)

The main CI pipeline runs on:
- **Push** to `main`, `master`, `develop`, or any `claude/**` branch
- **Pull requests** to `main`, `master`, or `develop`

#### Jobs

1. **Build and Test**
   - Runs on: Ubuntu Latest, macOS Latest
   - Node versions: 18.x, 20.x, 22.x
   - Steps:
     - Install dependencies
     - Verify version scripts exist
     - Build the project
     - Verify build output and executable permissions
     - Run validation tests
     - Run server startup tests
     - Lint markdown files

2. **Security Audit**
   - Runs: `npm audit` to check for security vulnerabilities
   - Level: Moderate and above

3. **Validate Package**
   - Tests: Package creation and contents
   - Verifies: Essential files are included in the npm package
   - Artifacts: Uploads the package for inspection

4. **Status Check**
   - Final check: Ensures all jobs passed
   - Fails: If any critical job fails

## Test Scripts

### 1. MCP Structure Validation (`tests/validate-mcp-structure.js`)

Validates that both MCP servers have:
- ✓ Correct tool definitions
- ✓ Proper handler implementations
- ✓ Valid MCP protocol compliance
- ✓ Feature parity where expected
- ✓ Correct dependencies
- ✓ Version consistency

**Run locally:**
```bash
npm run test:validate-mcp
```

**What it checks:**
- Source files exist and are valid
- MCP SDK imports are present
- Server initialization is correct
- StdioServerTransport is used
- All required tools are defined
- All tools have handler cases
- Error handling is implemented
- Response format is correct
- Build output exists
- Executable permissions (Unix)
- package.json configuration
- Version consistency

### 2. Server Startup Test (`tests/test-server-startup.js`)

Tests that both servers can start without crashing:
- ✓ Process starts successfully
- ✓ No immediate errors or crashes
- ✓ Proper initialization
- ✓ Graceful shutdown

**Run locally:**
```bash
npm run test:startup
```

**Platform handling:**
- Automatically skips platform-specific native modules (e.g., `node-mac-permissions` on Linux)
- Returns success (exit 0) if tests are skipped due to platform constraints
- This allows CI to pass on all platforms while still testing where possible

### 3. Full Test Suite

Run all tests together:
```bash
npm test
```

Or with build and linting:
```bash
npm run test:all
```

## Running Tests Locally

### Prerequisites
```bash
npm install
npm run build
```

### Run Individual Tests
```bash
# MCP structure validation
npm run test:validate-mcp

# Server startup test
npm run test:startup

# Markdown linting
npm run lint:md
```

### Run All Tests
```bash
npm test
```

## CI/CD Best Practices

### Before Committing

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Lint markdown:**
   ```bash
   npm run lint:md:fix
   ```

### Pull Request Checklist

- [ ] All tests pass locally
- [ ] Build succeeds without errors
- [ ] No new lint warnings
- [ ] Changes are documented
- [ ] Version updated if needed

### Handling CI Failures

#### Build Failures
- Check TypeScript compilation errors
- Verify all dependencies are installed
- Ensure version scripts exist

#### Test Failures
- Review test output in GitHub Actions logs
- Run tests locally to reproduce
- Check for platform-specific issues

#### Security Audit Failures
- Review vulnerability details
- Update affected packages
- Use `npm audit fix` if safe

## Continuous Deployment

### Automatic Checks

Every push triggers:
1. Multi-platform build verification
2. Test suite execution
3. Security scanning
4. Package validation

### Manual Deployment

To publish a new version:

```bash
# Bump version (patch/minor/major)
npm run version:patch

# Build clean
npm run build:clean

# Test everything
npm run test:all

# Publish
npm publish
```

## Adding New Tests

### 1. Create Test Script

Create a new test in the `tests/` directory:

```javascript
#!/usr/bin/env node

// Your test implementation
// Exit with 0 for success, 1 for failure
```

### 2. Add to package.json

```json
{
  "scripts": {
    "test:your-test": "node tests/your-test.js"
  }
}
```

### 3. Update Main Test Script

Add to the main test command:
```json
{
  "scripts": {
    "test": "npm run test:validate-mcp && npm run test:startup && npm run test:your-test"
  }
}
```

### 4. Update CI Workflow (if needed)

Add a step in `.github/workflows/ci.yml`:
```yaml
- name: Run your test
  run: npm run test:your-test
```

## Platform-Specific Considerations

### macOS
- Full test suite runs
- Native modules work (node-mac-permissions, @jxa/run)
- Screenshot and accessibility features testable

### Linux
- Structure validation runs
- Startup tests skip platform-specific modules
- CI passes with skipped tests

### Windows
- Build and validation tests run
- Platform-specific features may be skipped
- Native module compatibility varies

## Troubleshooting

### "Version script not found"
```bash
# Ensure scripts directory exists and has required files
ls scripts/
# Should see: update-version.js, bump-version.js
```

### "Build output not found"
```bash
# Run clean build
npm run build:clean
```

### "Executable permissions missing"
```bash
# Add executable permissions (Unix/macOS)
chmod +x dist/basic-server.js dist/advanced-server-simple.js
```

### "Platform-specific test failures"
- Expected on Linux/Windows when macOS-only modules are used
- Tests should skip gracefully with exit code 0
- Not considered a failure

## Contributing

When contributing to this project:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure all tests pass
5. Create a pull request
6. CI will automatically run
7. Address any CI failures
8. Wait for review

## Status Badges

Add these to your README to show CI status:

```markdown
![CI Status](https://github.com/datagram1/mcp-eyes/workflows/CI%2FCD%20Pipeline/badge.svg)
```

## Support

For CI/CD issues:
- Check GitHub Actions logs
- Review this documentation
- Open an issue with CI logs attached
