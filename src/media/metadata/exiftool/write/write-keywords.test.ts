import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeExiftoolWithArgs = vi.fn();

// Keyword writes go through the UTF-8 argfile transport (never raw argv), so we
// mock that seam and assert on the exiftool arguments it receives.
vi.mock('./exiftool-run', () => ({
  executeExiftoolWithArgs: (...args: unknown[]) => executeExiftoolWithArgs(...args),
}));

// The pre-write probe (see preserveOnWrite) finds nothing here, so these
// assertions stay about the keyword schemes alone.
vi.mock('../exiftoolSession', () => ({
  runExiftoolSession: vi.fn().mockResolvedValue('[]'),
}));

import { keywordsWriteArgs, writeKeywordsToFiles } from './write-keywords';

/** Non-ASCII sample that Windows' argv encoding used to mangle into "?????". */
const SPECIAL = 'æÆøØåÅéÉüÜäÄöÖïÏñÑ';

/** Items of a list scheme, in order, ignoring the leading clear assignment. */
function _listValues(args: string[], prefix: string): string[] {
  return args
    .filter((arg) => arg.startsWith(`${prefix}=`) && arg !== `${prefix}=`)
    .map((arg) => arg.slice(prefix.length + 1));
}

function _scalarValue(args: string[], prefix: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${prefix}=`))?.slice(prefix.length + 1);
}

describe('keywordsWriteArgs', () => {
  it('writes each scheme in its own format and to its exact group', () => {
    const args = keywordsWriteArgs({
      fullPath: 'C:/photos/a.jpg',
      tagPaths: ['actor', 'People/Alejandro López'],
    });

    // Hierarchical schemes keep the full path, each with its own separator.
    expect(_listValues(args, '-XMP-lr:HierarchicalSubject')).toEqual(['actor', 'People|Alejandro López']);
    expect(_listValues(args, '-XMP-microsoft:LastKeywordXMP')).toEqual(['actor', 'People/Alejandro López']);
    expect(_listValues(args, '-XMP-digiKam:TagsList')).toEqual(['actor', 'People/Alejandro López']);
    // CatalogSets must target XMP-mediapro, not the higher-priority IPTC copy.
    expect(_listValues(args, '-XMP-mediapro:CatalogSets')).toEqual(['actor', 'People|Alejandro López']);
    // Flat schemes keep the leaf name only.
    expect(_listValues(args, '-IPTC:Keywords')).toEqual(['actor', 'Alejandro López']);
    expect(_listValues(args, '-XMP-dc:Subject')).toEqual(['actor', 'Alejandro López']);
    // XPKeywords is a single semicolon-joined string of leaves.
    expect(_scalarValue(args, '-EXIF:XPKeywords')).toBe('actor;Alejandro López');

    expect(args).toContain('-m');
    expect(args.at(-1)).toBe('C:/photos/a.jpg');
    expect(args.at(-2)).toBe('-overwrite_original');
  });

  it('clears every list scheme before appending so stale keywords are replaced', () => {
    const args = keywordsWriteArgs({ fullPath: 'C:/photos/a.jpg', tagPaths: ['x'] });
    // The clear (empty assignment) must precede the appended item.
    const catalog = args.filter((arg) => arg.startsWith('-XMP-mediapro:CatalogSets='));
    expect(catalog).toEqual(['-XMP-mediapro:CatalogSets=', '-XMP-mediapro:CatalogSets=x']);
  });

  it('serializes ACDSee Categories as nested XML with Assigned flags', () => {
    const args = keywordsWriteArgs({
      fullPath: 'C:/photos/a.jpg',
      tagPaths: ['landscape', 'Places/Spain/Madrid'],
    });

    expect(_scalarValue(args, '-XMP-acdsee:Categories')).toBe(
      '<Categories>' +
        '<Category Assigned="1">landscape</Category>' +
        '<Category Assigned="0">Places' +
        '<Category Assigned="0">Spain' +
        '<Category Assigned="1">Madrid</Category>' +
        '</Category>' +
        '</Category>' +
        '</Categories>',
    );
  });

  it('escapes XML-special characters in ACDSee Categories', () => {
    const args = keywordsWriteArgs({ fullPath: 'C:/photos/a.jpg', tagPaths: ['A & B < C'] });
    expect(_scalarValue(args, '-XMP-acdsee:Categories')).toBe(
      '<Categories><Category Assigned="1">A &amp; B &lt; C</Category></Categories>',
    );
  });

  it('clears every scheme when the tag set is empty', () => {
    const args = keywordsWriteArgs({ fullPath: 'C:/photos/a.jpg', tagPaths: [] });
    for (const prefix of [
      '-XMP-lr:HierarchicalSubject',
      '-XMP-microsoft:LastKeywordXMP',
      '-IPTC:Keywords',
      '-XMP-mediapro:CatalogSets',
      '-XMP-digiKam:TagsList',
      '-XMP-acdsee:Categories',
      '-XMP-dc:Subject',
      '-EXIF:XPKeywords',
    ]) {
      expect(args).toContain(`${prefix}=`);
    }
  });

  it('deduplicates leaf names shared by different paths in flat schemes', () => {
    const args = keywordsWriteArgs({
      fullPath: 'C:/photos/a.jpg',
      tagPaths: ['People/Chris', 'Work/Chris'],
    });
    expect(_listValues(args, '-IPTC:Keywords')).toEqual(['Chris']);
    // Hierarchical schemes keep both distinct paths.
    expect(_listValues(args, '-XMP-lr:HierarchicalSubject')).toEqual(['People|Chris', 'Work|Chris']);
  });

  it('preserves non-ASCII characters verbatim in every scheme', () => {
    const args = keywordsWriteArgs({
      fullPath: 'C:/photos/a.jpg',
      tagPaths: [`People/${SPECIAL}`],
    });

    // Flat, hierarchical and joined schemes all carry the raw characters — the
    // corruption never happened here, it happened in transport (see exiftool-run).
    expect(_listValues(args, '-IPTC:Keywords')).toEqual([SPECIAL]);
    expect(_listValues(args, '-XMP-lr:HierarchicalSubject')).toEqual([`People|${SPECIAL}`]);
    expect(_scalarValue(args, '-EXIF:XPKeywords')).toBe(SPECIAL);
    expect(_scalarValue(args, '-XMP-acdsee:Categories')).toContain(SPECIAL);
    expect(args).not.toContain('?');
  });

  it('drops empty and whitespace-only tag paths', () => {
    const args = keywordsWriteArgs({
      fullPath: 'C:/photos/a.jpg',
      tagPaths: ['', '   ', 'People//   //Chris', '/', 'Solo'],
    });

    // Empty segments collapse; only real leaves survive.
    expect(_listValues(args, '-IPTC:Keywords')).toEqual(['Chris', 'Solo']);
    expect(_listValues(args, '-XMP-lr:HierarchicalSubject')).toEqual(['People|Chris', 'Solo']);
  });

  it('strips control characters so a keyword can never break the argfile', () => {
    const args = keywordsWriteArgs({
      fullPath: 'C:/photos/a.jpg',
      tagPaths: [' hel\nlo\t', 'a\r\nb'],
    });

    // Newlines/tabs are removed (they would split the line-based argfile), and
    // no produced argument contains a line break.
    expect(_listValues(args, '-IPTC:Keywords')).toEqual(['hello', 'ab']);
    expect(args.every((arg) => !/[\r\n]/.test(arg))).toBe(true);
  });
});

describe('writeKeywordsToFiles', () => {
  beforeEach(() => {
    executeExiftoolWithArgs.mockReset();
    executeExiftoolWithArgs.mockResolvedValue({ code: 0 });
  });

  it('batches multiple files into one ExifTool process via the argfile transport', async () => {
    await writeKeywordsToFiles([
      { fullPath: 'C:/photos/a.jpg', tagPaths: ['x'] },
      { fullPath: 'C:/photos/b.jpg', tagPaths: ['y'] },
    ]);

    expect(executeExiftoolWithArgs).toHaveBeenCalledTimes(1);
    const args = executeExiftoolWithArgs.mock.calls[0][0] as string[];
    expect(args.filter((arg) => arg === '-execute')).toHaveLength(2);
    expect(args).toContain('C:/photos/a.jpg');
    expect(args).toContain('C:/photos/b.jpg');
  });

  it('does not spawn ExifTool when there is nothing to write', async () => {
    await writeKeywordsToFiles([]);
    expect(executeExiftoolWithArgs).not.toHaveBeenCalled();
  });
});
