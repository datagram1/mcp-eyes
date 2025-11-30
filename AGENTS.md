# Repository Guidelines

## Project Structure & Module Organization
All TypeScript sources live in `src/` (advanced/basic/Claude/SSE/bridge servers plus shared helpers) and compile into `dist/`. Browser assets and dashboards belong in `web/` and `extension/`, while OS-native glue code is grouped under `macos/`, `windows/`, and `native/`. Automation scripts, version helpers, and release tooling are in `scripts/` alongside the top-level `deploy.sh`, `local-dev.sh`, and publishing shells. Keep docs, diagrams, and changelog fragments inside `docs/`; temporary screenshots or recordings should stay in `tmp/` and remain untracked.

## Build, Test, and Development Commands
- `npm run dev` – Type-checks in watch mode for rapid iteration.
- `npm run build` – Runs `update-version` and compiles the TypeScript project into `dist/`.
- `npm start:advanced` / `npm start:basic` / `npm start:sse` – Execute the compiled server variants over stdio or HTTP.
- `npm test` – Executes schema validation plus startup smoke tests; required before PRs.
- `npm run test:all` – CI-equivalent sweep (`build`, tests, Markdown lint) before tagging releases.

## Coding Style & Naming Conventions
Use TypeScript with ES module syntax, 2-space indentation, and descriptive file names such as `permission-helper.ts` or `browser-bridge-server.ts`. Prefer pure helpers that export clear functions; keep platform-specific paths segregated by directory. Log via `logger.ts` so output formatting stays uniform. Markdown should pass `npm run lint:md`, which enforces heading order, fenced code info tags, and ~100 character line wraps.

## Testing Guidelines
The lightweight harness in `tests/` relies on Node’s standard runner plus bespoke startup checks. When adding a server or CLI switch, extend `tests/test-server-startup.js` to boot it and `tests/validate-mcp-structure.js` to assert tool schemas. Name describe blocks after the transport (`"bridge server"`) for quick filtering. Always run `npm test` locally; flakes often point to missing Accessibility permissions or stale `dist/` output.

## Commit & Pull Request Guidelines
Commits typically follow a Conventional Commits flavor (`feat:`, `docs:`, imperative sentences). Keep each commit focused on one behavior and avoid editing generated `dist/` files; rebuild instead. Pull requests should summarize scope, list the commands you ran (e.g., `npm run build && npm test`), link issues, and attach screenshots/logs for UI work. Rebase or merge only after CI mirrors your local results.

## Security & Configuration Tips
Never commit personal configuration such as `local-mcp-config.json` or platform permission prompts. Proxy and API secrets belong in your shell environment or user-specific config files ignored by Git. On macOS, grant Accessibility permissions before running tests to prevent false negatives in `test:startup`.

## Browser / UI Automation Agent
Rely on the `mcp-eyes` server whenever you automate desktop or browser tasks (opening URLs, reading content, clicking, filling forms, taking screenshots). Discover selectors with `browser_getInteractiveElements`, read copy with `browser_getVisibleText`, and interact via `browser_clickElement`/`browser_fillElement` followed by `browser_waitForPageLoad` or `browser_waitForSelector` when the DOM changes. Avoid `browser_executeScript` unless no other tool works. Act autonomously—call the tool you need without asking—and never guess selectors; always reuse the ones previously returned.
