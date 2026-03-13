# npxall API

REST API and MCP server for calling any npm package function over HTTP.

> **Never ship a CLI again.** *(Disclaimer: won't replace your actual backend, handle auth, or attend your sprint reviews.)*

---

## Services

| Service | URL | Port | Protocol |
|---------|-----|------|----------|
| REST API | https://api.npxall.com | 3000 | HTTP/JSON |
| MCP server | https://mcp.npxall.com | 3001 | MCP (Streamable HTTP + SSE) |

---

## REST API

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:package/:method?key=value` | Query params as args |
| `POST` | `/:package/:method` | JSON body as args |
| `GET` | `/health` | Cache stats + health check |
| `GET` | `/` | API info and examples |

### Examples

```bash
# Simple call (GET)
curl https://api.npxall.com/ms/60000
# → {"success":true,"result":"1m"}

# With query params
curl "https://api.npxall.com/lodash/camelCase?value=hello+world"
# → {"success":true,"result":"helloWorld"}

# POST with JSON body — multiple values spread as separate args
curl -X POST https://api.npxall.com/lodash/chunk \
  -H "Content-Type: application/json" \
  -d '{"array":[1,2,3,4],"size":2}'
# → {"success":true,"result":[[1,2],[3,4]]}

# Comma-separated arrays (GET)
curl "https://api.npxall.com/lodash/uniq?values=1,2,3,2,1"
# → {"success":true,"result":[1,2,3]}
```

### Argument handling

**GET (query params):** Each query key becomes a value. Single key → single arg. Multiple keys → object arg.

**POST (JSON body):**
- Array body → single array argument
- Single-key object → the value becomes the argument
- Multi-key object → values spread as separate arguments (order matters)

### Responses

```json
{ "success": true,  "result": <any JSON> }
{ "success": false, "error": "message" }
```

HTTP status `507 Insufficient Storage` when cache is full and all packages are in use.

---

## MCP Server

The MCP server exposes npxall as a single `call` tool, usable from Claude, Cursor, and any MCP-compatible LLM client.

### Transports

| Transport | URL | Client support |
|-----------|-----|----------------|
| Streamable HTTP (2025-03-26) | `POST https://mcp.npxall.com/mcp` | Claude.ai, newer clients |
| SSE (legacy) | `GET https://mcp.npxall.com/sse` | Claude Desktop, older clients |

### Claude Desktop config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "npxall": {
      "url": "https://mcp.npxall.com/sse"
    }
  }
}
```

### Tool: `call`

```
call(package, method?, args?)
```

| Param | Type | Description |
|-------|------|-------------|
| `package` | `string` | npm package name, e.g. `"lodash"`, `"ms"` |
| `method` | `string?` | Function/method to call, e.g. `"camelCase"` |
| `args` | `unknown[]?` | Native JSON arguments — no quoting needed |

**Example LLM prompt:**
> Call `lodash.chunk` with array `[1,2,3,4,5,6]` and size `2`

The LLM calls:
```json
{
  "package": "lodash",
  "method": "chunk",
  "args": [[1,2,3,4,5,6], 2]
}
```
Returns: `[[1,2],[3,4],[5,6]]`

### JSON-RPC directly

```bash
curl -X POST https://mcp.npxall.com/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "call",
      "arguments": {
        "package": "ms",
        "args": [60000]
      }
    }
  }'
```

---

## Disk Cache

Both services use an LRU disk cache, wiped clean on every boot.

| Env var / CLI arg | Default | Description |
|-------------------|---------|-------------|
| `CACHE_MAX_MB` or `--max-cache-mb=N` | `500` | Maximum cache size in MB |
| `NPXALL_CACHE_DIR` | `/app/cache` | Cache directory |

**Behavior:**
- All cached packages are wiped when the container starts
- Packages are installed on first request and measured by disk usage (`du`)
- When the cache exceeds the limit, the least recently used non-in-use packages are evicted
- If the cache is full and all packages are actively serving requests, new installs are rejected (507)
- A `refCount` per package prevents evicting a package mid-execution

**`/health` response:**
```json
{
  "status": "ok",
  "cache": {
    "usedMb": 142,
    "maxMb": 500,
    "packages": 8,
    "entries": {
      "lodash": { "sizeMb": 6, "refCount": 0 },
      "ms":     { "sizeMb": 1, "refCount": 1 }
    }
  }
}
```

---

## Deployment

### Docker Compose (local / server)

```bash
docker compose up --build
```

Services:
- API: http://localhost:3000
- MCP: http://localhost:3001

### Coolify

Both services are deployed via Coolify on a single server with Traefik routing:

- `api.npxall.com` → container port 3000
- `mcp.npxall.com` → container port 3001

Domains are set via `docker_compose_domains` in the Coolify app config.

### Environment variables (Coolify UI)

| Variable | Value | Description |
|----------|-------|-------------|
| `CACHE_MAX_MB` | `500` | Cache size limit per service |
| `PORT` | `3000` / `3001` | Service port |

---

## Security & Rate Limiting

### fail2ban (recommended)

These services are public and unauthenticated. Without rate limiting, they can be abused to install arbitrary packages or exhaust disk/CPU. **Set up fail2ban on the host** to ban IPs with excessive requests.

Install and configure on the server:

```bash
apt install fail2ban
```

Create `/etc/fail2ban/filter.d/npxall.conf`:

```ini
[Definition]
failregex = ^<HOST> .* "(GET|POST) /
ignoreregex =
```

Create `/etc/fail2ban/jail.d/npxall.conf`:

```ini
[npxall-api]
enabled  = true
port     = 3000,3001
filter   = npxall
logpath  = /var/log/nginx/access.log
maxretry = 60
findtime = 60
bantime  = 600

[npxall-mcp]
enabled  = true
port     = 3000,3001
filter   = npxall
logpath  = /var/log/traefik/access.log
maxretry = 30
findtime = 60
bantime  = 3600
```

> **Note on log paths:** Traefik (used by Coolify) writes access logs differently than nginx. Enable Traefik access logs in Coolify → Server → Proxy settings, then adjust `logpath` above to match.

Restart fail2ban:

```bash
systemctl restart fail2ban
fail2ban-client status npxall-api
```

### Additional hardening

- Set `CACHE_MAX_MB` conservatively to limit disk exhaustion from package install abuse
- Consider adding a simple API key via Traefik middleware if public abuse becomes a problem
- Monitor `/health` endpoints for cache pressure

---

## Architecture

```
                  DNS
  api.npxall.com ──────► 46.225.130.176
  mcp.npxall.com ──────► 46.225.130.176
                               │
                           Traefik
                          (Coolify)
                         /         \
                   :3000            :3001
                api/server.js   mcp/server.js
                     │               │
               npm install      npm install
               (~/.npxall/)    (~/.npxall/)
               LRU cache        LRU cache
```

Both services share the same package-loading logic but maintain independent caches (separate containers). The MCP server passes arguments as native JSON, while the REST API parses stringified values from query params and JSON bodies.
