export interface TypesEntry {
  pkg: string;   // npm package containing the .d.ts (may be @types/name)
  file: string;  // relative path to entry .d.ts, e.g. "index.d.ts"
}

async function fetchMeta(pkg: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function resolveTypesEntry(pkg: string): Promise<TypesEntry | null> {
  const meta = await fetchMeta(pkg);
  if (meta) {
    const typesFile = (meta['types'] ?? meta['typings']) as string | undefined;
    if (typesFile) return { pkg, file: typesFile };
  }

  // Skip @types fallback if already an @types package
  if (pkg.startsWith('@types/')) return null;

  // Fallback: try @types/{unscoped-name}
  const unscoped = pkg.startsWith('@') ? pkg.split('/')[1] : pkg;
  const typesMeta = await fetchMeta(`@types/${unscoped}`);
  if (typesMeta) {
    const typesFile = ((typesMeta['types'] ?? typesMeta['typings']) as string | undefined) ?? 'index.d.ts';
    return { pkg: `@types/${unscoped}`, file: typesFile };
  }

  return null;
}
