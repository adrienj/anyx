// Resolve a relative import path against a base directory
function resolve(base: string, rel: string): string {
  const parts = base.split('/');
  parts.pop(); // remove filename, keep directory
  for (const seg of rel.split('/')) {
    if (seg === '..') { if (parts.length > 0) parts.pop(); }
    else if (seg !== '.') parts.push(seg);
  }
  const path = parts.join('/');
  return path.endsWith('.d.ts') ? path : path + '.d.ts';
}

export async function fetchDts(pkg: string, file: string): Promise<string> {
  const url = `https://unpkg.com/${pkg}/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

const REFERENCE_RE   = /\/\/\/\s*<reference\s+path="([^"]+)"/g;
const REQUIRE_RE     = /import\s+(?:type\s+)?[\w.]+\s*=\s*require\("(\.\.?\/[^"]+)"\)/g;
const IMPORT_FROM_RE = /(?:import|export)[^"']*from\s+"(\.\.?\/[^"]+)"/g;

function extractRefs(src: string, currentFile: string): string[] {
  const refs: string[] = [];
  for (const re of [REFERENCE_RE, REQUIRE_RE, IMPORT_FROM_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      refs.push(resolve(currentFile, m[1]));
    }
  }
  return refs;
}

export async function fetchDtsRecursive(
  pkg: string,
  entryFile: string
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const visited = new Set<string>([entryFile]);
  const queue = [entryFile];
  while (queue.length > 0) {
    const file = queue.pop()!;
    try {
      const src = await fetchDts(pkg, file);
      files[file] = src;
      for (const ref of extractRefs(src, file)) {
        if (!visited.has(ref)) {
          visited.add(ref);
          queue.push(ref);
        }
      }
    } catch {
      // skip files that cannot be resolved
    }
  }
  return files;
}
