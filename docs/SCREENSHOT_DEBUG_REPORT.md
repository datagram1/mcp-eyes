# Screenshot Debugging Report

**Date:** December 15, 2024
**Issue:** Screenshots don't work via Claude Web (MCP), but work locally
**Status:** INTERIM SOLUTION - Bug reported to Anthropic
**Last Updated:** December 15, 2024 20:15 UTC

---

## Current Status

| Mode | Status | Notes |
|------|--------|-------|
| **Local (Claude Code/Desktop)** | ✅ Works | Screenshots work perfectly via stdio MCP |
| **Remote (Claude Web)** | ❌ Disabled | MCP client can't process large ImageContent |

---

## Executive Summary

**Screenshots work locally, not remotely.**

- **Local mode** (Claude Code, Claude Desktop): Screenshots work perfectly. The MCP server communicates via stdio and returns images directly.

- **Remote mode** (Claude Web via control server): Screenshots are **disabled** because Claude.ai's MCP client cannot process large ImageContent responses (6.7MB). We've confirmed the server delivers the data successfully (HTTP 200), but Claude's client fails to display it.

**Bug reported to Anthropic** - awaiting their fix.

---

## What We Proved

### Server-Side Is Working Correctly

All server components were verified working:

| Component | Status | Evidence |
|-----------|--------|----------|
| macOS agent captures screenshot | ✅ | 6.6MB PNG in 1.1 seconds |
| WebSocket delivery to server | ✅ | Logs show `hasImage: true` |
| Server processes response | ✅ | `resultSize: 6640275` |
| HTTP response sent | ✅ | Apache log: `200 6703295` |
| Response reaches Claude IP | ✅ | Delivered to 34.162.136.91 |
| Claude client displays image | ❌ | Shows "Error occurred" |

### Apache Access Log Evidence
```
34.162.136.91 - POST /mcp/... HTTP/1.1 200 6703295 "Claude-User"
```
**6.7MB delivered with HTTP 200** - server did its job.

---

## Workarounds Attempted

### 1. JPEG with Lower Quality
Reduced response from 6.7MB to ~800KB. **Still failed** - Claude's client has issues with ImageContent regardless of size.

### 2. URL-Based Response
Saved screenshots to public URL, returned just the link. **Partially worked** - URL was returned, but Claude Web's `WebFetch` tool has security restrictions preventing it from fetching self-generated URLs.

### 3. Disabled Screenshot for Claude Web
**Current solution** - Returns error message telling users to use Claude Code/Desktop instead.

---

## Interim Solution

Screenshots via MCP (Claude Web) are **disabled** in `route.ts`:

```typescript
case 'desktop_screenshot': {
  // DISABLED: Claude Web MCP client cannot process large ImageContent responses
  // Bug reported to Anthropic - re-enable when fixed
  return {
    content: [{
      type: 'text',
      text: 'Screenshot temporarily disabled for Claude Web due to MCP client limitations. Use Claude Code/Desktop for screenshots.',
    }],
    isError: true,
  };
  /* Original code commented out... */
}
```

**To re-enable:** Remove the early return and uncomment the original code in `/var/www/html/screencontrol/web/src/app/mcp/[uuid]/route.ts` around line 1291.

---

## Root Cause

The issue is **Claude.ai's MCP client**, not our server:

1. MCP ImageContent format: `{ type: "image", data: "base64...", mimeType: "image/png" }`
2. Our server returns this format correctly
3. HTTP response is delivered successfully (confirmed via Apache logs)
4. Claude's client fails to parse/display the image

**Possible client-side issues:**
- Response size limit in Claude's MCP client
- ImageContent parsing bug
- Memory issues with large base64 strings
- JSON deserialization timeout

---

## Files Modified

| File | Change |
|------|--------|
| `/var/www/html/screencontrol/web/src/app/mcp/[uuid]/route.ts` | Screenshot case disabled |
| `/var/www/html/screencontrol/web/src/lib/control-server/agent-registry.ts` | Timeout increased to 120s |
| `/etc/apache2/sites-enabled/screencontrol.knws.co.uk-le-ssl.conf` | Added `/screenshots` alias (for URL workaround) |
| `/etc/cron.d/screencontrol-cleanup` | Cleanup cron for old screenshots |

---

## For Future Claude Code Sessions

### To Check Current Status
```bash
# Check if screenshot is enabled or disabled
ssh richardbrown@192.168.10.10 "grep -A5 \"case 'desktop_screenshot'\" /var/www/html/screencontrol/web/src/app/mcp/\\[uuid\\]/route.ts | head -10"

# Check server logs
ssh richardbrown@192.168.10.10 "tail -50 /tmp/screencontrol-web.log"

# Check connected agents
ssh richardbrown@192.168.10.10 "curl -s http://localhost:3002/api/health | python3 -m json.tool"
```

### To Re-Enable (When Anthropic Fixes Their Client)

1. Edit `/var/www/html/screencontrol/web/src/app/mcp/[uuid]/route.ts`
2. Find the `desktop_screenshot` case (around line 1291)
3. Remove the early return and uncomment the original code
4. Rebuild: `cd /var/www/html/screencontrol/web && npm run build`
5. Restart: `PORT=3002 npm start`

---

## Bug Report to Anthropic

**Submitted:** December 15, 2024

**Summary:** Claude.ai's MCP client cannot process large ImageContent responses. Server delivers 6.7MB response with HTTP 200, but client shows "Error occurred during tool execution."

**Expected:** MCP ImageContent with base64 image data should be displayed to user.

**Actual:** Error message shown despite successful HTTP delivery.

---

## Timeline

1. **Initial issue:** Screenshots from Claude Web show error
2. **Debugging:** Traced through entire response chain
3. **Finding:** Server delivers 6.7MB successfully, client fails
4. **Workaround 1:** JPEG compression - still fails
5. **Workaround 2:** URL-based response - WebFetch blocked
6. **Final:** Disabled for Claude Web, works locally
7. **Bug reported:** Awaiting Anthropic response

---

*Report for future Claude Code sessions*
*Original debugging by Claude Code (Opus) - December 15, 2024*
