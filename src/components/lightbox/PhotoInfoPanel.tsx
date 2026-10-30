import { MetadataMode } from '@/common/metadataOptions';
import { RatingMode } from '@/common/ratingModeOptions';
import { useEditDateDialog } from '@/components/edit-date/editDateDialogStore';
import { useEditLocationDialog } from '@/components/edit-location/editLocationDialogStore';
import { useEditTagsDialog } from '@/components/edit-tags/editTagsDialogStore';
import { MetadataModeBadge } from '@/components/metadata-mode/MetadataModeBadge';
import { showMetadataUndoToast } from '@/components/metadataUndo';
import { renameAssetFile } from '@/components/rename-file/renameAssetFile';
import { TreeColorDot } from '@/components/tree/TreeColorDot';
import { Badge } from '@/components/ui/badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleChevron,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { AssetsService } from '@/db/api/services/assets.service';
import { RegionsService } from '@/db/api/services/regions.service';
import { TagsService } from '@/db/api/services/tags.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import type { AssetInClient } from '@/db/models/AssetInClient';
import { hasRightsData } from '@/db/models/AssetRights';
import { getFormatLabel, getMimeType } from '@/media/metadata/fields/fileFormat';
import { getOrientationLabel } from '@/media/metadata/fields/orientation';
import { formatCoordinatePair } from '@/media/metadata/location/locationDraft';
import { hasScannedMetadata, metadataEditErrorMessage } from '@/media/metadata/metadataScanState';
import { useAppStore } from '@/stores/appState';
import { useSettingsStore } from '@/stores/settingsStore';
import { openContainingFolder, tauriFileTimestamps, type FileTimestamps } from '@/system/diskManager';
import { formatDate } from '@/utils/dateFormatter';
import { formatBytes } from '@/utils/numberFormatter';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconFileText,
  IconFolderOpen,
  IconInfoCircle,
  IconList,
  IconMapPin,
  IconPencil,
  IconPlus,
  IconTag,
  IconX,
} from '@tabler/icons-react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { stat } from '@tauri-apps/plugin-fs';
import { memo, useEffect, useState } from 'react';
import { CaptureCard } from './info/CaptureCard';
import { EditCaptureDialog } from './info/EditCaptureDialog';
import { IdentityCard } from './info/IdentityCard';
import { InfoRowText } from './info/InfoRowText';
import { LocationSegment } from './info/LocationSegment';
import { MetadataExplorer } from './info/MetadataExplorer';
import { MetadataRows, visibleRows, type MetadataRow } from './info/MetadataRows';
import { StarRating } from './info/StarRating';
import { TagsSegment } from './info/TagsSegment';
import { useInfoPanelState, type InfoSegment } from './info/infoPanelState';
import './lightBoxInfoPanel.css';
import './photoInfoPanel.css';

interface LightboxInfoPanelProps {
  img: AssetInClient | null;
  isActive: boolean;
  onClose: () => void;
  onFaceHover?: (regionId: string | null) => void;
}
const KEYWORD_CHIP_CLASS =
  'h-auto min-h-6 max-w-full cursor-pointer gap-1.5 whitespace-normal py-0.5 [overflow-wrap:anywhere] hover:bg-accent';

const SEGMENTS = [
  { id: 'overview', label: 'Overview', icon: IconInfoCircle },
  { id: 'tags', label: 'Tags', icon: IconTag },
  { id: 'location', label: 'Location', icon: IconMapPin },
  { id: 'metadata', label: 'All metadata', icon: IconList },
] as const;

