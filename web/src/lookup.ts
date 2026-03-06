import { resolveTypesEntry } from './registry';
import { fetchDtsRecursive } from './fetcher';
import { parseExports } from './parser';
import { buildCliString } from './template';
import type { FnExport } from './parser';

export interface FnDoc {
  name: string;
  cliExample: string;
  doc?: string;
  params: FnExport['params'];
  returnType: string;
}

export async function lookup(pkg: string): Promise<FnDoc[]> {
  const entry = await resolveTypesEntry(pkg);
  if (!entry) {
    throw new Error(`No TypeScript types found for '${pkg}'. Try searching '@types/${pkg}' directly.`);
  }

  const files = await fetchDtsRecursive(entry.pkg, entry.file);
  const exports = parseExports(files);

  return exports
    .filter(fn => fn.params.length > 0 || fn.returnType !== 'unknown')
    .map(fn => ({
      name: fn.name,
      cliExample: buildCliString(pkg, fn.name, fn.params),
      doc: fn.doc,
      params: fn.params,
      returnType: fn.returnType,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
