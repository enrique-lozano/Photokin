import { MetadataMode } from '@/common/metadataOptions';
import { useEditLocationDialog } from '@/components/edit-location/editLocationDialogStore';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { toast } from '@/components/ui/toast';
import { AssetsService } from '@/db/api/services/assets.service';
import type { AssetInClient } from '@/db/models/AssetInClient';
import { LocationSource } from '@/db/models/AssetLocation';
import { reverseGeocode } from '@/media/metadata/location/geocode';
import {
  editableLocationFrom,
  EMPTY_LOCATION,
  formatCoordinatePair,
  parseCoordinatePair,
  type EditableLocation,
} from '@/media/metadata/location/locationDraft';
import { useSettingsStore } from '@/stores/settingsStore';
import { IconCopy, IconMapPin, IconMapPinOff, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useState } from 'react';
import { LightboxLocationMap } from './LightboxLocationMap';
import { MetadataRows } from './MetadataRows';

export function LocationSegment({ asset, disabled }: { asset: AssetInClient; disabled: boolean }) {
  const location = asset.metadata.location;
  const coordinates =
    location?.latitude != null && location.longitude != null
      ? { latitude: location.latitude, longitude: location.longitude }
      : null;
  const mode = useSettingsStore((state) => state.metadataMode);
  const source = location?.source;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ location: EditableLocation; title: string } | null>(null);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function update(next: EditableLocation) {
    const result = await AssetsService.updateAssetsLocation([{ id: asset.id, location: next }]);
    if (result.fileFailures.size) throw new Error([...result.fileFailures.values()].join('; '));
  }
  async function geocode() {
    if (!coordinates) return;
    const place = await reverseGeocode(coordinates.latitude, coordinates.longitude);
    if (!place) throw new Error('No place found for these coordinates');
    await update({ ...editableLocationFrom(location), ...place, source: LocationSource.Auto });
  }
  const edit = () => useEditLocationDialog.getState().openDialog([asset]);
  const number = (value: number | null | undefined) =>
    value == null
      ? 'Not set'
      : value.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  return (
    <>
      <div
        className="lightbox-info-content"
        role="tabpanel"
        id="info-panel-location"
        aria-labelledby="info-tab-location"
      >
        {!location ? (
          <section className="info-surface location-empty">
            <IconMapPinOff size={28} />
            <p>No location saved for this photo</p>
          </section>
        ) : (
          <>
            {coordinates && (
              <div className="info-map">
                <LightboxLocationMap {...coordinates} />
              </div>
            )}
            <section className="info-surface location-data location-data--coordinates">
              <div className="info-row">
                <h5 className="text-xs font-semibold">Coordinates</h5>
                {coordinates && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Copy coordinates"
                    title="Copy coordinates"
                    onClick={() =>
                      void run(async () => {
                        await writeText(formatCoordinatePair(coordinates.latitude, coordinates.longitude));
                        toast.success('Coordinates copied');
                      })
                    }
                  >
                    <IconCopy size={16} />
                  </Button>
                )}
              </div>
              {coordinates ? (
                <MetadataRows
                  rows={[
                    { label: 'Latitude', value: number(location.latitude) },
                    { label: 'Longitude', value: number(location.longitude) },
                    {
                      label: 'Altitude',
                      value: location.altitude == null ? 'Not set' : `${number(location.altitude)} m`,
                    },
                  ]}
                />
              ) : (
                <div className="info-row">
                  <span className="text-muted-foreground text-xs">No coordinates</span>
                  <Button variant="ghost" disabled={disabled} onClick={edit}>
                    Add
                  </Button>
                </div>
              )}
            </section>
            <section className="info-surface location-data">
              <div className="info-row">
                <h5 className="text-xs font-semibold">Place</h5>
                <span
                  className={`place-source ${source == null || source === LocationSource.Auto ? 'place-source--auto' : ''}`}
                >
                  {source == null
                    ? 'Auto'
                    : source === LocationSource.Auto
                      ? 'Auto · from GPS'
                      : source === LocationSource.File
                        ? 'Saved in file'
                        : 'Saved in library'}
                </span>
              </div>
              <MetadataRows
                rows={[
                  { label: 'City', value: location.city || 'Not set' },
                  { label: 'Region / state', value: location.state || 'Not set' },
                  { label: 'Country', value: location.country || 'Not set' },
                  { label: 'Spot / place', value: location.sublocation || 'Not set' },
                ]}
              />
              <div className="location-source-note">
                <span className="text-muted-foreground text-xs">
                  {source == null
                    ? 'Source not yet classified. Reload metadata to determine it.'
                    : source === LocationSource.Auto
                      ? "Looked up from the coordinates. It isn't in the file yet."
                      : source === LocationSource.File
                        ? "Stored in the file's metadata."
                        : 'Stored in your library.'}
                </span>
                {source !== LocationSource.File && mode === MetadataMode.Full && location.name ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled || busy}
                    onClick={() =>
                      void run(async () => {
                        await AssetsService.saveAssetLocationToFile(asset.id, editableLocationFrom(location));
                      })
                    }
                  >
                    Save to file
                  </Button>
                ) : (
                  coordinates && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={disabled || busy}
                      onClick={() => void run(geocode)}
                    >
                      {location.city || location.country ? 'Refresh from GPS' : 'Place from coordinates'}
                    </Button>
                  )
                )}
              </div>
            </section>
          </>
        )}
        {error && (
          <div role="alert" className="info-surface">
            <p className="text-destructive-text">{error}</p>
            <Button variant="ghost" size="sm" onClick={() => setError('')}>
              Dismiss
            </Button>
          </div>
        )}
      </div>
      <footer className="info-pinned-footer">
        {location ? (
          <Button
            variant="ghost"
            disabled={disabled || busy}
            onClick={() => setPending({ location: { ...EMPTY_LOCATION }, title: 'Remove location?' })}
          >
            <IconTrash size={16} />
            Remove location
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={disabled || busy}
            onClick={() =>
              void run(async () => {
                const pair = parseCoordinatePair(await readText());
                if (!pair) throw new Error('Clipboard must contain latitude, longitude');
                setPending({ location: { ...EMPTY_LOCATION, ...pair }, title: 'Apply pasted coordinates?' });
              })
            }
          >
            Paste coordinates
          </Button>
        )}
        <Button disabled={disabled || busy} onClick={edit}>
          {location ? <IconPencil size={16} /> : <IconPlus size={16} />}
          {location ? 'Edit location...' : 'Add location'}
        </Button>
      </footer>
      <ConfirmationDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        icon={<IconMapPin size={22} />}
        title={pending?.title}
        description={
          pending?.location.latitude == null
            ? 'Remove the coordinates and place saved for this photo.'
            : formatCoordinatePair(pending.location.latitude, pending.location.longitude!)
        }
        confirmLabel="Apply"
        fileMetadataImpact="automatic"
        onConfirm={() => {
          const next = pending;
          setPending(null);
          if (next) void run(() => update(next.location));
        }}
      />
    </>
  );
}
