# ScreenControl Web

Next.js UI for the ScreenControl MCP stack. Houses the tenant MCP endpoint, SSE bridge, and debugging surfaces for the control server.

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000 to confirm the app boots.

## MCP Dynamic Tool Refresh (milestone)

- MCP capabilities advertise `tools: { listChanged: true }` so Claude Web and other clients support live tool updates.
- SSE connections now emit `notifications/tools/list_changed` immediately on connect to force a fresh tool list (prevents cached/stale tool sets after many updates).
- Tool advertisements from agents trigger broadcasts via the SSE manager, so Claude Web refreshes as soon as new tools are pushed.
- Logs to look for: `SSE CONNECTED`, `SSE PUSH LIST_CHANGED`, and `[MCP SSE] Broadcast notifications/tools/list_changed...` when testing with Claude Web.

## Useful Scripts

- `npm run dev` – Next.js dev server with type checking.
- `npm run build` – Production build.
- `npm test` – Jest/Playwright tests (where present).
