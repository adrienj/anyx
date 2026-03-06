import { lookup } from './lookup';
import type { FnDoc } from './lookup';

const app = document.querySelector<HTMLDivElement>('#app')!;

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function searchHtml(value = '') {
  return `
    <header>
      <div class="logo">anyx</div>
      <p class="tagline">Run any npm function from the command line</p>
      <form id="search" class="search-wrap">
        <input name="pkg" value="${escHtml(value)}" placeholder="lodash, semver, ms, @turf/turf…" autocomplete="off" autofocus />
        <button type="submit">→</button>
      </form>
    </header>
  `;
}

function cardHtml(fn: FnDoc, i: number): string {
  const params = fn.params.map(p =>
    `<span class="param${p.optional ? ' opt' : ''}">${escHtml(p.name)}: ${escHtml(p.type)}</span>`
  ).join(', ');

  const delay = Math.min(i * 25, 500);
  const copyText = escHtml(fn.cliExample);
  const retBadge = fn.returnType && fn.returnType !== 'unknown'
    ? `<span class="ret-badge">→ ${escHtml(fn.returnType)}</span>`
    : '';

  return `
    <div class="card" style="--delay:${delay}ms">
      <div class="card-head">
        <span class="fn-name">${escHtml(fn.name)}</span>
        ${retBadge}
      </div>
      ${fn.doc ? `<p class="doc">${escHtml(fn.doc)}</p>` : ''}
      <div class="sig">(${params})</div>
      <div class="cli-block">
        <span class="cli-prompt">›</span>
        <pre class="cli">${copyText}</pre>
        <button class="copy-btn" data-copy="${copyText}" type="button">copy</button>
      </div>
    </div>
  `;
}

function attach() {
  document.querySelector<HTMLFormElement>('#search')?.addEventListener('submit', e => {
    e.preventDefault();
    const pkg = (e.currentTarget as HTMLFormElement).pkg.value.trim();
    if (pkg) run(pkg);
  });
}

function loadingHtml(pkg: string) {
  return `<p class="status">Loading <strong>${escHtml(pkg)}</strong><span class="dots"><span></span><span></span><span></span></span></p>`;
}

async function run(pkg: string) {
  app.innerHTML = searchHtml(pkg) + loadingHtml(pkg);
  attach();
  try {
    const fns = await lookup(pkg);
    app.innerHTML = searchHtml(pkg)
      + `<p class="status">${fns.length} functions — <strong>${escHtml(pkg)}</strong></p>`
      + `<div class="grid">${fns.map((fn, i) => cardHtml(fn, i)).join('')}</div>`;
    attach();
    history.replaceState(null, '', `#${encodeURIComponent(pkg)}`);

    // Copy-to-clipboard delegation
    app.querySelector('.grid')?.addEventListener('click', e => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('.copy-btn');
      if (!btn) return;
      const text = btn.dataset.copy ?? '';
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'copy';
          btn.classList.remove('copied');
        }, 1800);
      }).catch(() => { /* clipboard permission denied — silent */ });
    });
  } catch (e: unknown) {
    app.innerHTML = searchHtml(pkg) + `<p class="error">${escHtml(e instanceof Error ? e.message : String(e))}</p>`;
    attach();
  }
}

app.innerHTML = searchHtml();
attach();

// Auto-load from URL hash: /anyx/#semver
const hash = location.hash.slice(1);
if (hash) run(decodeURIComponent(hash));
