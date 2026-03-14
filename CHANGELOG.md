# Changelog

## [0.3.0] — 2026-03-14

### Security

- **Sandboxed execution** — API and MCP requests now run in isolated subprocesses via [bubblewrap](https://github.com/containers/bubblewrap):
  - Network isolation (`--unshare-net`) — packages cannot make outbound requests during execution
  - Read-only filesystem (`--ro-bind`) — packages cannot write outside `/tmp`
  - PID namespace isolation (`--unshare-pid`) — packages cannot see host processes
  - Sanitized environment — no host secrets or env vars leak into execution
  - Per-package cache directories — packages cannot read other installed packages
  - `--ignore-scripts` on `npm install` — postinstall scripts are not executed
- Graceful fallback to unsandboxed subprocess on systems without bwrap (macOS, Windows, Docker without `CAP_SYS_ADMIN`)

### Changed

- **Execution timeout default reduced from 20s to 5s** — configurable via `EXEC_TIMEOUT_MS`
- API and MCP servers refactored to use shared modules (`shared/parse.js`, `shared/loader.js`, `shared/cache.js`, `shared/sandbox.js`)
- Docker build context moved to repo root to support `shared/` directory
- Dockerfiles now install bubblewrap and require `CAP_SYS_ADMIN` for full sandboxing

### Breaking

- Packages requiring postinstall scripts (e.g. `sharp`, `esbuild`, `bcrypt`) will not install correctly
- Packages making HTTP requests during execution will fail (network isolated)
- Long-running executions (>5s) will timeout — increase `EXEC_TIMEOUT_MS` if needed

### Added

- `shared/` module with extracted parse, loader, cache, and sandbox utilities (52 tests)
- `shared-tests` CI job
- Security section in README

## [0.2.0] — 2026-03-13

### Added

- REST API server at `api.npxall.com` with URL pipeline chaining
- MCP server at `mcp.npxall.com` (Streamable HTTP + SSE transports)
- Homepage at `npxall.com` with terminal demo and docs
- Execution timeouts (20s) and install timeouts (60s)
- LRU cache eviction (500 MB default)
- Docker non-root containers with resource limits
- CI: 8-job matrix (Linux/macOS/Windows × Node 20/22 + API + MCP)

## [0.1.0] — 2026-03-12

### Added

- CLI with method chaining, sub-expressions, stdin piping
- JSON-aware argument parsing
- Package caching in `~/.npxall/`
- Published to npm as `npxall`
