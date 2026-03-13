# npxall

[![npm](https://img.shields.io/npm/v/npxall)](https://www.npmjs.com/package/npxall)
[![npm downloads](https://img.shields.io/npm/dw/npxall)](https://www.npmjs.com/package/npxall)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![CI](https://github.com/adrienj/npxall/actions/workflows/ci.yml/badge.svg)](https://github.com/adrienj/npxall/actions/workflows/ci.yml)
[![Web](https://img.shields.io/badge/web-npxall.com-blue)](https://npxall.com)

**Run any npm function directly from the command line — without writing a script.**

> Never ship a CLI again. *(Fine print: npxall won't replace your actual CLI, handle edge cases, or explain itself to your PM. But it'll handle the 2am "I just need to slugify this string" moment.)*

```bash
npx npxall lodash camelCase "hello world"   # → helloWorld
npx npxall ms 2000                          # → 2s
npx npxall change-case snakeCase "Foo Bar"  # → foo_bar
```

Packages are downloaded on first use and cached in `~/.npxall/`. No global installs, no boilerplate.

---

## Install

```bash
npm install -g npxall
```

Or use without installing via `npx npxall <package> ...`.

---

## Usage

```
npxall <package> [method] [args...]
```

### Basic call

```bash
npxall ms 60000                              # → 1m
npxall semver valid "1.2.3"                  # → 1.2.3
npxall semver gt "2.0.0" "1.0.0"            # → true
npxall lodash chunk '[1,2,3,4]' 2           # → [[1,2],[3,4]]
npxall slugify "Hello World! 2024" '{"lower":true,"strict":true}'  # → hello-world-2024
npxall uuid v4                               # → 550e8400-e29b-41d4-a716-…
npxall pretty-bytes 1073741824              # → 1 GB
npxall chroma-js contrast '"#ff0000"' '"#ffffff"'  # → 3.998…
npxall yaml parse "key: value"              # → {"key":"value"}
npxall marked parse '"# Hello"'            # → <h1>Hello</h1>
npxall he encode '"<b>Hello & World</b>"'  # → &#x3C;b&#x3E;Hello &#x26; World&#x3C;/b&#x3E;
npxall qs stringify '{"page":1,"q":"foo"}' # → page=1&q=foo
npxall jsonpath query '{"a":{"b":42}}' '"$.a.b"'  # → [42]
npxall flat flatten '{"a":{"b":{"c":1}}}'  # → {"a.b.c":1}
```

### Method chaining with `.`

```bash
npxall lodash "hello world" . split " " . reverse . join "-"
# → world-hello
```

### Dot shorthand

```bash
npxall lodash camelCase.toUpper "hello world"
# → HELLOWORLD
```

### Sub-expressions `[ pkg method args ]`

Use `[...]` to pass the result of one call as an argument to another:

```bash
npxall lodash cloneDeep '[ lodash omit {"a":1,"b":2} "b" ]'
# → {"a":1}
```

### Stdin with `-`

```bash
echo '"hello world"' | npxall lodash camelCase -
# → helloWorld

cat data.json | npxall lodash get - "user.name"
```

### Shell substitution `"$(command)"`

Pass the output of any shell command as an argument. **Always double-quote** the substitution — without quotes the shell word-splits the output on whitespace and only the first word reaches npxall.

```bash
# Parse a YAML config file
npxall yaml parse "$(cat config.yaml)"

# Query a JSON file with a JSONPath expression
npxall jsonpath query "$(cat users.json)" '"$.users[0].name"'

# Convert a Markdown file to HTML
npxall marked parse "$(cat README.md)"

# HTML-encode a template
npxall he encode "$(cat template.html)"

# Turn a JSON filter file into a query string
npxall qs stringify "$(cat filter.json)"

# Combine with chaining
npxall yaml parse "$(cat config.yaml)" . get '"db.host"'
```

#### Shell compatibility

| Shell | Syntax | Notes |
|-------|--------|-------|
| sh, bash, zsh, dash | `"$(cat file)"` | Standard POSIX substitution |
| PowerShell (pwsh) | `"$(cat file)"` | `cat` aliases `Get-Content` on Windows; identical syntax on macOS/Linux |
| fish | `(cat file \| string collect)` | Different substitution syntax; `string collect` joins lines into one argument |
| cmd.exe | ❌ | No substitution support — use Git Bash, WSL, or PowerShell |

> **Why the quotes matter:**
> `"$(cat file)"` → one argument containing the full file content
> `$(cat file)` → shell word-splits on whitespace; npxall only sees the first word

### JSON arguments

Arguments that look like valid JSON are parsed automatically:

```bash
npxall lodash pick '{"a":1,"b":2,"c":3}' '["a","c"]'
# → {"a":1,"c":3}
```

### Double-dash args `--key=value`

Pass an object as a single argument using `--key=value` syntax:

```bash
npxall lodash cloneDeep --a=1 --b=2
# → {"a":1,"b":2}

npxall lodash pick --obj='{"a":1,"b":2,"c":3}' --paths='a,c'
# → {"a":1,"c":3}
```

### Comma-separated arrays

Comma-separated values become arrays automatically:

```bash
npxall lodash uniq 1,2,3,2,1
# → [1, 2, 3]

npxall lodash sum 1,2,3,4,5
# → 15

npxall lodash uniq a,b,c,a
# → ["a", "b", "c"]
```

---

## REST API v2

**Base URL:** `https://api.npxall.com`

URL pattern: `/:package/:method/:args/:method/:args/...` — each method/args pair is a pipeline step. The result of each step becomes the first argument of the next.

```bash
# Bare function (package exports a single function)
curl https://api.npxall.com/ms/60000                          # → "1m"

# Named method
curl https://api.npxall.com/lodash/camelCase/hello%20world    # → "helloWorld"

# Array arguments (URL-encode brackets)
curl 'https://api.npxall.com/lodash/chunk/%5B1,2,3,4%5D,2'   # → [[1,2],[3,4]]

# Pipeline chaining — concat, then reverse
curl 'https://api.npxall.com/lodash/concat/%5B1,2%5D,3/reverse/'  # → [3,2,1]

# Dot shorthand — chain no-arg methods: reverse, then slice
curl 'https://api.npxall.com/lodash/concat/%5B1,2%5D,3/reverse.slice/0,1/'  # → [3]

# Scoped packages
curl https://api.npxall.com/@sindresorhus/slugify/Hello%20World  # → "hello-world"

# POST with JSON body
curl -X POST https://api.npxall.com/slugify \
  -d '["Hello World!", {"lower": true}]' \
  -H "Content-Type: application/json"                         # → "hello-world!"
```

### Dot shorthand

Chain multiple no-arg method calls in a single URL step: `reverse.join` calls `reverse()` then `join()` on the result. Only the last method in the chain receives the URL args.

### Prototype methods

After any step, you can chain native JS prototype methods on the result:

```bash
# Array methods: reverse, slice, join, flat, filter, includes...
curl 'https://api.npxall.com/lodash/keys/%7B%22a%22:1,%22b%22:2%7D/reverse.join/-/'
# → "b-a"

# String methods: toUpperCase, toLowerCase, trim, split...
curl https://api.npxall.com/lodash/camelCase/hello%20world/toUpperCase/
# → "HELLOWORLD"
```

### Timeouts & limits

| Limit | Default | Env var |
|-------|---------|---------|
| Install timeout | 60s | `INSTALL_TIMEOUT_MS` |
| Execution timeout | 20s | `EXEC_TIMEOUT_MS` |
| Cache size | 500 MB | `CACHE_MAX_MB` |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET/POST` | `/:package/:method/:args/...` | Execute pipeline |
| `GET` | `/health` | Health check + cache stats |
| `GET` | `/` | API info |

---

## MCP Server

**URL:** `https://mcp.npxall.com/mcp` (Streamable HTTP) or `https://mcp.npxall.com/sse` (SSE)

Add to Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "npxall": {
      "type": "http",
      "url": "https://mcp.npxall.com/mcp"
    }
  }
}
```

Single `call` tool with parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `package` | string | yes | npm package name |
| `method` | string | no | Function/method name |
| `args` | array | no | Native JSON arguments |

```json
{ "package": "ms", "args": [86400000] }                    → "1d"
{ "package": "lodash", "method": "camelCase", "args": ["hello world"] }  → "helloWorld"
{ "package": "uuid", "method": "v4" }                      → "550e8400-..."
```

---

## Web UI

Browse exported functions for any package at **[adrienj.github.io/npxall](https://adrienj.github.io/npxall/)** — type a package name and see every function with its signature, description, and ready-to-run CLI example.

---

## How it works

1. On first use, the package is installed into a cache dir (`~/.npxall/` for CLI, `/app/cache/` for API/MCP).
2. The package is loaded via `require` or dynamic `import()` depending on its module format.
3. Arguments are JSON-parsed where possible, falling back to strings.
4. The result is printed to stdout (CLI) or returned as JSON (API/MCP).
5. Packages are cached with LRU eviction (API/MCP) or indefinitely (CLI).

### Timeouts

- **Install**: 60s max (configurable via `INSTALL_TIMEOUT_MS`)
- **Execution**: 20s max (configurable via `EXEC_TIMEOUT_MS`)

---

## Development

```bash
git clone https://github.com/adrienj/npxall.git
cd npxall
npm install
npm test              # CLI tests (262 tests)

cd api && npm install
npm test              # API tests (49 tests)

cd ../mcp && npm install
npm test              # MCP tests (36 tests)
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)
