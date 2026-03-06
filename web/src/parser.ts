import ts from 'typescript';

export interface ParamInfo {
  name: string;
  type: string;
  optional: boolean;
}

export interface FnExport {
  name: string;
  params: ParamInfo[];
  returnType: string;
  doc?: string;
}

const _printer = ts.createPrinter();
const _dummy = ts.createSourceFile('_.ts', '', ts.ScriptTarget.Latest);

function typeText(node: ts.TypeNode | undefined): string {
  if (!node) return 'any';
  return _printer.printNode(ts.EmitHint.Unspecified, node, _dummy);
}

function extractDoc(node: ts.Node, src: ts.SourceFile): string | undefined {
  const trivia = src.text.slice(node.getFullStart(), node.getStart());
  const matches = [...trivia.matchAll(/\/\*\*([\s\S]*?)\*\//g)];
  if (!matches.length) return undefined;
  return matches[matches.length - 1][1].replace(/\s*\*\s?/g, ' ').trim();
}

export function parseExports(files: Record<string, string>): FnExport[] {
  const seen = new Set<string>();
  const result: FnExport[] = [];

  for (const [filename, content] of Object.entries(files)) {
    const src = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);

    function visit(node: ts.Node) {
      // export function foo(...)
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        const name = node.name.text;
        if (!seen.has(name)) {
          seen.add(name);
          result.push({
            name,
            params: node.parameters.map(p => ({
              name: p.name.getText(src),
              type: typeText(p.type),
              optional: !!p.questionToken || !!p.initializer,
            })),
            returnType: typeText(node.type),
            doc: extractDoc(node, src),
          });
        }
      }

      // export { x as y }
      if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          const name = el.name.text;
          if (!seen.has(name)) {
            seen.add(name);
            result.push({ name, params: [], returnType: 'unknown' });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(src);
  }

  return result;
}
