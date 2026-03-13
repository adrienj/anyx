const app = document.querySelector<HTMLDivElement>('#app')!;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Terminal demo ─────────────────────────────────────────────────────────────

const DEMOS: Array<{ cmd: string; result: string }> = [
  // CLI
  { cmd: 'npxall pretty-bytes 1073741824',                                    result: '1 GB'             },
  { cmd: 'npxall change-case camelCase "hello world"',                        result: 'helloWorld'       },
  { cmd: 'npxall validator isEmail "user@example.com"',                       result: 'true'             },
  { cmd: "npxall lodash chunk '[1,2,3,4,5,6]' 2",                            result: '[[1,2],[3,4],[5,6]]' },
  { cmd: 'npxall lodash "foo bar" . split " " . reverse . join "-"',          result: 'bar-foo'          },
  // API
  { cmd: 'curl api.npxall.com/ms/60000',                                      result: '"1m"'             },
  { cmd: 'curl api.npxall.com/lodash/camelCase/hello%20world',                result: '"helloWorld"'     },
  { cmd: 'curl api.npxall.com/lodash/chunk/%5B1,2,3,4%5D,2',                 result: '[[1,2],[3,4]]'    },
  { cmd: 'curl api.npxall.com/lodash/concat/%5B1,2%5D,3/reverse/',           result: '[3,2,1]'          },
];

async function startTerminalDemo(): Promise<void> {
  let i = 0;
  while (true) {
    const body = document.getElementById('term-body');
    if (!body) return;

    const demo = DEMOS[i % DEMOS.length];

    const line = document.createElement('div');
    line.className = 'tl';
    // Safe: static HTML with no user input
    line.innerHTML = '<span class="tp">%</span><span class="tc"></span><span class="tk">&#x2588;</span>';
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;

    const tc = line.querySelector<HTMLSpanElement>('.tc')!;
    const tk = line.querySelector<HTMLSpanElement>('.tk')!;

    for (const char of demo.cmd) {
      if (!document.getElementById('term-body')) return;
      tc.textContent += char;
      await sleep(36 + Math.random() * 24);
    }

    await sleep(200);
    tk.remove();
    await sleep(80);

    const res = document.createElement('div');
    res.className = 'tr';
    res.textContent = demo.result;
    body.appendChild(res);
    body.scrollTop = body.scrollHeight;

    await sleep(2000);
    while (body.children.length > 12) body.children[0].remove();
    i++;
  }
}

// ── Landing ───────────────────────────────────────────────────────────────────

function exCard(label: string, cmd: string, result: string): string {
  return `
    <div class="ex-card">
      <div class="ex-label">${escHtml(label)}</div>
      <div class="ex-cmd"><span class="ex-dollar">$</span> ${escHtml(cmd)}</div>
      <div class="ex-result">${escHtml(result)}</div>
    </div>
  `;
}

