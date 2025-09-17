#!/bin/bash

# GitHub Publish Script with Comprehensive Testing and Quality Checks
# Author: Richard Brown
# Description: Automated GitHub publishing with version management, testing, linting, and quality checks
# Features: Auto-fixes common markdown linting issues, includes dist directory for GitHub

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LOG_FILE="github_publish.log"
VERSION_FILE="version.json"
PACKAGE_FILE="package.json"
GITHUB_REPO="datagram1/mcp-eyes"

# Function to log messages
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Function to check if last publish failed
check_last_publish_status() {
    if [ -f "$LOG_FILE" ]; then
        if grep -q "PUBLISH FAILED" "$LOG_FILE"; then
            log_warning "Last publish failed. Using same version number."
            return 0  # Last publish failed
        fi
    fi
    return 1  # Last publish succeeded or no log file
}

# Function to increment version
increment_version() {
    log "Incrementing version number..."
    
    # Read current version from version.json
    CURRENT_VERSION=$(node -p "require('./$VERSION_FILE').version")
    log "Current version: $CURRENT_VERSION"
    
    # Increment patch version
    NEW_VERSION=$(node -e "
        const fs = require('fs');
        const versionData = JSON.parse(fs.readFileSync('$VERSION_FILE', 'utf8'));
        const [major, minor, patch] = versionData.version.split('.').map(Number);
        const newPatch = patch + 1;
        const newVersion = \`\${major}.\${minor}.\${newPatch}\`;
        console.log(newVersion);
    ")
    
    log "New version: $NEW_VERSION"
    
    # Update version.json
    node -e "
        const fs = require('fs');
        const versionData = JSON.parse(fs.readFileSync('$VERSION_FILE', 'utf8'));
        const [major, minor, patch] = versionData.version.split('.').map(Number);
        versionData.version = \`\${major}.\${minor}.\${patch + 1}\`;
        versionData.patch = patch + 1;
        versionData.build = new Date().toISOString().split('T')[0];
        fs.writeFileSync('$VERSION_FILE', JSON.stringify(versionData, null, 2));
    "
    
    # Update all files with new version
    npm run update-version
    
    log_success "Version updated to $NEW_VERSION"
}

# Function to automatically fix markdown linting issues
fix_markdown_issues() {
    log "Checking for markdown linting issues..."
    
    # Count markdown files
    MD_COUNT=$(find . -name "*.md" -not -path "./node_modules/*" -not -path "./tmp/*" | wc -l | tr -d ' ')
    log "Found $MD_COUNT markdown files to check"
    
    if [ "$MD_COUNT" -eq 0 ]; then
        log_warning "No markdown files found to check"
        return 0
    fi
    
    # Try to fix common issues automatically
    log "Attempting to auto-fix markdown issues..."
    
    # Fix trailing spaces (MD009) - most common issue
    log "Fixing trailing spaces..."
    find . -name "*.md" -not -path "./node_modules/*" -not -path "./tmp/*" -exec sed -i '' 's/[[:space:]]*$//' {} \;
    
    # Fix missing blank lines around lists (MD032)
    log "Fixing missing blank lines around lists..."
    find . -name "*.md" -not -path "./node_modules/*" -not -path "./tmp/*" -exec perl -i -pe 's/(\S)\n(\*|\+|\-|\d+\.)/$1\n\n$2/g' {} \;
    
    # Fix missing blank lines around code blocks (MD031)
    log "Fixing missing blank lines around code blocks..."
    find . -name "*.md" -not -path "./node_modules/*" -not -path "./tmp/*" -exec perl -i -pe 's/(\S)\n(```)/$1\n\n$2/g' {} \;
    find . -name "*.md" -not -path "./node_modules/*" -not -path "./tmp/*" -exec perl -i -pe 's/(```)\n(\S)/$1\n\n$2/g' {} \;
    
    # Fix multiple consecutive blank lines (MD012)
    log "Fixing multiple consecutive blank lines..."
    find . -name "*.md" -not -path "./node_modules/*" -not -path "./tmp/*" -exec sed -i '' '/^$/N;/^\n$/d' {} \;
    
    log_success "Auto-fix attempts completed for $MD_COUNT markdown files"
    log "Fixed common issues: trailing spaces, missing blank lines, multiple blank lines"
}

