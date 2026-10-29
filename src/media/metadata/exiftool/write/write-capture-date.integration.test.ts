import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { useExiftoolTestSession } from '../exiftoolTestSession';
import { captureDateWriteArgs } from './write-capture-date';

/**
 * End-to-end coverage for the capture-date writer against the real sample images
 * in `demo/`. It drives a persistent, bundled ExifTool with the production arguments
 * ({@link captureDateWriteArgs}), so the check exercises genuine EXIF/XMP/
 * IPTC/sub-second/offset landscapes rather than hand-written fixtures.
 *
 * The core guarantee: after a date edit, no creation-/modification-related date
 * tag is left carrying its old value, and none dangles as a stray fragment.
 *
 * The suite skips only when its demo images are absent; ExifTool comes from the
 * existing test dependency, so no system installation is needed.
 */
const runExiftool = useExiftoolTestSession();
const DEMO_DIR = path.resolve(fileURLToPath(import.meta.url), '../../../../../../demo');

// Rich samples carrying EXIF + XMP + IPTC dates (and, for the second, an offset
// and sub-second parts) so every branch of the writer is exercised.
const RICH_IMAGES = ['images/IMG_5910.jpg', 'images/Nasa/art002e008487~orig.jpg'];
const availableImages = RICH_IMAGES.filter((relative) => existsSync(path.join(DEMO_DIR, relative)));

// A distinctive mid-day target so no timezone rendering crosses a day boundary.
const TARGET = new Date(Date.UTC(1999, 5, 15, 12, 0, 0));
const TARGET_DATE = '1999:06:15';
const TARGET_DATETIME = '1999:06:15 12:00:00';

// Time tags that are legitimately NOT the capture/modify date and must be left
// untouched: GPS fix time, edit history, ICC profile, camera diagnostics, the
// embedded preview's own date, and volatile filesystem access/create stamps.
const PRESERVED = new Set([
  'FileAccessDate',
  'FileCreateDate',
  'FileInodeChangeDate',
  'HistoryWhen',
  'ProfileDateTime',
  'GPSDateStamp',
  'GPSTimeStamp',
  'GPSDateTime',
  'PowerUpTime',
  'PreviewDateTime',
]);

interface TimeTag {
  group: string;
  tag: string;
  value: string;
}

async function _readTimeTags(file: string): Promise<TimeTag[]> {
  const { stdout } = await runExiftool(['-json', '-G1', '-a', '-s', '-time:all', file]);
  const [record] = JSON.parse(stdout) as Record<string, unknown>[];

  const tags: TimeTag[] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (key === 'SourceFile') continue;
    const colon = key.indexOf(':');
    const group = colon === -1 ? '' : key.slice(0, colon);
    const tag = colon === -1 ? key : key.slice(colon + 1);
    for (const value of Array.isArray(raw) ? raw : [raw]) tags.push({ group, tag, value: String(value) });
  }
  return tags;
}

const _datePart = (value: string): string | null => value.match(/\d{4}:\d{2}:\d{2}/)?.[0] ?? null;
const _looksLikeDate = (value: string): boolean => /\d{4}:\d{2}:\d{2}|\d{2}:\d{2}:\d{2}/.test(value);