// All template content below is static/hardcoded — no user input flows into innerHTML.
// The escHtml helper is used as defense-in-depth on hardcoded strings.
function landingHtml(): string {
  return `
    <section class="landing">

      <header>
        <a class="logo" href="/">npxall</a>
        <p class="tagline">Run any npm function from the command line</p>
      </header>

      <div class="term-window">
        <div class="term-bar">
          <span class="tdot" style="background:#ff5f57"></span>
          <span class="tdot" style="background:#febc2e"></span>
          <span class="tdot" style="background:#28c840"></span>
          <span class="tbar-title">zsh</span>
        </div>
        <div class="term-body" id="term-body"></div>
      </div>

      <div class="syntax-note">
        Use <code>npx npxall</code> without installing &mdash; or <code>npm install -g npxall</code> for the short form <code>npxall</code>
      </div>

      <div class="feat-row">
        <span class="feat-badge feat-primary">2M+ packages</span>
        <span class="feat-badge">Zero setup</span>
        <span class="feat-badge">Cached locally</span>
        <span class="feat-badge">Pipe-friendly</span>
        <span class="feat-badge">Method chaining</span>
        <span class="feat-badge">REST API</span>
        <span class="feat-badge">MCP Server</span>
      </div>

      <div class="install-strip">
        <div class="install-option">
          <span class="install-label">One-off</span>
          <code class="install-cmd">npx npxall &lt;package&gt; &lt;fn&gt; [args]</code>
        </div>
        <div class="install-divider">or</div>
        <div class="install-option">
          <span class="install-label">Global install</span>
          <code class="install-cmd">npm install -g npxall</code>
          <button class="install-copy" id="install-copy-btn">copy</button>
        </div>
      </div>

      <div class="ex-section">
        <h2 class="section-heading">One command. Any function.</h2>
        <div class="ex-grid">
          ${exCard('Format file size',   'npxall pretty-bytes 1073741824',                                       '1 GB')}
          ${exCard('Validate email',     'npxall validator isEmail "user@example.com"',                          'true')}
          ${exCard('Parse YAML',         "npxall yaml parse 'host: localhost\\nport: 5432'",                     '{"host":"localhost","port":5432}')}
          ${exCard('Compute math',       'npxall mathjs evaluate "2^10 + sqrt(144)"',                            '1036')}
          ${exCard('URL-safe slug',      "npxall slugify \"Hello World! 2024\" '{\"lower\":true,\"strict\":true}'", 'hello-world-2024')}
          ${exCard('Check semver range', 'npxall semver satisfies "1.5.0" "^1.0.0"',                             'true')}
          ${exCard('Method chaining',    'npxall lodash "foo bar" . split " " . reverse . join "-"',             'bar-foo')}
          ${exCard('Stdin piping',       'echo "Hello World" | npxall change-case snakeCase -',                  'hello_world')}
        </div>
      </div>

      <div class="how-section">
        <h2 class="section-heading">How it works</h2>
        <div class="steps">
          <div class="step">
            <div class="step-n">1</div>
            <div class="step-body">
              <div class="step-title">Type a package and function</div>
              <div class="step-desc">Any of 2 million packages on npm &mdash; no script, no boilerplate.</div>
            </div>
          </div>
          <div class="step">
            <div class="step-n">2</div>
            <div class="step-body">
              <div class="step-title">Downloads once, cached forever</div>
              <div class="step-desc">Packages live in <code>~/.npxall/</code>. Every subsequent call is instant.</div>
            </div>
          </div>
          <div class="step">
            <div class="step-n">3</div>
            <div class="step-body">
              <div class="step-title">Result goes to stdout</div>
              <div class="step-desc">JSON for objects, plain text for primitives. Pipe it anywhere.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="api-section">
        <h2 class="section-heading">REST API <span class="api-wink">&mdash; URL pipelines</span></h2>
        <p class="api-desc">
          Call any npm function over HTTP. Chain multiple operations in a single URL &mdash;
          each step's result feeds into the next. No query params, no body needed.
        </p>
        <div class="api-examples">
          <div class="api-example">
            <div class="api-method get">GET</div>
            <pre class="api-cmd">api.npxall.com/ms/60000</pre>
            <div class="api-result">&rarr; "1m"</div>
          </div>
          <div class="api-example">
            <div class="api-method get">GET</div>
            <pre class="api-cmd">api.npxall.com/lodash/camelCase/hello%20world</pre>
            <div class="api-result">&rarr; "helloWorld"</div>
          </div>
          <div class="api-example">
            <div class="api-method get">GET</div>
            <pre class="api-cmd">api.npxall.com/lodash/chunk/[1,2,3,4],2</pre>
            <div class="api-result">&rarr; [[1,2],[3,4]]</div>
          </div>
          <div class="api-example chain-highlight">
            <div class="api-method get">GET</div>
            <pre class="api-cmd">api.npxall.com/lodash/concat/[1,2],3/reverse.slice/0,1/</pre>
            <div class="api-result">&rarr; [3]  <span class="api-chain-note">chained: concat &rarr; reverse &rarr; slice</span></div>
          </div>
          <div class="api-example">
            <div class="api-method post">POST</div>
            <pre class="api-cmd">api.npxall.com/lodash/pick  body: [{"a":1,"b":2,"c":3}, ["a","c"]]</pre>
            <div class="api-result">&rarr; {"a":1,"c":3}</div>
          </div>
        </div>
        <div class="api-example chain-highlight">
          <div class="api-method get">GET</div>
          <pre class="api-cmd">api.npxall.com/lodash/keys/{"a":1,"b":2}/reverse.join/-/</pre>
          <div class="api-result">&rarr; "b-a"  <span class="api-chain-note">prototype methods: keys &rarr; reverse &rarr; join</span></div>
        </div>
        <div class="api-endpoints">
          <div class="api-endpoint-row"><code>GET /pkg/method/args/method/args/...</code><span>pipeline URL</span></div>
          <div class="api-endpoint-row"><code>POST /pkg/method</code><span>JSON array body as args</span></div>
          <div class="api-endpoint-row"><code>GET /@org/pkg/method/args</code><span>scoped packages</span></div>
          <div class="api-endpoint-row"><code>method.method</code><span>dot shorthand &mdash; chain no-arg calls</span></div>
          <div class="api-endpoint-row"><code>.reverse .join .toUpperCase .split</code><span>JS prototype methods work on results</span></div>
          <div class="api-endpoint-row"><code>20s exec / 60s install</code><span>timeouts prevent runaway requests</span></div>
        </div>
      </div>

      <div class="mcp-section">
        <h2 class="section-heading">MCP Server <span class="mcp-tag">for Claude, Cursor, etc.</span></h2>
        <p class="api-desc">
          Use npxall as an MCP tool &mdash; call any npm function directly from your AI assistant.
          One tool, every package. No setup required.
        </p>
        <div class="mcp-examples">
          <div class="mcp-example">
            <div class="mcp-label">Convert time</div>
            <pre class="mcp-code">{ "package": "ms", "args": [3600000] }</pre>
            <div class="mcp-result">&rarr; "1h"</div>
          </div>
          <div class="mcp-example">
            <div class="mcp-label">Chunk array</div>
            <pre class="mcp-code">{ "package": "lodash", "method": "chunk", "args": [[1,2,3,4,5,6], 2] }</pre>
            <div class="mcp-result">&rarr; [[1,2],[3,4],[5,6]]</div>
          </div>
          <div class="mcp-example">
            <div class="mcp-label">Validate email</div>
            <pre class="mcp-code">{ "package": "validator", "method": "isEmail", "args": ["user@test.com"] }</pre>
            <div class="mcp-result">&rarr; true</div>
          </div>
          <div class="mcp-example">
            <div class="mcp-label">Generate UUID</div>
            <pre class="mcp-code">{ "package": "uuid", "method": "v4" }</pre>
            <div class="mcp-result">&rarr; "f47ac10b-58cc-..."</div>
          </div>
        </div>
        <div class="mcp-config">
          <div class="mcp-config-label">Add to your MCP client config:</div>
          <pre class="mcp-config-code">{
  "mcpServers": {
    "npxall": {
      "url": "https://mcp.npxall.com/mcp"
    }
  }
}</pre>
        </div>
      </div>

      <footer class="site-footer">
        <a href="https://github.com/adrienj/npxall" target="_blank">GitHub</a>
        <span>&middot;</span>
        <a href="https://www.npmjs.com/package/npxall" target="_blank">npm</a>
        <span>&middot;</span>
        <span>MIT</span>
      </footer>

    </section>
  `;
}

function attachLanding() {
  document.getElementById('install-copy-btn')?.addEventListener('click', function(this: HTMLButtonElement) {
    navigator.clipboard.writeText('npm install -g npxall').then(() => {
      this.textContent = 'copied!';
      setTimeout(() => { this.textContent = 'copy'; }, 1800);
    }).catch(() => {});
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

app.innerHTML = landingHtml();
attachLanding();
startTerminalDemo();
