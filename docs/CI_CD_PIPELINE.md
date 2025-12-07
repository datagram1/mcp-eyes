# CI/CD Pipeline Documentation

This document describes the automated testing and release pipeline for ScreenControl.

## Overview

The CI/CD system consists of two main workflows:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **CI Pipeline** (`ci.yml`) | Push/PR to main, develop | Build, test, and validate |
| **Release Pipeline** (`release.yml`) | Version tags (`v*.*.*`) | Build and publish releases |

## CI Pipeline

### Trigger Conditions

- Push to `main`, `master`, `develop`, or `claude/**` branches
- Pull requests targeting `main`, `master`, or `develop`

### Jobs

#### 1. Build and Test (TypeScript)

Runs on multiple OS and Node.js versions:
- **OS**: Ubuntu, macOS
- **Node.js**: 20.x, 22.x

Steps:
1. Install dependencies (`npm ci`)
2. Verify version scripts exist
3. Build project (`npm run build`)
4. Verify build output and executable permissions
5. Run tests (`npm test`)
6. Lint markdown files

#### 2. Build macOS Agent

Builds both Debug and Release configurations:

**Debug Build**:
- Includes TestServer for automated testing
- Verified: TestServer symbols present in binary

**Release Build**:
- TestServer excluded (security check)
- Verified: No TestServer symbols in binary

```bash
# Verification command
nm build/Build/Products/Release/ScreenControl.app/Contents/MacOS/ScreenControl | grep -q "TestServer"
# Must return no matches for Release
```

#### 3. Test macOS Agent

Uses the TestServer API to verify agent functionality:
1. Start debug agent
2. Wait for TestServer (port 3456)
3. Test endpoints:
   - `ping` - Health check
   - `getState` - Connection state
   - `getFields` - Field values
   - `setField` - Modify settings
   - `getLogs` - Retrieve logs
4. Stop agent

#### 4. Security Audit

Runs `npm audit` to check for vulnerabilities.

#### 5. Validate Package

Verifies the npm package:
1. Build project
2. Create package (`npm pack`)
3. Verify essential files are included

## Release Pipeline

### Trigger Conditions

- Push of version tags: `v*.*.*` (e.g., `v1.2.3`)
- Manual workflow dispatch with version input

### Jobs

#### 1. Validate Release

- Determine version from tag or input
- Verify package version matches
- Run tests

#### 2. Build NPM Package

- Build TypeScript
- Create `.tgz` package
- Upload as artifact

#### 3. Build macOS Agent

- Build Release configuration
- Verify no TestServer in release
- Create DMG installer
- Create ZIP archive
- Upload both as artifacts

#### 4. Test macOS Release

- Download and extract ZIP
- Verify binary is executable

#### 5. Build Web Platform

- Build Next.js application
- Generate Prisma client
- Create deployment bundle (`.tar.gz`)

#### 6. Create GitHub Release

Assembles all artifacts and creates release:

- `ScreenControl-{version}-macOS.dmg`
- `ScreenControl-{version}-macOS.zip`
- `mcp-eyes-{version}.tgz`
- `web-bundle-{version}.tar.gz`

#### 7. Publish to NPM

Auto-publishes to npm registry on version tags.

## Local Testing

### Quick Agent Test

```bash
# Run quick health check
./scripts/test-agent.sh --quick
```

### Full Agent Test

```bash
# Run all integration tests
./scripts/test-agent.sh
```

### Test with Control Server

```bash
# Also test connection to local control server
./scripts/test-agent.sh --with-server
```

### Test Script Options

| Option | Description |
|--------|-------------|
| `--quick` | Quick health check only (ping + debug verification) |
| `--with-server` | Also test connection to local control server |

### Environment Variables

```bash
TEST_SERVER_URL=http://localhost:3456  # TestServer URL
CONTROL_SERVER_URL=ws://localhost:3000/ws  # Control server WebSocket URL
```

## Creating a Release

### Automated (Recommended)

1. Update version in `package.json`
2. Commit changes
3. Create and push version tag:
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```
4. GitHub Actions builds and publishes automatically

### Manual Release

1. Go to Actions > Release > Run workflow
2. Enter version (e.g., `1.2.3`)
3. Optionally mark as pre-release
4. Run workflow

## Artifacts

### Build Artifacts

Retained for 7 days:
- `ScreenControl-Debug-macOS` - Debug build with TestServer
- `npm-package-{sha}` - NPM package

### Release Artifacts

Retained for 30 days:
- `ScreenControl-Release-macOS` - Release build
- `macos-dmg` - DMG installer
- `macos-zip` - ZIP archive
- `npm-package` - NPM package
- `web-bundle` - Web deployment bundle

## Security Checks

### TestServer Exclusion

The CI pipeline verifies that TestServer is:
- **INCLUDED** in Debug builds (for automated testing)
- **EXCLUDED** from Release builds (security requirement)

This is enforced by checking binary symbols:
```bash
# Debug: must find TestServer
nm Debug/ScreenControl.app/.../ScreenControl | grep -q "TestServer"

# Release: must NOT find TestServer
nm Release/ScreenControl.app/.../ScreenControl | grep -q "TestServer" && exit 1
```

### Dependency Audit

`npm audit` runs on every CI build to detect vulnerable dependencies.

## Troubleshooting

### TestServer Not Responding

1. Ensure running a DEBUG build
2. Check port availability: `lsof -i :3456`
3. Review agent logs in Console.app

### Build Failures

1. Check Xcode version compatibility
2. Verify signing configuration
3. Review build logs in GitHub Actions

### Release Publish Failures

1. Verify `NPM_TOKEN` secret is set
2. Check package version isn't already published
3. Ensure `GITHUB_TOKEN` has write permissions

## Future Enhancements

- Windows agent build (via self-hosted runner or VM)
- Linux agent build
- Automated performance regression testing
- Visual regression testing with screenshots
- Multi-region deployment testing
