# npxall — Product

## Vision
npxall lets anyone call any npm package function from the CLI, REST API, or AI assistant — without writing a script. It's a universal function caller for the 2M+ npm ecosystem. Target users: developers who need quick utility calls during development, AI agents that need runtime access to npm functions, and automation scripts that need lightweight package access.

## User Personas

- **Dev at 2am** — Backend developer who just needs to slugify a string, parse a date, or validate an email. Doesn't want to write a script. Uses CLI.
- **AI Agent Builder** — Building with Claude/GPT and needs the agent to call npm functions at runtime. Uses the MCP server or REST API.
- **Script Automator** — Writes bash scripts and CI pipelines that need lightweight access to npm utilities. Uses CLI piping or API calls.

## Roadmap

### Shipped
- [x] CLI with method chaining, sub-expressions, stdin piping — v0.1.3 on npm (348 downloads last week)
- [x] REST API v2 with URL pipeline chaining — `api.npxall.com` (live)
- [x] MCP server with single `call` tool — `mcp.npxall.com` (live)
- [x] Web docs with function browser — `adrienj.github.io/npxall`
- [x] API v2 URL parsing: `/pkg/method/args/method/args/` pipeline format
- [x] MCP skill file for Claude Code integration
- [x] Test coverage: 85 API+MCP tests, 262 CLI tests
- [x] `status.npxall.com` DNS + health endpoint (live)
- [x] Coolify deploy fixed — root cause: app created without GitHub App source (source_id: 0). Recreated with proper github_app_uuid.

### In Progress
(none)

### Planned (Next)
- [ ] Publish v0.2.0 to npm with latest CLI improvements — S
- [ ] Build and deploy updated web docs (gh-pages with API v2 + MCP sections) — S
- [ ] Add npxall MCP server to public MCP registries (Smithery, MCP Hub) — S, high discovery value
- [ ] README update with API v2 and MCP usage examples — S

### Icebox
- [ ] Authentication / rate limiting on API — not needed until abuse appears
- [ ] Package allowlist/blocklist — security hardening, defer until real traffic
- [ ] WebSocket transport for MCP — no demand signal yet
- [ ] npm org/team features — no B2B signal

## Current Focus

API and MCP servers are live. Next priorities: publish npm v0.2.0, update web docs, get MCP server listed on public registries for discovery.

## GTM & Marketing
- **Launch status:** Soft launch (npm published, GitHub Pages live, API + MCP live)
- **First users:** 348 npm downloads last week (spike on Mar 6, declining since). No known repeat users. No paying users.
- **Channels:** npm search, GitHub. No active promotion yet.
- **Conversion funnel:** Unknown. No analytics. The web docs have a function browser but no tracking.
- **Next GTM action:** Get listed on MCP registries (Smithery, mcp.run, etc.) — this is where AI-tool-using developers discover MCP servers. The MCP angle is the strongest growth lever.

## Monetization
- **Revenue today:** $0
- **Pricing:** Free / open source. No monetization plan yet.
- **Stripe/payments:** N/A
- **Next monetization action:** None planned. Focus is on distribution and usage first. Potential future: hosted API with rate limits (free tier + paid for higher limits).

## Quality
- **Tests:** 85 passing (API + MCP), 262 passing (CLI, with some flaky tests due to shared npm cache)
- **Known bugs:**
  - CLI tests have cache race conditions causing intermittent failures
- **Tech debt:**
  - CLI tests share `~/.npxall/` cache directory causing flakiness — should use isolated temp dirs
  - `npxall-private` repo is separate from public `npxall` — deployment pipeline is fragile

## Key Decisions
- [2026-03-13] API v2: custom URL parsing with pipeline chaining instead of Express route params — enables powerful chaining like `/lodash/concat/[1,2],3/reverse.slice/0,1/`
- [2026-03-13] Direct response format (no `{success, result}` wrapper) — cleaner for programmatic use
- [2026-03-13] MCP server as separate service from API — different transport requirements, independent scaling
- [2026-03-13] Claude-specific files (.claude/, CLAUDE.md, docs/superpowers/) stay unversioned — local dev aids only
- [2026-03-13] Coolify deploy fix: app had source_id=0 (no GitHub App linked). Deleted and recreated with github_app_uuid. Root cause was NOT GitHub App authorization — the app itself was misconfigured.
