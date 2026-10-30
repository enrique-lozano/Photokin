import { initialEdit } from '@/media/edit/editGeometry';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discardImageEditor,
  loadImageEditor,
  prepareImageEditor,
  previewImageEditor,
  saveImageEditor,
} from './assetImageEdit';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  execute: vi.fn(),
  first: vi.fn(),
  select: vi.fn(),
  asset: vi.fn(),
  exif: vi.fn(),
  exists: vi.fn(),
  importFiles: vi.fn(),
  refresh: vi.fn(),
  thumbnail: vi.fn(),
  update: vi.fn(),
  preview: vi.fn(),
  deletePreview: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/path', () => ({
  dirname: async () => 'C:/photos',
  join: async (...parts: string[]) => parts.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({ exists: mocks.exists, stat: async () => ({ size: 1000 }) }));
vi.mock('@/db/connection/db.service', () => ({
  executeInDB: mocks.execute,
  selectFirstFromDB: mocks.first,
  selectFromDB: mocks.select,
}));
vi.mock('@/db/connection/kysely', () => {
  function query(table: string) {
    const builder = {
      table,
      changes: {},
      where: vi.fn(() => builder),
      leftJoin: () => builder,
      selectAll: () => builder,
      select: () => builder,
      orderBy: () => builder,
      set: (changes: object) => {
        builder.changes = changes;
        return builder;
      },
    };
    return builder;
  }
  return { kyselyDB: { selectFrom: query, updateTable: query, deleteFrom: query } };
});
vi.mock('@/media/metadata/metadataScanState', () => ({ hasScannedMetadata: () => true }));
vi.mock('@/media/metadata/exiftool/write/exiftool-run', () => ({ executeExiftoolWithArgs: mocks.exif }));
vi.mock('@/media/thumbnails/preview', () => ({
  deletePreviewOfFile: mocks.deletePreview,
  getOrCreateFullPreview: mocks.preview,
}));
vi.mock('@/media/thumbnails/thumbnail', () => ({ regenerateThumbnailOfFile: mocks.thumbnail }));
vi.mock('./assetQueries', () => ({ getByUUID: mocks.asset }));
vi.mock('./assetRows', () => ({ refreshFileTracking: mocks.refresh, updateAssetRow: mocks.update }));
vi.mock('./assetImport', () => ({ insertFilesByPaths: mocks.importFiles }));

