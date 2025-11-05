#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read version from version.json
const versionPath = path.join(__dirname, '..', 'version.json');
const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
const version = versionData.version;

console.log(`Updating version to ${version}...`);

// Update package.json
const packagePath = path.join(__dirname, '..', 'package.json');
const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageData.version = version;
fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2) + '\n');
console.log(`✓ Updated package.json to ${version}`);

// Update package-lock.json if it exists
const packageLockPath = path.join(__dirname, '..', 'package-lock.json');
if (fs.existsSync(packageLockPath)) {
  const packageLockData = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  packageLockData.version = version;
  if (packageLockData.packages && packageLockData.packages['']) {
    packageLockData.packages[''].version = version;
  }
  fs.writeFileSync(packageLockPath, JSON.stringify(packageLockData, null, 2) + '\n');
  console.log(`✓ Updated package-lock.json to ${version}`);
}

// Update TypeScript source files
const srcPath = path.join(__dirname, '..', 'src');
if (fs.existsSync(srcPath)) {
  const files = fs.readdirSync(srcPath);
  files.forEach(file => {
    if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      const filePath = path.join(srcPath, file);
      let content = fs.readFileSync(filePath, 'utf8');

      // Update Server constructor version
      const versionRegex = /version:\s*['"][\d.]+['"]/g;
      if (content.match(versionRegex)) {
        content = content.replace(versionRegex, `version: '${version}'`);
        fs.writeFileSync(filePath, content);
        console.log(`✓ Updated ${file} to ${version}`);
      }
    }
  });
}

console.log('Version update complete!');
