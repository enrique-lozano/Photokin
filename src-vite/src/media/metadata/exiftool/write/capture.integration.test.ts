import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { useExiftoolTestSession } from '../exiftoolTestSession';
import { metadataWriteArgs } from './exiftool-write';

const runExiftool = useExiftoolTestSession();
describe('capture metadata round-trip', () => {
  it('writes and clears canonical capture fields on a temporary JPEG', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'photokin-capture-'));
    const source = fileURLToPath(
      new URL('../../../../../../demo/exif-samples/jpg/Canon_40D.jpg', import.meta.url),
    );
    const target = path.join(directory, 'capture.jpg');
    const argumentFile = path.join(directory, 'arguments.txt');
    try {
      copyFileSync(source, target);
      const fields = {
        make: 'Canon',
        model: 'EOS R10',
        lens: 'RF 18-150mm',
        focalLength: '150',
        shutterSpeed: '0.0015625',
        aperture: 7.1,
        iso: 160,
        exposureCompensation: '0.3333333333333333',
        exposureProgram: 'Shutter speed priority AE',
        meteringMode: 3,
        whiteBalance: 'Auto',
        flash: 'No Flash',
      };
      writeFileSync(
        argumentFile,
        [...metadataWriteArgs(fields), '-overwrite_original', target].join('\n') + '\n',
      );
      const written = await runExiftool(['-@', argumentFile]);
      expect(written.stderr.trim()).toBe('');
      const read = async () => {
        const { stdout } = await runExiftool([
          '-json',
          '-Make',
          '-Model',
          '-LensModel',
          // Groupless `Lens` would also return Canon's Composite:Lens.
          '-XMP-aux:Lens',
          '-FocalLength#',
          '-ExposureTime#',
          '-FNumber#',
          '-ISO#',
          '-ExposureCompensation#',
          '-MeteringMode#',
          '-WhiteBalance',
          '-Flash',
          '-ExposureProgram',
          target,
        ]);
        return (JSON.parse(stdout) as Record<string, unknown>[])[0];
      };
      const result = await read();
      expect(result).toMatchObject({
        Make: 'Canon',
        Model: 'EOS R10',
        LensModel: 'RF 18-150mm',
        Lens: 'RF 18-150mm',
        FocalLength: 150,
        FNumber: 7.1,
        ISO: 160,
        MeteringMode: 3,
        WhiteBalance: 'Auto',
        Flash: 'No Flash',
      });
      expect(Number(result.ExposureTime)).toBeCloseTo(1 / 640);
      expect(Number(result.ExposureCompensation)).toBeCloseTo(1 / 3);
      const cleared = Object.fromEntries(Object.keys(fields).map((key) => [key, null]));
      writeFileSync(
        argumentFile,
        [...metadataWriteArgs(cleared), '-overwrite_original', target].join('\n') + '\n',
      );
      expect((await runExiftool(['-@', argumentFile])).stderr.trim()).toBe('');
      const after = await read();
      for (const tag of [
        'Make',
        'Model',
        'LensModel',
        'Lens',
        'ExposureTime',
        'FNumber',
        'ISO',
        'FocalLength',
      ])
        expect(after[tag]).toBeUndefined();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 10_000);

  it('surfaces command failures and can read again afterwards', async () => {
    await expect(
      runExiftool(['-json', path.join(tmpdir(), `photokin-missing-${randomUUID()}.jpg`)]),
    ).rejects.toThrow(/File not found/i);
    expect((await runExiftool(['-ver'])).stdout.trim()).toMatch(/^\d+\.\d+$/);
  });
});