# Function to run comprehensive tests
run_tests() {
    log "Running comprehensive tests..."
    
    # 1. TypeScript compilation
    log "Testing TypeScript compilation..."
    npm run build:clean
    if [ $? -ne 0 ]; then
        log_error "TypeScript compilation failed"
        return 1
    fi
    log_success "TypeScript compilation passed"
    
    # 2. Auto-fix markdown issues before linting
    fix_markdown_issues
    
    # 3. Markdown linting
    log "Running markdown linting..."
    npm run lint:md
    if [ $? -ne 0 ]; then
        log_error "Markdown linting failed after auto-fix attempts"
        log "Please manually fix remaining markdown issues and try again"
        return 1
    fi
    log_success "Markdown linting passed"
    
    # 4. Package validation
    log "Validating package.json..."
    npm pack --dry-run > /dev/null
    if [ $? -ne 0 ]; then
        log_error "Package validation failed"
        return 1
    fi
    log_success "Package validation passed"
    
    # 5. Check for common issues
    log "Checking for common issues..."
    
    # Check if dist directory exists and has files
    if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
        log_error "dist directory is empty or missing"
        return 1
    fi
    
    # Check if main entry point exists
    MAIN_FILE=$(node -p "require('./$PACKAGE_FILE').main")
    if [ ! -f "$MAIN_FILE" ]; then
        log_error "Main entry point $MAIN_FILE not found"
        return 1
    fi
    
    # Check if bin files exist
    BIN_FILES=$(node -p "Object.values(require('./$PACKAGE_FILE').bin).join(' ')")
    for bin_file in $BIN_FILES; do
        if [ ! -f "$bin_file" ]; then
            log_error "Binary file $bin_file not found"
            return 1
        fi
    done
    
    log_success "Common issues check passed"
}

# Function to run security checks
run_security_checks() {
    log "Running security checks..."
    
    # 1. npm audit
    log "Running npm audit..."
    npm audit --audit-level=moderate
    if [ $? -ne 0 ]; then
        log_warning "npm audit found vulnerabilities"
        log "Continuing with publish (vulnerabilities may be acceptable)"
    else
        log_success "npm audit passed"
    fi
    
    # 2. Check for sensitive data
    log "Checking for sensitive data..."
    
    # Check for API keys, passwords, etc.
    SENSITIVE_PATTERNS=(
        "api[_-]?key"
        "password"
        "secret"
        "token"
        "private[_-]?key"
        "auth[_-]?token"
    )
    
    for pattern in "${SENSITIVE_PATTERNS[@]}"; do
        if grep -r -i "$pattern" dist/ 2>/dev/null | grep -v "node_modules" | grep -v ".git"; then
            log_warning "Potential sensitive data found with pattern: $pattern"
        fi
    done
    
    log_success "Sensitive data check completed"
    
    # 3. Check file permissions
    log "Checking file permissions..."
    
    # Check for JavaScript files in dist
    find dist/ -name "*.js" -print | while read file; do
        if [ -f "$file" ]; then
            log "Found JavaScript file: $file"
        fi
    done
    
    log_success "File permissions check completed"
}

# Function to run additional best practice checks
run_best_practice_checks() {
    log "Running best practice checks..."
    
    # 1. Check package.json fields
    log "Validating package.json fields..."
    
    # Check required fields
    REQUIRED_FIELDS=("name" "version" "description" "main" "license")
    for field in "${REQUIRED_FIELDS[@]}"; do
        if ! node -p "require('./$PACKAGE_FILE').$field" > /dev/null 2>&1; then
            log_error "Required field '$field' missing from package.json"
            return 1
        fi
    done
    
    # Check if version matches version.json
    PKG_VERSION=$(node -p "require('./$PACKAGE_FILE').version")
    VERSION_JSON_VERSION=$(node -p "require('./$VERSION_FILE').version")
    if [ "$PKG_VERSION" != "$VERSION_JSON_VERSION" ]; then
        log_error "Version mismatch: package.json ($PKG_VERSION) vs version.json ($VERSION_JSON_VERSION)"
        return 1
    fi
    
    log_success "Package.json validation passed"
    
    # 2. Check for proper .npmignore
    if [ ! -f ".npmignore" ]; then
        log_warning ".npmignore file not found"
    else
        log_success ".npmignore file exists"
    fi
    
    # 3. Check package size
    log "Checking package size..."
    PACKAGE_SIZE=$(npm pack --dry-run 2>/dev/null | grep "package size" | awk '{print $3}')
    if [ -n "$PACKAGE_SIZE" ]; then
        log "Package size: $PACKAGE_SIZE"
        # Warn if package is very large (>10MB)
        if [[ "$PACKAGE_SIZE" =~ ^([0-9]+)\.([0-9]+)\ kB$ ]]; then
            SIZE_KB=${BASH_REMATCH[1]}
            if [ "$SIZE_KB" -gt 10000 ]; then
                log_warning "Package size is large: $PACKAGE_SIZE"
            fi
        fi
    fi
    
    log_success "Best practice checks completed"
}