function LightboxInfoPanelComponent({ img, isActive, onClose, onFaceHover }: LightboxInfoPanelProps) {
  const segment = useInfoPanelState((state) => state.segment);
  const setSegment = useInfoPanelState((state) => state.setSegment);
  const [metadataCount, setMetadataCount] = useState(0);
  const { data: tags } = useLiveQuery(
    () => TagsService.getImageTags(img?.id ?? 'NO_IMAGE'),
    ['fileTags', 'tags'],
    { extDependencies: [img?.id] },
  );
  const { data: faces } = useLiveQuery(
    () => RegionsService.getImageRegions(img?.id ?? 'NO_IMAGE'),
    ['tagRegionInfo'],
    { extDependencies: [img?.id] },
  );
  useEffect(() => {
    onFaceHover?.(null);
  }, [img?.id, isActive, segment, onFaceHover]);
  useEffect(() => {
    setMetadataCount(0);
  }, [img?.id]);
  return (
    <aside
      className={`lightbox-info-panel${isActive ? ' isActive' : ''}`}
      aria-label="Photo information"
      aria-hidden={!isActive}
    >
      <header className="info-panel-header">
        <h4>Info</h4>
        <MetadataModeBadge />
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          aria-label="Close info panel"
          title="Close info panel"
          onClick={onClose}
        >
          <IconX size={18} />
        </Button>
      </header>
      <div className="info-segments" role="tablist" aria-label="Information views">
        {SEGMENTS.map((tab, index) => (
          <button
            type="button"
            key={tab.id}
            id={`info-tab-${tab.id}`}
            role="tab"
            aria-selected={segment === tab.id}
            aria-controls={`info-panel-${tab.id}`}
            aria-label={tab.label}
            title={tab.label}
            tabIndex={segment === tab.id ? 0 : -1}
            className={segment === tab.id ? 'is-selected' : ''}
            onClick={() => setSegment(tab.id)}
            onKeyDown={(event) => {
              let next: number | undefined;
              if (event.key === 'ArrowRight') next = (index + 1) % SEGMENTS.length;
              if (event.key === 'ArrowLeft') next = (index + SEGMENTS.length - 1) % SEGMENTS.length;
              if (event.key === 'Home') next = 0;
              if (event.key === 'End') next = SEGMENTS.length - 1;
              if (next !== undefined) {
                event.preventDefault();
                setSegment(SEGMENTS[next].id);
                document.getElementById(`info-tab-${SEGMENTS[next].id}`)?.focus();
              }
            }}
          >
            <tab.icon size={16} />
            {segment === tab.id && <span>{tab.label}</span>}
            {tab.id === 'tags' && segment !== 'tags' && !!tags?.length && (
              <span className="info-tab-count">{tags.length}</span>
            )}
            {tab.id === 'metadata' && segment === 'metadata' && metadataCount > 0 && (
              <Badge variant="secondary">{metadataCount}</Badge>
            )}
          </button>
        ))}
      </div>
      {img && (
        <PanelBody
          key={img.id}
          asset={img}
          active={isActive}
          segment={segment}
          tags={tags ?? []}
          faces={faces ?? []}
          onCount={setMetadataCount}
          onFaceHover={onFaceHover}
        />
      )}
    </aside>
  );
}