describe('photo editor save pipeline', () => {
  beforeEach(async () => {
    await discardImageEditor('photo');
    vi.clearAllMocks();
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'sha256_file') return 'unchanged';
      if (command === 'preview_image_edit')
        return {
          previewPath: 'C:/cache/editor.png',
          width: 1000,
          height: 800,
          bytes: 500,
          profileBytes: 0,
        };
      if (command === 'prepare_image_edit')
        return {
          tempPath: 'C:/photos/.photokin-edit-1.jpg',
          sourceHash: 'unchanged',
          width: 500,
          height: 400,
          bytes: 800,
        };
    });
    mocks.asset.mockResolvedValue({
      id: 'photo',
      filename: 'photo.jpg',
      fullPath: 'C:/photos/photo.jpg',
      filesize: 2000,
      isTrashed: false,
      album: { id: 'album' },
      metadata: { width: 1000, height: 800 },
    });
    mocks.first.mockResolvedValue({ id: 'photo', pendingFileWrite: 0 });
    mocks.select.mockResolvedValue([
      {
        id: 'face-1',
        assetId: 'photo',
        tagId: 'person',
        confirmed: 1,
        personName: 'Someone',
        x: 0.3,
        y: 0.4,
        w: 0.2,
        h: 0.2,
      },
    ]);
    mocks.exists.mockResolvedValue(false);
    mocks.exif.mockResolvedValue({ code: 0, stdout: '1 image files updated' });
    mocks.importFiles.mockResolvedValue(1);
    mocks.thumbnail.mockResolvedValue(undefined);
    mocks.preview.mockResolvedValue('C:/cache/full.webp');
  });

  it.each([
    ['photo.jpg', 'jpg', true],
    ['photo.JPEG', 'jpg', true],
    ['photo.PNG', 'png', true],
    ['photo.webp', 'webp', true],
    ['photo.heic', 'jpg', false],
    ['photo.ARW', 'jpg', false],
    ['photo.nef', 'jpg', false],
    ['photo.dng', 'jpg', false],
    ['photo.tiff', 'jpg', false],
    ['photo.avif', 'jpg', false],
    ['photo.jxl', 'jpg', false],
  ] as const)(
    'keeps the original output format for crop-only edits of %s',
    async (filename, format, canOverwrite) => {
      mocks.asset.mockResolvedValue({
        ...(await mocks.asset()),
        filename,
        fullPath: `C:/photos/${filename}`,
      });
      const data = await loadImageEditor('photo');
      expect(data.format).toBe(format);
      expect(data.canOverwrite).toBe(canOverwrite);
      const edit = {
        ...initialEdit(data.width, data.height, data.format),
        crop: [0, 0, 0.5, 0.5] as [number, number, number, number],
        width: 500,
        height: 400,
      };
      const prepared = await prepareImageEditor('photo', edit);
      expect(mocks.invoke).toHaveBeenCalledWith(
        'prepare_image_edit',
        expect.objectContaining({
          edit: expect.objectContaining({ format }),
          decodePath: canOverwrite ? null : 'C:/cache/full.webp',
        }),
      );
      expect(prepared.suggestedName).toBe(`photo_edited.${format}`);
      expect(mocks.exif).toHaveBeenCalledWith(
        expect.arrayContaining(['-all:all', '-ICC_Profile']),
        expect.any(Function),
      );
    },
  );

  it.each(['jpg', 'JPEG', 'png', 'webp'])(
    'opens %s directly without generating or encoding a preview',
    async (extension) => {
      const fullPath = `C:/photos/photo.${extension}`;
      mocks.asset.mockResolvedValue({
        ...(await mocks.asset()),
        filename: `photo.${extension}`,
        fullPath,
      });
      const data = await loadImageEditor('photo');
      expect(data.previewPath).toBe(fullPath);
      expect(mocks.preview).not.toHaveBeenCalled();
      expect(mocks.deletePreview).not.toHaveBeenCalled();
      expect(mocks.exif).not.toHaveBeenCalled();
      expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual(['sha256_file']);
    },
  );

  it('generates a fresh full-resolution decode fallback only for unsupported originals', async () => {
    mocks.asset.mockResolvedValue({
      ...(await mocks.asset()),
      filename: 'photo.heic',
      fullPath: 'C:/photos/photo.heic',
    });
    const data = await loadImageEditor('photo');
    expect(data.previewPath).toBe('C:/cache/full.webp');
    expect(mocks.deletePreview).toHaveBeenCalledWith('photo');
    expect(mocks.preview).toHaveBeenCalledOnce();
    expect(mocks.exif).not.toHaveBeenCalled();
    expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual(['sha256_file']);
  });

  it('reports a failed full-resolution decode rather than opening an unusable editor', async () => {
    mocks.asset.mockResolvedValue({
      ...(await mocks.asset()),
      filename: 'photo.heic',
      fullPath: 'C:/photos/photo.heic',
    });
    mocks.preview.mockResolvedValue(null);
    await expect(loadImageEditor('photo')).rejects.toThrow('could not be decoded');
  });

  it('preserves metadata before committing and keeps surviving face IDs', async () => {
    await loadImageEditor('photo');
    const prepared = await prepareImageEditor('photo', {
      ...initialEdit(1000, 800, 'jpg'),
      width: 500,
      height: 400,
    });
    expect(prepared.bytes).toBe(1000);
    expect(mocks.invoke.mock.calls.some(([command]) => command === 'commit_image_edit')).toBe(false);
    await saveImageEditor('photo', prepared.token, true, 'ignored.jpg');
    const regionUpdate = mocks.execute.mock.calls.find(([query]) => query.table === 'tagRegionInfo')?.[0];
    expect(regionUpdate.where).toHaveBeenCalledWith('id', '=', 'face-1');
    expect(regionUpdate.changes.x).toBeCloseTo(0.3);
    expect(mocks.refresh).toHaveBeenCalledWith('photo', 'C:/photos/photo.jpg');
  });

  it('samples compression without staging a save or copying metadata, and cleans up on discard', async () => {
    await loadImageEditor('photo');
    const result = await previewImageEditor('photo', { ...initialEdit(1000, 800, 'jpg'), quality: 80 });
    expect(result.bytes).toBe(500);
    expect(mocks.invoke).toHaveBeenCalledWith('preview_image_edit', {
      sourcePath: 'C:/photos/photo.jpg',
      format: 'jpg',
      quality: 80,
    });
    expect(mocks.exif).not.toHaveBeenCalled();
    expect(mocks.invoke.mock.calls.some(([command]) => command === 'prepare_image_edit')).toBe(false);
    await discardImageEditor('photo');
    expect(mocks.invoke).toHaveBeenCalledWith('clear_image_edit_preview');
  });

  it('samples unsupported sources from the full-resolution decode fallback', async () => {
    mocks.asset.mockResolvedValue({
      ...(await mocks.asset()),
      filename: 'photo.heic',
      fullPath: 'C:/photos/photo.heic',
    });
    await loadImageEditor('photo');
    await previewImageEditor('photo', initialEdit(1000, 800, 'jpg'));
    expect(mocks.invoke).toHaveBeenCalledWith('preview_image_edit', {
      sourcePath: 'C:/cache/full.webp',
      format: 'jpg',
      quality: 92,
    });
    await expect(previewImageEditor('photo', initialEdit(1000, 800, 'png'))).rejects.toThrow('JPEG copy');
  });

  it('discards the staged file and never commits when metadata preservation fails', async () => {
    await loadImageEditor('photo');
    mocks.exif.mockResolvedValue({ code: 1, stdout: 'failed' });
    await expect(prepareImageEditor('photo', initialEdit(1000, 800, 'jpg'))).rejects.toThrow('Metadata');
    expect(mocks.invoke).toHaveBeenCalledWith('discard_image_edit', expect.anything());
    expect(mocks.invoke.mock.calls.some(([command]) => command === 'commit_image_edit')).toBe(false);
  });

  it('refuses a source changed since opening', async () => {
    await loadImageEditor('photo');
    mocks.invoke.mockImplementation(async (command: string) =>
      command === 'prepare_image_edit'
        ? { tempPath: 'C:/photos/.photokin-edit-1.jpg', sourceHash: 'external change' }
        : undefined,
    );
    await expect(prepareImageEditor('photo', initialEdit(1000, 800, 'jpg'))).rejects.toThrow(
      'original changed',
    );
    expect(mocks.exif).not.toHaveBeenCalled();
  });

  it('blocks changed library metadata, destination collisions and stale preview tokens', async () => {
    await loadImageEditor('photo');
    const prepared = await prepareImageEditor('photo', initialEdit(1000, 800, 'jpg'));
    await expect(saveImageEditor('photo', 'stale', false, 'copy.jpg')).rejects.toThrow('Preview');
    mocks.exists.mockResolvedValue(true);
    await expect(saveImageEditor('photo', prepared.token, false, 'copy.jpg')).rejects.toThrow(
      'already exists',
    );
    mocks.first.mockResolvedValue({ id: 'photo', pendingFileWrite: 1 });
    await expect(saveImageEditor('photo', prepared.token, true, '')).rejects.toThrow('details changed');
    expect(mocks.invoke.mock.calls.some(([command]) => command === 'commit_image_edit')).toBe(false);
  });

  it('imports saved copies into the same album without changing the original DB row', async () => {
    await loadImageEditor('photo');
    const prepared = await prepareImageEditor('photo', initialEdit(1000, 800, 'jpg'));
    await saveImageEditor('photo', prepared.token, false, 'copy.jpg');
    expect(mocks.importFiles).toHaveBeenCalledWith(
      [{ absolutePath: 'C:/photos/copy.jpg', albumId: 'album', filename: 'copy.jpg' }],
      undefined,
      { includeGeolocation: true },
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reports a saved copy separately from a failed metadata import', async () => {
    await loadImageEditor('photo');
    const prepared = await prepareImageEditor('photo', initialEdit(1000, 800, 'jpg'));
    mocks.importFiles.mockRejectedValueOnce(new Error('metadata unavailable'));
    await expect(saveImageEditor('photo', prepared.token, false, 'copy.jpg')).rejects.toThrow('was saved');
    expect(mocks.invoke).toHaveBeenCalledWith('commit_image_edit', expect.anything());
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reports a saved file separately from a failed cache rebuild', async () => {
    await loadImageEditor('photo');
    const prepared = await prepareImageEditor('photo', initialEdit(1000, 800, 'jpg'));
    mocks.thumbnail.mockRejectedValueOnce(new Error('cache unavailable'));
    await expect(saveImageEditor('photo', prepared.token, true, '')).rejects.toThrow('was saved');
    expect(mocks.invoke).toHaveBeenCalledWith('commit_image_edit', expect.anything());
  });

  it.each([
    'Item info entries are out of order',
    'Bad SubIFD directory',
    'Creating non-standard IPTC in PNG',
    'Fixed incorrect URI for xmlns:MicrosoftPhoto',
  ])(
    'discards the stage on a metadata warning even when ExifTool exits successfully: %s',
    async (warning) => {
      await loadImageEditor('photo');
      mocks.exif.mockImplementation(async (_args, onStderr: (line: string) => void) => {
        onStderr(`Warning: ${warning}`);
        return { code: 0, stdout: '1 image files updated' };
      });
      await expect(prepareImageEditor('photo', initialEdit(1000, 800, 'jpg'))).rejects.toThrow('Metadata');
      expect(mocks.invoke).toHaveBeenCalledWith('discard_image_edit', expect.anything());
      expect(mocks.invoke.mock.calls.some(([command]) => command === 'commit_image_edit')).toBe(false);
      await expect(saveImageEditor('photo', 'missing', true, '')).rejects.toThrow('Preview');
    },
  );

  it.each(['C:/photos/photo.jpg.xmp', 'C:/photos/photo.xmp'])(
    'refuses an XMP sidecar at %s',
    async (sidecar) => {
      mocks.exists.mockImplementation(async (file: string) => file === sidecar);
      await expect(loadImageEditor('photo')).rejects.toThrow('sidecars');
      expect(mocks.invoke.mock.calls.some(([command]) => command === 'prepare_image_edit')).toBe(false);
    },
  );

  it.each(['png', 'webp'] as const)('refuses to overwrite a JPEG after conversion to %s', async (format) => {
    await loadImageEditor('photo');
    const prepared = await prepareImageEditor('photo', initialEdit(1000, 800, format));
    await expect(saveImageEditor('photo', prepared.token, true, '')).rejects.toThrow('format change');
    expect(mocks.invoke.mock.calls.some(([command]) => command === 'commit_image_edit')).toBe(false);
  });

  it.each(['../copy.jpg', 'C:\\copy.jpg', 'copy.png', 'photo.jpg', 'copy.jpg.', 'copy\n.jpg'])(
    'rejects unsafe, mismatched or original-copy filenames: %j',
    async (filename) => {
      await loadImageEditor('photo');
      const prepared = await prepareImageEditor('photo', initialEdit(1000, 800, 'jpg'));
      await expect(saveImageEditor('photo', prepared.token, false, filename)).rejects.toThrow();
      expect(mocks.invoke.mock.calls.some(([command]) => command === 'commit_image_edit')).toBe(false);
    },
  );

  it('keeps unsupported source formats copy-only and JPEG-only', async () => {
    mocks.asset.mockResolvedValue({
      ...(await mocks.asset()),
      filename: 'photo.heic',
      fullPath: 'C:/photos/photo.heic',
    });
    await loadImageEditor('photo');
    await expect(prepareImageEditor('photo', initialEdit(1000, 800, 'png'))).rejects.toThrow('JPEG copy');
    expect(mocks.invoke.mock.calls.some(([command]) => command === 'prepare_image_edit')).toBe(false);
    const prepared = await prepareImageEditor('photo', initialEdit(1000, 800, 'jpg'));
    await expect(saveImageEditor('photo', prepared.token, true, '')).rejects.toThrow('format change');
    expect(mocks.invoke.mock.calls.some(([command]) => command === 'commit_image_edit')).toBe(false);
  });
});