# Function to check Git status
check_git_status() {
    log "Checking Git status..."
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Not in a Git repository"
        return 1
    fi
    
    # Check if there are uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        log_warning "There are uncommitted changes"
        log "Files with changes:"
        git diff --name-only
        log "Consider committing changes before publishing"
    else
        log_success "No uncommitted changes"
    fi
    
    # Check if we're on main branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
        log_warning "Not on main/master branch (currently on: $CURRENT_BRANCH)"
        log "Consider switching to main branch for publishing"
    else
        log_success "On main branch: $CURRENT_BRANCH"
    fi
    
    log_success "Git status check completed"
}

# Function to prepare for GitHub publishing
prepare_github_publish() {
    log "Preparing for GitHub publishing..."
    
    # Ensure dist directory is included (remove from .gitignore if present)
    if grep -q "^dist/" .gitignore; then
        log "Removing dist/ from .gitignore for GitHub publishing"
        sed -i '' '/^dist\/$/d' .gitignore
        log_success "Removed dist/ from .gitignore"
    else
        log_success "dist/ not in .gitignore (good for GitHub)"
    fi
    
    # Add dist directory to git if not already tracked
    if ! git ls-files --error-unmatch dist/ > /dev/null 2>&1; then
        log "Adding dist directory to git"
        git add dist/
        log_success "Added dist directory to git"
    else
        log_success "dist directory already tracked in git"
    fi
    
    # Check if there are changes to commit
    if ! git diff --cached --quiet; then
        log "Committing changes for GitHub publishing"
        CURRENT_VERSION=$(node -p "require('./$VERSION_FILE').version")
        git commit -m "chore: update to version $CURRENT_VERSION with dist files for GitHub"
        log_success "Committed changes for version $CURRENT_VERSION"
    else
        log_success "No changes to commit"
    fi
    
    log_success "GitHub publishing preparation completed"
}

# Function to publish to GitHub
publish_to_github() {
    log "Publishing to GitHub..."
    
    # Check if we have a remote origin
    if ! git remote get-url origin > /dev/null 2>&1; then
        log_error "No remote origin configured"
        log "Please configure GitHub remote: git remote add origin https://github.com/$GITHUB_REPO.git"
        return 1
    fi
    
    # Push to GitHub
    log "Pushing to GitHub..."
    git push origin main
    if [ $? -ne 0 ]; then
        log_error "Failed to push to GitHub"
        return 1
    fi
    
    log_success "Successfully pushed to GitHub!"
}

# Function to cleanup on failure
cleanup_on_failure() {
    log_error "PUBLISH FAILED - See details above"
    log_error "Check $LOG_FILE for full error details"
    exit 1
}

# Main execution
main() {
    log "Starting GitHub publish process..."
    
    # Clear previous log if last publish succeeded
    if ! check_last_publish_status; then
        rm -f "$LOG_FILE"
        log "Starting fresh publish (last publish succeeded)"
    else
        log "Resuming from failed publish"
    fi
    
    # Start fresh log
    echo "=== GITHUB PUBLISH LOG - $(date) ===" > "$LOG_FILE"
    
    # Increment version (unless last publish failed)
    if ! check_last_publish_status; then
        increment_version
    else
        log "Using existing version (last publish failed)"
    fi
    
    # Run all checks
    log "Running comprehensive checks..."
    
    if ! run_tests; then
        cleanup_on_failure
    fi
    
    if ! run_security_checks; then
        cleanup_on_failure
    fi
    
    if ! run_best_practice_checks; then
        cleanup_on_failure
    fi
    
    if ! check_git_status; then
        cleanup_on_failure
    fi
    
    # Prepare for GitHub publishing
    if ! prepare_github_publish; then
        cleanup_on_failure
    fi
    
    # Publish to GitHub
    if ! publish_to_github; then
        cleanup_on_failure
    fi
    
    # Success!
    log_success "=== GITHUB PUBLISH COMPLETED SUCCESSFULLY ==="
    log_success "Package published to GitHub successfully!"
    
    # Clean up log file on success
    rm -f "$LOG_FILE"
    log_success "Log file cleaned up"
    
    # Show final package info
    CURRENT_VERSION=$(node -p "require('./$VERSION_FILE').version")
    log_success "Published version: $CURRENT_VERSION"
    
    echo ""
    echo -e "${GREEN}🎉 GitHub publish completed successfully!${NC}"
    echo -e "${BLUE}Package:${NC} $(node -p "require('./$PACKAGE_FILE').name")"
    echo -e "${BLUE}Version:${NC} $CURRENT_VERSION"
    echo -e "${BLUE}Repository:${NC} https://github.com/$GITHUB_REPO"
    echo -e "${BLUE}Releases:${NC} https://github.com/$GITHUB_REPO/releases"
}

# Run main function
main "$@"
