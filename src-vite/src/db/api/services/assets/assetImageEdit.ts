import { getFileExtensionFromPath, isSupportedVideoPath } from '@/common/supportedFormats';
import { executeInDB, selectFirstFromDB, selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { transformRegion, type ImageEdit } from '@/media/edit/editGeometry';
import { editMetadataArgs } from '@/media/edit/editMetadata';
import type { EditorData, EditorPreview, PreparedEditorEdit } from '@/media/edit/editorProtocol';
import { executeExiftoolWithArgs } from '@/media/metadata/exiftool/write/exiftool-run';
import { AssetOrientation } from '@/media/metadata/fields/orientation';
import { hasScannedMetadata } from '@/media/metadata/metadataScanState';
import { deletePreviewOfFile, getOrCreateFullPreview } from '@/media/thumbnails/preview';
import { regenerateThumbnailOfFile } from '@/media/thumbnails/thumbnail';
import { invoke } from '@tauri-apps/api/core';
import { dirname, join } from '@tauri-apps/api/path';
import { exists, stat } from '@tauri-apps/plugin-fs';
import { insertFilesByPaths } from './assetImport';
import { getByUUID } from './assetQueries';
import { refreshFileTracking, updateAssetRow } from './assetRows';

type FaceRows = Awaited<ReturnType<typeof _readRegions>>;
interface EditSession {
  data: EditorData;
  sourceHash: string;
  regions: FaceRows;
  snapshot: string;
  prepared?: PreparedEditorEdit;
  edit?: ImageEdit;
  previewed?: boolean;
}
let session: EditSession | undefined;

function _readRegions(assetId: string) {
  return selectFromDB(
    kyselyDB
      .selectFrom('tagRegionInfo')
      .leftJoin('tags', 'tags.id', 'tagRegionInfo.tagId')
      .selectAll('tagRegionInfo')
      .select('tags.name as personName')
      .where('tagRegionInfo.assetId', '=', assetId)
      .orderBy('tagRegionInfo.id'),
  );
}

async function _assetSnapshot(assetId: string): Promise<string> {
  const row = await selectFirstFromDB(kyselyDB.selectFrom('assets').selectAll().where('id', '=', assetId));
  return JSON.stringify([row, await _readRegions(assetId)]);
}

function _outputFormat(filename: string): ImageEdit['format'] {
  const extension = getFileExtensionFromPath(filename).replace(/^\./, '').toLowerCase();
  return extension === 'png' || extension === 'webp' ? extension : 'jpg';
}

async function _discardPrepared(current: EditSession) {
  if (current.prepared) {
    await invoke('discard_image_edit', {
      sourcePath: current.data.fullPath,
      tempPath: current.prepared.tempPath,
    });
    current.prepared = undefined;
  }
}

async function _discardPreview(current: EditSession) {
  if (!current.previewed) return;
  await invoke('clear_image_edit_preview');
  current.previewed = false;
}

export async function loadImageEditor(assetId: string): Promise<EditorData> {
  if (session) {
    await _discardPrepared(session);
    await _discardPreview(session);
  }
  session = undefined;
  const asset = await getByUUID(assetId);
  if (asset.isTrashed || isSupportedVideoPath(asset.filename) || !hasScannedMetadata(asset)) {
    throw new Error('Choose a photo whose details have finished loading.');
  }
  const sourceHash = await invoke<string>('sha256_file', { path: asset.fullPath });
  const regions = await _readRegions(assetId);
  const snapshot = await _assetSnapshot(assetId);
  const extension = getFileExtensionFromPath(asset.filename).replace(/^\./, '').toLowerCase();
  const canOverwrite = ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
  let previewPath = asset.fullPath;
  if (!canOverwrite) {
    // This preview also supplies pixels when the native editor cannot decode the source.
    await deletePreviewOfFile(assetId);
    const generated = await getOrCreateFullPreview(asset);
    if (!generated) throw new Error('A full-resolution preview could not be decoded for this photo.');
    previewPath = generated;
  }
  const siblingSidecar = asset.fullPath.replace(/\.[^./\\]+$/, '.xmp');
  const hasSidecar = (await exists(`${asset.fullPath}.xmp`)) || (await exists(siblingSidecar));
  if (hasSidecar)
    throw new Error(
      'Editing photos with XMP sidecars is not supported yet. The original and sidecar have not been changed.',
    );
  const data: EditorData = {
    id: asset.id,
    filename: asset.filename,
    fullPath: asset.fullPath,
    previewPath,
    width: asset.metadata.width,
    height: asset.metadata.height,
    bytes: asset.filesize,
    format: _outputFormat(asset.filename),
    canOverwrite,
    regions: regions.map(({ x, y, w, h }) => ({ x, y, w, h })),
  };
  session = { data, sourceHash, regions, snapshot };
  return data;
}

function _requireSession(assetId: string): EditSession {
  if (!session || session.data.id !== assetId) throw new Error('Reopen this photo in the editor.');
  return session;
}

export async function previewImageEditor(assetId: string, edit: ImageEdit): Promise<EditorPreview> {
  const current = _requireSession(assetId);
  if (!current.data.canOverwrite && edit.format !== 'jpg')
    throw new Error('This source can only be saved as a JPEG copy.');
  current.previewed = true;
  return invoke<EditorPreview>('preview_image_edit', {
    sourcePath: current.data.canOverwrite ? current.data.fullPath : current.data.previewPath,
    format: edit.format,
    quality: edit.quality,
  });
}

export async function prepareImageEditor(assetId: string, edit: ImageEdit): Promise<PreparedEditorEdit> {
  const current = _requireSession(assetId);
  await _discardPrepared(current);
  if (!current.data.canOverwrite && edit.format !== 'jpg')
    throw new Error('This source can only be saved as a JPEG copy.');
  const prepared = await invoke<Omit<PreparedEditorEdit, 'token' | 'suggestedName'>>('prepare_image_edit', {
    sourcePath: current.data.fullPath,
    edit,
    decodePath: current.data.canOverwrite ? null : current.data.previewPath,
  });
  try {
    if (prepared.sourceHash !== current.sourceHash)
      throw new Error('The original changed. Reopen the editor before saving.');
    const namedRegions = current.regions.flatMap((region) => {
      const area = transformRegion(region, edit, current.data.width, current.data.height);
      return area && region.confirmed && region.personName ? [{ name: region.personName, area }] : [];
    });
    const stderr: string[] = [];
    const result = await executeExiftoolWithArgs(
      editMetadataArgs(
        current.data.fullPath,
        prepared.tempPath,
        prepared.width,
        prepared.height,
        namedRegions,
      ),
      (line) => stderr.push(line),
    );
    if (result.code !== 0 || stderr.some((line) => /error|warning/i.test(line))) {
      throw new Error(`Metadata could not be preserved safely: ${stderr.join(' ') || result.stdout}`);
    }
    const directory = await dirname(current.data.fullPath);
    const stem = current.data.filename.replace(/\.[^.]+$/, '');
    let suggestedName = `${stem}_edited.${edit.format}`;
    for (let suffix = 2; await exists(await join(directory, suggestedName)); suffix++) {
      suggestedName = `${stem}_edited_${suffix}.${edit.format}`;
    }
    const final = {
      ...prepared,
      bytes: (await stat(prepared.tempPath)).size,
      token: crypto.randomUUID(),
      suggestedName,
    };
    current.prepared = final;
    current.edit = edit;
    return final;
  } catch (error) {
    await invoke('discard_image_edit', {
      sourcePath: current.data.fullPath,
      tempPath: prepared.tempPath,
    }).catch(() => {});
    throw error;
  }
}

export async function saveImageEditor(
  assetId: string,
  token: string,
  overwrite: boolean,
  filename: string,
): Promise<{ path: string }> {
  const current = _requireSession(assetId);
  const { prepared, edit } = current;
  if (!prepared || !edit || prepared.token !== token)
    throw new Error('Preview the current edit before saving.');
  if ((await _assetSnapshot(assetId)) !== current.snapshot)
    throw new Error('Photo details changed in the gallery. Reopen the editor before saving.');
  if (overwrite && (!current.data.canOverwrite || edit.format !== current.data.format))
    throw new Error('A format change must be saved as a copy.');
  if (
    !overwrite &&
    (!filename ||
      /[<>:"/\\|?*]/.test(filename) ||
      [...filename].some((character) => character.charCodeAt(0) < 32) ||
      /[. ]$/.test(filename) ||
      !filename.toLowerCase().endsWith(`.${edit.format}`))
  ) {
    throw new Error(`Enter a valid filename ending in .${edit.format}`);
  }
  const asset = await getByUUID(assetId);
  const destination = overwrite ? asset.fullPath : await join(await dirname(asset.fullPath), filename);
  if (
    !overwrite &&
    (destination.toLowerCase() === asset.fullPath.toLowerCase() || (await exists(destination)))
  ) {
    throw new Error('That filename already exists. Choose another name.');
  }
  await invoke('commit_image_edit', {
    sourcePath: asset.fullPath,
    tempPath: prepared.tempPath,
    destination,
    sourceHash: prepared.sourceHash,
  });
  current.prepared = undefined;
  try {
    if (overwrite) {
      for (const region of current.regions) {
        const area = transformRegion(region, edit, current.data.width, current.data.height);
        if (area)
          await executeInDB(
            kyselyDB.updateTable('tagRegionInfo').set(area).where('id', '=', region.id),
            'tagRegionInfo',
          );
        else
          await executeInDB(
            kyselyDB.deleteFrom('tagRegionInfo').where('id', '=', region.id),
            'tagRegionInfo',
          );
      }
      await executeInDB(
        kyselyDB.deleteFrom('assetFingerprints').where('assetId', '=', assetId),
        'assetFingerprints',
      );
      await updateAssetRow(assetId, {
        width: prepared.width,
        height: prepared.height,
        orientation: AssetOrientation.Horizontal,
      });
      await refreshFileTracking(assetId, asset.fullPath);
      await deletePreviewOfFile(assetId);
      await regenerateThumbnailOfFile(asset);
      await updateAssetRow(assetId, { width: prepared.width, height: prepared.height });
    } else {
      const inserted = await insertFilesByPaths(
        [{ absolutePath: destination, albumId: asset.album.id, filename }],
        undefined,
        { includeGeolocation: true },
      );
      if (!inserted) throw new Error('The copy could not be imported.');
    }
    await _discardPreview(current);
    session = undefined;
    return { path: destination };
  } catch (error) {
    session = undefined;
    throw new Error(
      `The photo was saved to ${destination}, but the gallery could not refresh. Sync the album. ${String(error)}`,
    );
  }
}

export async function discardImageEditor(assetId: string): Promise<{ path: string }> {
  if (session?.data.id === assetId) {
    await _discardPrepared(session);
    await _discardPreview(session);
    session = undefined;
  }
  return { path: '' };
}
