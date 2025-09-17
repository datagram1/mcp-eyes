# Version Management System

This project uses a centralized version management system to ensure all files maintain consistent version numbers.

## Centralized Version File

The version is stored in `version.json`:

```json
{
  "version": "1.1.1",
  "major": 1,
  "minor": 1,
  "patch": 1,
  "build": "2024-09-17",
  "description": "Centralized version information for mcp-eyes package"
}
```

## Available Scripts

### Update Version in All Files

```bash
npm run update-version
```

Updates all files to use the current version from `version.json`.

### Bump Version

```bash
# Patch version (1.1.1 → 1.1.2)
npm run version:patch

# Minor version (1.1.1 → 1.2.0)
npm run version:minor

# Major version (1.1.1 → 2.0.0)
npm run version:major
```

### Manual Version Bump

```bash
# Bump to specific type
npm run bump-version patch
npm run bump-version minor
npm run bump-version major
```

## Files Updated Automatically

The version management system updates the following files:

- `package.json` - Main package version
- `package-lock.json` - Lock file version
- `src/*.ts` - TypeScript source files
- `src/*.js` - JavaScript source files
- `IMPROVEMENTS_SUMMARY.md` - Documentation references

## Build Integration

The build process automatically updates versions:

```bash
npm run build
```

This runs `update-version` before TypeScript compilation to ensure all files are synchronized.

## Workflow

1. **Development**: Make changes to code
2. **Version Bump**: Run appropriate version bump command
3. **Build**: Run `npm run build` to compile with updated versions
4. **Publish**: Run `npm publish` to publish to NPM

## Manual Version Updates

If you need to manually update the version in `version.json`:

1. Edit `version.json` with the new version
2. Run `npm run update-version` to sync all files
3. Run `npm run build` to compile

## Verification

To verify all files have consistent versions:

```bash
# Check version in package.json
npm version

# Check version in source files
grep -r "version:" src/

# Check version in documentation
grep -r "1\.1\." *.md
```

This system ensures version consistency across the entire project and simplifies the release process.
