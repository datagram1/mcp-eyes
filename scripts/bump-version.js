#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const bumpType = process.argv[2];

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: node bump-version.js <patch|minor|major>');
  process.exit(1);
}

// Read current version
const versionPath = path.join(__dirname, '..', 'version.json');
const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));

let { major, minor, patch } = versionData;

// Bump version based on type
switch (bumpType) {
  case 'major':
    major++;
    minor = 0;
    patch = 0;
    break;
  case 'minor':
    minor++;
    patch = 0;
    break;
  case 'patch':
    patch++;
    break;
}

const newVersion = `${major}.${minor}.${patch}`;
const today = new Date().toISOString().split('T')[0];

// Update version.json
versionData.version = newVersion;
versionData.major = major;
versionData.minor = minor;
versionData.patch = patch;
versionData.build = today;

fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n');
console.log(`✓ Bumped version to ${newVersion}`);

// Run update-version to sync all files
const { execSync } = require('child_process');
try {
  execSync('npm run update-version', { stdio: 'inherit' });
} catch (error) {
  console.error('Failed to update version in all files');
  process.exit(1);
}

console.log(`Version bumped successfully from ${versionData.major - (bumpType === 'major' ? 1 : 0)}.${versionData.minor - (bumpType === 'minor' ? 1 : 0)}.${versionData.patch - (bumpType === 'patch' ? 1 : 0)} to ${newVersion}!`);
