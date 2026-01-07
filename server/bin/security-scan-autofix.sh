#!/bin/bash
# Web Application Security Scanner with Auto-Fix
# Scans /var/www/html for dependency vulnerabilities
# Automatically fixes issues using Claude Code
# Only sends email if vulnerabilities remain after auto-fix

LOG_DIR="/var/log/security-scans"
SCAN_REPORT="$LOG_DIR/scan-$(date +%Y%m%d).txt"
FIX_LOG="$LOG_DIR/fix-$(date +%Y%m%d).log"
EMAIL="richard.brown@knws.co.uk"

mkdir -p "$LOG_DIR"

# Function to run security scan
run_scan() {
    local output_file="$1"
    echo "=== Security Scan Report - $(date) ===" > "$output_file"
    echo "" >> "$output_file"

    local found_vulns=0

    # Scan each web application directory
    for dir in /var/www/html/*/; do
        app_name=$(basename "$dir")

        # Skip backup directories
        [[ "$app_name" == *backup* ]] && continue

        echo "--- Scanning: $app_name ---" >> "$output_file"

        # Run trivy filesystem scan (only HIGH and CRITICAL)
        trivy fs --severity HIGH,CRITICAL --quiet "$dir" 2>/dev/null >> "$output_file"

        # Check if vulnerabilities were found
        if trivy fs --severity HIGH,CRITICAL --quiet --exit-code 1 "$dir" 2>/dev/null; then
            echo "  No HIGH/CRITICAL vulnerabilities" >> "$output_file"
        else
            found_vulns=1
        fi

        echo "" >> "$output_file"
    done

    echo "=== Scan Complete ===" >> "$output_file"

    return $found_vulns
}

# Initial scan
echo "Running initial security scan..." | tee "$FIX_LOG"
run_scan "$SCAN_REPORT"
initial_vulns=$?

if [ $initial_vulns -eq 0 ]; then
    echo "No vulnerabilities found. Exiting." | tee -a "$FIX_LOG"
    exit 0
fi

# Vulnerabilities found - attempt auto-fix with Claude Code
echo "Vulnerabilities found. Attempting auto-fix with Claude Code..." | tee -a "$FIX_LOG"
echo "ALERT: Vulnerabilities found! Check $SCAN_REPORT" >> "$SCAN_REPORT"

# Create the prompt with scan report
PROMPT="Fix all security vulnerabilities in this scan report. Update requirements.txt files with fixed versions, run npm audit fix where needed. Also clean up any zombie processes if found.

$(cat $SCAN_REPORT)"

# Run Claude Code to fix issues
echo "Calling Claude Code to fix vulnerabilities..." | tee -a "$FIX_LOG"
cd /var/www/html || exit 1

# Run claude code in print mode with permission bypass for automated execution
# Using -p for non-interactive mode and --dangerously-skip-permissions to auto-approve tools
if sudo -u richardbrown HOME=/home/richardbrown /home/richardbrown/.local/bin/claude -p \
    --dangerously-skip-permissions \
    "$PROMPT" >> "$FIX_LOG" 2>&1; then
    echo "Claude Code execution completed successfully" | tee -a "$FIX_LOG"
else
    echo "Warning: Claude Code returned non-zero exit code" | tee -a "$FIX_LOG"
fi

# Wait a moment for changes to settle
sleep 5

# Re-scan to check if vulnerabilities were fixed
echo "Running post-fix security scan..." | tee -a "$FIX_LOG"
POST_SCAN="$LOG_DIR/scan-post-fix-$(date +%Y%m%d).txt"
run_scan "$POST_SCAN"
remaining_vulns=$?

if [ $remaining_vulns -eq 0 ]; then
    echo "SUCCESS: All vulnerabilities were automatically fixed!" | tee -a "$FIX_LOG"

    # Send success notification (optional)
    if command -v mail &> /dev/null; then
        {
            echo "All security vulnerabilities were automatically fixed by Claude Code."
            echo ""
            echo "Initial scan found vulnerabilities in:"
            grep -A2 "Total:" "$SCAN_REPORT" | head -20
            echo ""
            echo "Post-fix scan: Clean"
            echo ""
            echo "Fix log: $FIX_LOG"
        } | mail -s "✓ Security Auto-Fix Successful on $(hostname)" "$EMAIL"
    fi
else
    echo "WARNING: Some vulnerabilities could not be automatically fixed" | tee -a "$FIX_LOG"

    # Send alert email with both reports
    if command -v mail &> /dev/null; then
        {
            echo "Claude Code attempted to fix security vulnerabilities but some issues remain."
            echo ""
            echo "=== REMAINING VULNERABILITIES ==="
            cat "$POST_SCAN"
            echo ""
            echo "=== INITIAL SCAN ==="
            cat "$SCAN_REPORT"
            echo ""
            echo "=== FIX LOG ==="
            cat "$FIX_LOG"
        } | mail -s "⚠ SECURITY ALERT: Unfixed Vulnerabilities on $(hostname)" "$EMAIL"
    fi

    # Log to syslog
    logger -t security-scan "ALERT: HIGH/CRITICAL vulnerabilities remain after auto-fix attempt"
fi

# Cleanup old reports (keep 30 days)
find "$LOG_DIR" -name "scan-*.txt" -o -name "fix-*.log" -mtime +30 -delete 2>/dev/null

echo "Scan and fix process complete. Reports in: $LOG_DIR"
exit $remaining_vulns