describe.skipIf(availableImages.length === 0)('capture-date write on real demo images', () => {
  const workDir = mkdtempSync(path.join(tmpdir(), 'photokin-capdate-'));
  afterAll(() => rmSync(workDir, { recursive: true, force: true }));

  it.each(availableImages)(
    'leaves no creation-related date behind in %s',
    async (relative) => {
      const source = path.join(DEMO_DIR, relative);
      const dest = path.join(workDir, path.basename(relative).replace(/[^\w.]/g, '_'));
      copyFileSync(source, dest);

      const before = await _readTimeTags(dest);
      // The sample must actually carry several date namespaces to be meaningful.
      expect(before.some((entry) => entry.group.startsWith('XMP'))).toBe(true);
      expect(before.some((entry) => entry.group === 'IPTC')).toBe(true);

      const args = captureDateWriteArgs(
        { fullPath: dest, date: TARGET },
        {
          writeTaken: true,
          writeDigitized: true,
          writeModified: true,
          setFileModifyTime: true,
          onlyExistingTags: false,
        },
      );
      await runExiftool(args);

      const after = await _readTimeTags(dest);

      // (1) No non-preserved date tag retains a date other than the target.
      const stray = after.filter(
        (entry) =>
          !PRESERVED.has(entry.tag) &&
          _looksLikeDate(entry.value) &&
          _datePart(entry.value) !== null &&
          _datePart(entry.value) !== TARGET_DATE,
      );
      expect(
        stray,
        `stray dates: ${stray.map((entry) => `${entry.group}:${entry.tag}=${entry.value}`).join(', ')}`,
      ).toEqual([]);

      // (2) The core EXIF/XMP/IPTC creation + modify tags are actually stamped.
      const valueOf = (group: string, tag: string) =>
        after.find((entry) => entry.group === group && entry.tag === tag)?.value ?? null;
      expect(valueOf('ExifIFD', 'DateTimeOriginal')).toBe(TARGET_DATETIME);
      expect(valueOf('ExifIFD', 'CreateDate')).toBe(TARGET_DATETIME);
      expect(valueOf('IFD0', 'ModifyDate')).toBe(TARGET_DATETIME);
      expect(valueOf('XMP-xmp', 'CreateDate')).toBe(TARGET_DATETIME);
      expect(valueOf('XMP-xmp', 'ModifyDate')).toBe(TARGET_DATETIME);
      expect(valueOf('XMP-photoshop', 'DateCreated')).toBe(TARGET_DATETIME);
      expect(_datePart(valueOf('IPTC', 'DateCreated') ?? '')).toBe(TARGET_DATE);
      expect(_datePart(valueOf('IPTC', 'DigitalCreationDate') ?? '')).toBe(TARGET_DATE);

      // IPTC time tags carry an explicit UTC offset, not the machine-local one.
      expect(valueOf('IPTC', 'TimeCreated')).toBe('12:00:00+00:00');
      expect(valueOf('IPTC', 'DigitalCreationTime')).toBe('12:00:00+00:00');

      // (3) Sub-second and offset fragments were cleared, not left dangling.
      expect(after.some((entry) => entry.tag.startsWith('SubSecTime'))).toBe(false);
      expect(after.some((entry) => entry.tag.startsWith('OffsetTime'))).toBe(false);
    },
    10_000,
  );

  it('creates no XMP date copies on a file that has none (only updates existing)', async () => {
    const source = path.join(DEMO_DIR, availableImages[0]);
    const dest = path.join(workDir, 'no-xmp.jpg');
    copyFileSync(source, dest);
    // Strip the whole XMP block so we start from a file that has no XMP at all.
    await runExiftool(['-XMP:all=', '-overwrite_original', dest]);
    expect((await _readTimeTags(dest)).some((entry) => entry.group.startsWith('XMP'))).toBe(false);

    const args = captureDateWriteArgs(
      { fullPath: dest, date: TARGET },
      {
        writeTaken: true,
        writeDigitized: true,
        writeModified: true,
        setFileModifyTime: true,
        onlyExistingTags: false,
      },
    );
    await runExiftool(args);

    const after = await _readTimeTags(dest);
    const xmpDate = (tag: string) =>
      after.find((entry) => entry.group.startsWith('XMP') && entry.tag === tag)?.value ?? null;

    // Group-less writes must NOT resurrect XMP copies that weren't there.
    for (const tag of ['DateTimeOriginal', 'DateCreated', 'CreateDate', 'ModifyDate']) {
      expect(xmpDate(tag), `unexpected XMP:${tag}`).toBeNull();
    }
    // MetadataDate is XMP-only and written explicitly, so it's the one deliberate exception.
    expect(xmpDate('MetadataDate')).toBe(TARGET_DATETIME);

    // The canonical EXIF/IPTC copies are still stamped.
    const valueOf = (group: string, tag: string) =>
      after.find((entry) => entry.group === group && entry.tag === tag)?.value ?? null;
    expect(valueOf('ExifIFD', 'DateTimeOriginal')).toBe(TARGET_DATETIME);
    expect(valueOf('ExifIFD', 'CreateDate')).toBe(TARGET_DATETIME);
    expect(valueOf('IFD0', 'ModifyDate')).toBe(TARGET_DATETIME);
    expect(_datePart(valueOf('IPTC', 'DateCreated') ?? '')).toBe(TARGET_DATE);
  }, 10_000);
});
