#!/bin/bash

# Test all browser commands systematically
# Each command has a 3-second timeout

BASE_URL="http://localhost:3457/command"
BROWSER="firefox"
RESULTS_FILE="test-results.txt"

# Clear results file
> "$RESULTS_FILE"

test_command() {
    local name="$1"
    local action="$2"
    local payload="$3"

    echo -n "Testing $name... "

    result=$(timeout 3 curl -s -X POST "$BASE_URL" \
        -H "Content-Type: application/json" \
        -d "{\"action\":\"$action\",\"payload\":$payload,\"browser\":\"$BROWSER\"}")

    exit_code=$?

    if [ $exit_code -eq 124 ]; then
        echo "❌ TIMEOUT" | tee -a "$RESULTS_FILE"
        echo "  $name: TIMEOUT" >> "$RESULTS_FILE"
    elif [ $exit_code -ne 0 ]; then
        echo "❌ FAILED (exit $exit_code)" | tee -a "$RESULTS_FILE"
        echo "  $name: FAILED" >> "$RESULTS_FILE"
    else
        success=$(echo "$result" | jq -r '.success // false' 2>/dev/null)
        if [ "$success" = "true" ]; then
            echo "✅ OK" | tee -a "$RESULTS_FILE"
            echo "  $name: OK" >> "$RESULTS_FILE"
        else
            error=$(echo "$result" | jq -r '.error // "unknown error"' 2>/dev/null)
            echo "❌ ERROR: $error" | tee -a "$RESULTS_FILE"
            echo "  $name: ERROR - $error" >> "$RESULTS_FILE"
        fi
    fi

    sleep 0.5
}

echo "========================================" | tee -a "$RESULTS_FILE"
echo "Browser Command Test Results" | tee -a "$RESULTS_FILE"
echo "$(date)" | tee -a "$RESULTS_FILE"
echo "========================================" | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

# Tab Management
echo "=== TAB MANAGEMENT ===" | tee -a "$RESULTS_FILE"
test_command "getTabs" "getTabs" "{}"
test_command "getActiveTab" "getActiveTab" "{}"
test_command "createTab" "createTab" '{"url":"https://example.com"}'
test_command "focusTab" "focusTab" '{"tabId":12}'
test_command "closeTab" "closeTab" '{"tabId":26}'
echo "" | tee -a "$RESULTS_FILE"

# Navigation
echo "=== NAVIGATION ===" | tee -a "$RESULTS_FILE"
test_command "navigate" "navigate" '{"url":"https://example.com"}'
test_command "goBack" "goBack" "{}"
test_command "goForward" "goForward" "{}"
echo "" | tee -a "$RESULTS_FILE"

# Content Extraction
echo "=== CONTENT EXTRACTION ===" | tee -a "$RESULTS_FILE"
test_command "getPageInfo" "getPageInfo" "{}"
test_command "getVisibleText" "getVisibleText" "{}"
test_command "getVisibleHtml" "getVisibleHtml" "{}"
test_command "screenshot" "screenshot" "{}"
test_command "getUIElements" "getUIElements" "{}"
test_command "inspectCurrentPage" "inspectCurrentPage" "{}"
test_command "getInteractiveElements" "getInteractiveElements" "{}"
test_command "getPageContext" "getPageContext" "{}"
echo "" | tee -a "$RESULTS_FILE"

# Interaction
echo "=== INTERACTION ===" | tee -a "$RESULTS_FILE"
test_command "clickElement" "clickElement" '{"selector":"body"}'
test_command "fillElement" "fillElement" '{"selector":"input","value":"test"}'
test_command "selectOption" "selectOption" '{"selector":"select","value":"option1"}'
test_command "scrollTo" "scrollTo" '{"y":100}'
test_command "executeScript" "executeScript" '{"script":"console.log(\"test\")"}'
test_command "hover" "hover" '{"selector":"body"}'
test_command "drag" "drag" '{"sourceSelector":"#source","targetSelector":"#target"}'
test_command "pressKey" "pressKey" '{"key":"Enter"}'
test_command "clickByText" "clickByText" '{"text":"Example"}'
echo "" | tee -a "$RESULTS_FILE"

# Form Handling
echo "=== FORM HANDLING ===" | tee -a "$RESULTS_FILE"
test_command "getFormData" "getFormData" "{}"
test_command "getFormStructure" "getFormStructure" "{}"
test_command "fillFormField" "fillFormField" '{"label":"Name","value":"Test"}'
test_command "answerQuestions" "answerQuestions" '{"answers":{}}'
echo "" | tee -a "$RESULTS_FILE"

# Debug/Monitoring
echo "=== DEBUG/MONITORING ===" | tee -a "$RESULTS_FILE"
test_command "getConsoleLogs" "getConsoleLogs" "{}"
test_command "getNetworkRequests" "getNetworkRequests" "{}"
test_command "getLocalStorage" "getLocalStorage" "{}"
test_command "getCookies" "getCookies" "{}"
test_command "listInteractiveElements" "listInteractiveElements" "{}"
test_command "clickElementWithDebug" "clickElementWithDebug" '{"selector":"body"}'
test_command "findElementWithDebug" "findElementWithDebug" '{"selector":"body"}'
test_command "getDropdownOptions" "getDropdownOptions" '{"selector":"select"}'
echo "" | tee -a "$RESULTS_FILE"

# Utility
echo "=== UTILITY ===" | tee -a "$RESULTS_FILE"
test_command "findTabByUrl" "findTabByUrl" '{"urlPattern":"example"}'
test_command "waitForSelector" "waitForSelector" '{"selector":"body","timeout":1000}'
test_command "waitForPageLoad" "waitForPageLoad" '{"timeout":1000}'
test_command "isElementVisible" "isElementVisible" '{"selector":"body"}'
test_command "getElementForNativeInput" "getElementForNativeInput" '{"selector":"input"}'
test_command "setWatchMode" "setWatchMode" '{"enabled":true}'
echo "" | tee -a "$RESULTS_FILE"

echo "========================================" | tee -a "$RESULTS_FILE"
echo "Test complete! Results saved to $RESULTS_FILE" | tee -a "$RESULTS_FILE"
echo "========================================" | tee -a "$RESULTS_FILE"