function PanelBody({
  asset,
  active,
  segment,
  tags,
  faces,
  onCount,
  onFaceHover,
}: {
  asset: AssetInClient;
  active: boolean;
  segment: InfoSegment;
  tags: import('@/db/models/TagDTO').TagInClient[];
  faces: import('@/db/models/TagRegionInfoDTO').TagRegionInfoInClient[];
  onCount: (count: number) => void;
  onFaceHover?: (id: string | null) => void;
}) {
  const mode = useSettingsStore((state) => state.metadataMode);
  const ratingMode = useSettingsStore((state) => state.ratingMode);
  const [readOnlyFile, setReadOnlyFile] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [rating, setRating] = useState(asset.metadata.rating ?? 0);
  const [ratingBusy, setRatingBusy] = useState(false);
  const disabled = !hasScannedMetadata(asset) || (mode === MetadataMode.Full && readOnlyFile);
  useEffect(() => {
    let cancelled = false;
    void stat(asset.fullPath)
      .then((info) => {
        if (!cancelled) setReadOnlyFile(info.readonly);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [asset.fullPath]);
  useEffect(() => {
    setRating(asset.metadata.rating ?? 0);
  }, [asset.metadata.rating]);
  async function changeRating(value: number) {
    const previous = rating;
    setRating(value);
    setRatingBusy(true);
    try {
      await AssetsService.updateAssetEditableFields(asset.id, { rating: value });
      showMetadataUndoToast(value ? `Rated ${value} stars` : 'Rating cleared', async () => {
        const current = await AssetsService.getByUUID(asset.id);
        if ((current.metadata.rating || 0) !== value) throw new Error('The rating changed again');
        await AssetsService.updateAssetEditableFields(asset.id, { rating: previous });
      });
    } catch (cause) {
      setRating(previous);
      toast.error(metadataEditErrorMessage(cause, 'Could not update rating'));
    } finally {
      setRatingBusy(false);
    }
  }
  const { metadata } = asset;
  const location = metadata.location;
  const coordinates =
    location?.latitude != null && location.longitude != null
      ? formatCoordinatePair(location.latitude, location.longitude)
      : null;
  return (
    <>
      {disabled && (
        <Banner
          variant="warning"
          className="metadata-scan-pending"
          role="status"
          icon={
            readOnlyFile && mode === MetadataMode.Full ? (
              <IconAlertTriangle size={18} />
            ) : (
              <IconInfoCircle size={18} />
            )
          }
        >
          {readOnlyFile && mode === MetadataMode.Full
            ? 'This file is read-only. Switch to Read-only mode to edit your library without changing the file.'
            : 'Reading photo details. Editing is available when scanning finishes.'}
        </Banner>
      )}
      {segment === 'overview' && (
        <div
          className="lightbox-info-content"
          role="tabpanel"
          id="info-panel-overview"
          aria-labelledby="info-tab-overview"
        >
          <IdentityCard key={asset.id} asset={asset} active={active} disabled={disabled}>
            <div className="tag-chips">
              {tags.slice(0, 6).map((tag) => (
                <Badge asChild variant="outline" className={KEYWORD_CHIP_CLASS} key={tag.id}>
                  <button
                    title={tag.fullPath}
                    onClick={() => useInfoPanelState.getState().setSegment('tags')}
                  >
                    <TreeColorDot seed={tag.rootId} color={tag.color} />
                    {tag.name}
                  </button>
                </Badge>
              ))}
              {tags.length > 6 && (
                <Badge asChild variant="outline" className={KEYWORD_CHIP_CLASS}>
                  <button onClick={() => useInfoPanelState.getState().setSegment('tags')}>
                    +{tags.length - 6}
                  </button>
                </Badge>
              )}
              <Badge
                asChild
                variant="outline"
                className={`${KEYWORD_CHIP_CLASS} border-dashed text-primary disabled:opacity-50`}
              >
                <button disabled={disabled} onClick={() => useEditTagsDialog.getState().openDialog([asset])}>
                  <IconPlus size={14} />
                  {tags.length ? 'Add' : 'Add tag'}
                </button>
              </Badge>
            </div>
          </IdentityCard>
          <section className="info-surface date-location-card">
            <div className="info-datetime">
              <IconCalendar size={22} className="info-datetime__icon" />
              <InfoRowText
                title={formatDate(metadata.date, { dateStyle: 'long' })}
                subtitle={formatDate(metadata.date, {
                  weekday: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZoneName: 'shortOffset',
                })}
                subtitleClassName="text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit date and time"
                title="Edit date and time"
                disabled={disabled}
                onClick={() => useEditDateDialog.getState().openDialog([asset])}
              >
                <IconPencil size={16} />
              </Button>
            </div>
            <button
              className={`info-location-link expandable-trigger${location ? ' is-set' : ''}`}
              disabled={!location && disabled}
              onClick={() =>
                location
                  ? useInfoPanelState.getState().setSegment('location')
                  : useEditLocationDialog.getState().openDialog([asset])
              }
            >
              <IconMapPin size={20} />
              <InfoRowText
                title={location ? location.name || coordinates || 'Location' : 'Add location'}
                subtitle={location ? coordinates : null}
                className="wrap-anywhere"
                subtitleClassName="leading-normal"
              />
              {location ? <IconChevronRight size={18} /> : <IconPlus size={18} />}
            </button>
            {ratingMode === RatingMode.Stars && (
              <div className="info-rating">
                <span className="info-field__label">Rating</span>
                <StarRating
                  value={rating}
                  onChange={disabled || ratingBusy ? undefined : (value) => void changeRating(value)}
                />
              </div>
            )}
          </section>
          <CaptureCard camera={metadata.camera} disabled={disabled} onEdit={() => setCaptureOpen(true)} />
          <FileCard asset={asset} />
        </div>
      )}
      {segment === 'tags' && (
        <TagsSegment
          key={asset.id}
          asset={asset}
          tags={tags}
          faces={faces}
          disabled={disabled}
          onFaceHover={onFaceHover}
        />
      )}
      {segment === 'location' && <LocationSegment key={asset.id} asset={asset} disabled={disabled} />}
      {segment === 'metadata' && active && (
        <div
          className="lightbox-info-content"
          role="tabpanel"
          id="info-panel-metadata"
          aria-labelledby="info-tab-metadata"
        >
          <MetadataExplorer key={asset.id} asset={asset} onCount={onCount} />
        </div>
      )}
      {captureOpen && <EditCaptureDialog asset={asset} onClose={() => setCaptureOpen(false)} />}
    </>
  );
}

function parentDirectory(filePath: string): string {
  const separator = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (separator < 0) return '';
  if (separator === 0) return filePath.slice(0, 1);
  if (separator === 2 && filePath[1] === ':') return filePath.slice(0, 3);
  return filePath.slice(0, separator);
}

function FileCard({ asset }: { asset: AssetInClient }) {
  const expanded = useInfoPanelState((state) => state.fileExpanded);
  const toggle = useInfoPanelState((state) => state.toggleFile);
  const revision = useAppStore((state) => state.assetRevisions[asset.id]);
  const [times, setTimes] = useState<FileTimestamps>({ created: null, modified: null });
  const [editingFilename, setEditingFilename] = useState(false);
  const [filenameDraft, setFilenameDraft] = useState(asset.filename);
  const [renaming, setRenaming] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (expanded)
      void tauriFileTimestamps(asset.fullPath)
        .then((value) => {
          if (!cancelled) setTimes(value);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [asset.fullPath, revision, expanded]);
  const metadata = asset.metadata;
  const folderPath = parentDirectory(asset.fullPath);
  const extraRows = visibleRows([
    { label: 'Color space', value: metadata.colorSpace },
    { label: 'Bit depth', value: metadata.bitDepth },
    { label: 'Software', value: metadata.software },
    { label: 'Orientation', value: getOrientationLabel(metadata.orientation) },
    {
      label: 'Created',
      value: times.created ? formatDate(times.created, { dateStyle: 'medium', timeStyle: 'short' }) : null,
    },
    {
      label: 'Modified',
      value: times.modified ? formatDate(times.modified, { dateStyle: 'medium', timeStyle: 'short' }) : null,
    },
    {
      label: 'Last scanned',
      value: metadata.lastScanned
        ? formatDate(new Date(metadata.lastScanned), { dateStyle: 'medium', timeStyle: 'short' })
        : null,
    },
  ]);
  const rightsRows = hasRightsData(metadata.rights)
    ? visibleRows([
        { label: 'Creator', value: metadata.rights.creator },
        { label: 'Copyright', value: metadata.rights.copyright },
        { label: 'Credit', value: metadata.rights.credit },
        { label: 'Source', value: metadata.rights.source },
      ])
    : [];
  const copyValue = (value: string, label: string) => {
    void writeText(value)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error(`Could not copy ${label.toLowerCase()}`));
  };
  const withCopyAction = (row: MetadataRow): MetadataRow => ({
    ...row,
    actions: (
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Copy ${row.label.toLowerCase()}`}
        title={`Copy ${row.label.toLowerCase()}`}
        onClick={() => copyValue(String(row.value), row.label)}
      >
        <IconCopy size={16} />
      </Button>
    ),
  });
  const startRename = () => {
    setFilenameDraft(asset.filename);
    setEditingFilename(true);
  };
  const cancelRename = () => {
    setFilenameDraft(asset.filename);
    setEditingFilename(false);
  };
  const saveFilename = async () => {
    const filename = filenameDraft.trim();
    if (filename === asset.filename) {
      cancelRename();
      return;
    }

    setRenaming(true);
    try {
      if (await renameAssetFile(asset, filename)) setEditingFilename(false);
    } finally {
      setRenaming(false);
    }
  };
  return (
    <Collapsible className="info-surface file-card" open={expanded} onOpenChange={toggle}>
      <CollapsibleTrigger className="info-expand-row">
        <IconFileText size={22} />
        <InfoRowText
          title="File details"
          subtitle={`${asset.filename} · ${metadata.width} × ${metadata.height} · ${formatBytes(asset.filesize)}`}
          titleClassName="shrink-0"
          subtitleClassName="block overflow-hidden text-ellipsis leading-normal"
        />
        <CollapsibleChevron size={18} />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="file-card__details">
          <MetadataRows
            showEmpty
            rows={[
              {
                label: 'File name',
                editing: editingFilename,
                value: editingFilename ? (
                  <Input
                    aria-label="New file name"
                    className="h-[30px] px-1.5 py-0.5 text-xs"
                    value={filenameDraft}
                    disabled={renaming}
                    autoFocus
                    onChange={(event) => setFilenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void saveFilename();
                      } else if (event.key === 'Escape') {
                        cancelRename();
                      }
                    }}
                  />
                ) : (
                  <button
                    className="block w-full cursor-text truncate border-0 bg-transparent p-0 text-left"
                    title="Click to rename"
                    onClick={startRename}
                  >
                    {asset.filename}
                  </button>
                ),
                actions: editingFilename ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Save file name"
                      title="Save file name"
                      disabled={renaming}
                      onClick={() => void saveFilename()}
                    >
                      <IconCheck size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Cancel rename"
                      title="Cancel rename"
                      disabled={renaming}
                      onClick={cancelRename}
                    >
                      <IconX size={16} />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Rename file"
                      title="Rename file"
                      onClick={startRename}
                    >
                      <IconPencil size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Copy file name"
                      title="Copy file name"
                      onClick={() => copyValue(asset.filename, 'File name')}
                    >
                      <IconCopy size={16} />
                    </Button>
                  </>
                ),
              },
              {
                label: 'Folder',
                value: folderPath,
                valueClassName: 'file-details-path',
                actions: (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Copy folder path"
                      title="Copy folder path"
                      onClick={() => copyValue(folderPath, 'Folder path')}
                    >
                      <IconCopy size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Open folder in Explorer"
                      title="Open folder in Explorer"
                      onClick={() => {
                        void openContainingFolder(asset.fullPath).catch(() =>
                          toast.error('Could not open folder'),
                        );
                      }}
                    >
                      <IconFolderOpen size={16} />
                    </Button>
                  </>
                ),
              },
              ...[
                {
                  label: 'Dimensions',
                  value: `${metadata.width} × ${metadata.height} · ${metadata.megapixels.toFixed(1)} MP`,
                },
                { label: 'File size', value: formatBytes(asset.filesize) },
                {
                  label: 'Format',
                  value: `${getFormatLabel(asset.filename)} · ${getMimeType(asset.filename)}`,
                },
                ...extraRows,
              ].map(withCopyAction),
            ]}
          />
          {rightsRows.length > 0 && (
            <>
              <h5 className="mt-2.5 mb-0.5 text-xs font-semibold uppercase text-muted-foreground">
                Rights & Ownership
              </h5>
              <MetadataRows rows={rightsRows.map(withCopyAction)} />
            </>
          )}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

export const LightboxInfoPanel = memo(LightboxInfoPanelComponent);
