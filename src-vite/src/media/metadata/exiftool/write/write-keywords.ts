import { KEYWORD_SCHEMES, type KeywordScheme } from '../exiftool-fields';
import { runBatchedExiftoolWrites } from './exiftool-batch';
import { stripControlCharacters } from './stripControlCharacters';

export interface KeywordsFileEntry {
  fullPath: string;
  /** The asset's tag paths, `/`-separated (e.g. `People/Alejandro López`). */
  tagPaths: readonly string[];
}

/** Splits a tag path into clean, non-empty segments. */
function _segments(path: string): string[] {
  return path
    .split('/')
    .map((segment) => stripControlCharacters(segment).trim())
    .filter(Boolean);
}

function _unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function _xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

interface CategoryNode {
  name: string;
  /** `true` when a tag path ends here; `false` for a path-only ancestor node. */
  assigned: boolean;
  children: Map<string, CategoryNode>;
}

/** Serializes tag paths into ACDSee's nested category format. */
function _categoriesXml(pathSegments: string[][]): string {
  const roots = new Map<string, CategoryNode>();

  for (const segments of pathSegments) {
    let level = roots;
    segments.forEach((name, index) => {
      let node = level.get(name);
      if (!node) {
        node = { name, assigned: false, children: new Map() };
        level.set(name, node);
      }
      if (index === segments.length - 1) node.assigned = true;
      level = node.children;
    });
  }

  const render = (nodes: Map<string, CategoryNode>): string =>
    [...nodes.values()]
      .map(
        (node) =>
          `<Category Assigned="${node.assigned ? 1 : 0}">${_xmlEscape(node.name)}${render(node.children)}</Category>`,
      )
      .join('');

  return `<Categories>${render(roots)}</Categories>`;
}

/** Builds tag assignments for one keyword metadata scheme. */
function _schemeArgs(scheme: KeywordScheme, pathSegments: string[][]): string[] {
  const prefix = `-${scheme.writeGroup}:${scheme.tag}`;

  if (scheme.container === 'xml') {
    return [`${prefix}=${pathSegments.length > 0 ? _categoriesXml(pathSegments) : ''}`];
  }

  const values =
    scheme.pathSeparator === null
      ? _unique(pathSegments.map((segments) => segments.at(-1)!))
      : _unique(pathSegments.map((segments) => segments.join(scheme.pathSeparator!)));

  if (scheme.container === 'joined') {
    return [`${prefix}=${values.join(scheme.itemSeparator ?? ';')}`];
  }

  // List container: leading empty assignment clears, the rest append.
  return [`${prefix}=`, ...values.map((value) => `${prefix}=${value}`)];
}

/** Builds one file's keyword write command. */
export function keywordsWriteArgs(entry: KeywordsFileEntry): string[] {
  const pathSegments = entry.tagPaths.map(_segments).filter((segments) => segments.length > 0);

  const args = ['-m'];
  for (const scheme of KEYWORD_SCHEMES) {
    if (!scheme.write) continue;
    args.push(..._schemeArgs(scheme, pathSegments));
  }
  args.push('-overwrite_original', entry.fullPath);
  return args;
}

export async function writeKeywordsToFiles(
  entries: KeywordsFileEntry[],
  onProgress?: (processed: number, total: number) => void,
): Promise<Map<string, string>> {
  if (entries.length === 0) return new Map();

  return runBatchedExiftoolWrites(
    entries.map((entry) => ({ fullPath: entry.fullPath, args: keywordsWriteArgs(entry) })),
    onProgress,
  );
}
