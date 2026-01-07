# Server Configuration

Server-level scripts and configuration for 192.168.10.10 (main webserver).

## Directory Structure

```
server/
├── bin/
│   ├── security-scan-autofix.sh    # Automated vulnerability scanner + Claude Code fixer
│   └── security-scan.cron          # Cron schedule file
└── claude-config/
    └── www-html-settings.json      # Claude Code permissions for /var/www/html
```

## Security Scanner with Auto-Fix

`security-scan-autofix.sh` runs daily via cron to:
1. Scan all `/var/www/html/*` directories with Trivy for HIGH/CRITICAL vulnerabilities
2. Call Claude Code to automatically fix detected issues
3. Re-scan to verify fixes
4. Email results (success or remaining issues)

### Deployment

```bash
# Copy script to server
scp server/bin/security-scan-autofix.sh richardbrown@192.168.10.10:/usr/local/bin/
ssh richardbrown@192.168.10.10 "sudo chmod 755 /usr/local/bin/security-scan-autofix.sh"

# Copy cron schedule
scp server/bin/security-scan.cron richardbrown@192.168.10.10:/tmp/
ssh richardbrown@192.168.10.10 "sudo cp /tmp/security-scan.cron /etc/cron.d/security-scan"
```

### Cron Schedule

Located at `/etc/cron.d/security-scan`:
```
0 6 * * * root /usr/local/bin/security-scan-autofix.sh >/dev/null 2>&1
```

## Claude Code Permissions

`www-html-settings.json` grants Claude Code permissions to edit files and run commands in `/var/www/html` without prompting.

### Deployment

```bash
# Create Claude config directory and copy settings
ssh richardbrown@192.168.10.10 "mkdir -p /var/www/html/.claude"
scp server/claude-config/www-html-settings.json richardbrown@192.168.10.10:/var/www/html/.claude/settings.json
```

### Key Permissions Granted

- File operations: `Read`, `Edit`, `Write`, `Glob`, `Grep`
- Package management: `Bash(npm:*)`, `Bash(sudo npm:*)`, `Bash(pip:*)`, `Bash(sudo pip:*)`
- File modifications: `Bash(sudo sed:*)`, `Bash(chmod:*)`, `Bash(sudo chown:*)`
- System: `Bash(ps:*)`, `Bash(kill:*)`, `Bash(sudo systemctl:*)`

## Logs

Security scan logs are stored on the server at:
- `/var/log/security-scans/scan-YYYYMMDD.txt` - Vulnerability scan results
- `/var/log/security-scans/fix-YYYYMMDD.log` - Claude Code fix attempts
- `/var/log/security-scans/scan-post-fix-YYYYMMDD.txt` - Post-fix verification scan

## Manual Execution

```bash
# Run the scanner manually
ssh richardbrown@192.168.10.10 "sudo /usr/local/bin/security-scan-autofix.sh"

# Check latest logs
ssh richardbrown@192.168.10.10 "tail -100 /var/log/security-scans/fix-\$(date +%Y%m%d).log"
```
