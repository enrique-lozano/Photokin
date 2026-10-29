import { AssetThumbnail } from '@/components/asset-thumbnail/AssetThumbnail';
import { LocationSource } from '@/db/models/AssetLocation';
import { BulkActionProgress } from '@/components/bulk-action/BulkActionProgress';
import { BulkActionResultStep } from '@/components/bulk-action/BulkActionResultStep';
import {
  useBulkActionDialog,
  useInertWhen,
  type BulkActionDialogPhaseKind,
} from '@/components/bulk-action/useBulkActionDialog';
import { CountryFlag } from '@/components/location/CountryFlag';
import { isValidLatLon, LocationMap, type LocationMapMarker } from '@/components/location/LocationMap';
import { Button } from '@/components/ui/button';
import { Collapse } from '@/components/ui/collapse';
import { MetadataImpactNotice } from '@/components/ui/confirmation-dialog';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { useLiveAssetSnapshot } from '@/hooks/useLiveAssetSnapshot';
import { cn } from '@/lib/utils';
import {
  countryCodeFromName,
  getCountryOptions,
  type CountryOption,
} from '@/media/metadata/location/countries';
import { lookupElevations } from '@/media/metadata/location/elevation';
import { forwardGeocode, reverseGeocode, type GeocodedPlace } from '@/media/metadata/location/geocode';
import {
  commonLocationValue,
  composeLocationName,
  editableLocationFrom,
  EMPTY_LOCATION,
  formatCoordinatePair,
  isValidEditableLocation,
  locationsEqual,
  normalizePlaceName,
  parseCoordinatePair,
  type EditableLocation,
} from '@/media/metadata/location/locationDraft';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import type { BulkOutcome } from '@/system/bulkOutcome';
import {
  IconClipboard,
  IconCopy,
  IconFlag,
  IconMapPin,
  IconMapPinSearch,
  IconMountain,
  IconTrash,
  IconWorld,
  IconWorldSearch,
} from '@tabler/icons-react';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useEditLocationDialog } from './editLocationDialogStore';

type Drafts = Record<string, EditableLocation>;

function draftsFromAssets(assets: AssetInClient[]): Drafts {
  return Object.fromEntries(assets.map((asset) => [asset.id, editableLocationFrom(asset.metadata.location)]));
}

function formatCoordinates(location: EditableLocation): string {
  if (location.latitude === null || location.longitude === null) return 'No coordinates';
  return formatCoordinatePair(location.latitude, location.longitude);
}

function useEditLocationForm(
  assets: AssetInClient[],
  onRunningChange: (running: boolean) => void,
  onPhaseChange: (phase: BulkActionDialogPhaseKind) => void,
) {
  const liveAssets = useLiveAssetSnapshot(assets);
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFromAssets(assets));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(assets.map((asset) => asset.id)));
  const bulkAction = useBulkActionDialog(onRunningChange, onPhaseChange);
  const isApplying = bulkAction.phase.kind === 'running';
  const editorRef = useInertWhen(isApplying);
  const [isPastingCoordinates, setIsPastingCoordinates] = useState(false);
  const [isLookingUpElevation, setIsLookingUpElevation] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isForwardGeocoding, setIsForwardGeocoding] = useState(false);

  // Editable state follows whatever the refreshed rows say.
  useEffect(() => {
    setDrafts(draftsFromAssets(liveAssets));
    setSelectedIds(new Set(liveAssets.map((asset) => asset.id)));
  }, [liveAssets]);

  const originals = useMemo(() => draftsFromAssets(liveAssets), [liveAssets]);
  const selectedDrafts = useMemo(
    () => liveAssets.filter((asset) => selectedIds.has(asset.id)).map((asset) => drafts[asset.id]),
    [drafts, liveAssets, selectedIds],
  );
  const changedAssets = useMemo(
    () =>
      liveAssets.filter((asset) => {
        const draft = drafts[asset.id];
        const original = originals[asset.id];
        return draft && original && !locationsEqual(draft, original);
      }),
    [drafts, liveAssets, originals],
  );
  const hasInvalidDraft = Object.values(drafts).some((draft) => !isValidEditableLocation(draft));
  const canApply = changedAssets.length > 0 && !hasInvalidDraft && !isApplying;
  // A lookup needs at least one selected photo that already has its input, so
  // the buttons stay disabled instead of only failing with a toast when clicked.
  const hasSelectedCoordinates = selectedDrafts.some(
    (draft) =>
      draft?.latitude != null && draft.longitude != null && isValidLatLon(draft.latitude, draft.longitude),
  );
  const hasSelectedPlace = selectedDrafts.some((draft) =>
    Boolean(draft?.city || draft?.state || draft?.country),
  );

  function selectOnly(id: string) {
    setSelectedIds(new Set([id]));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id) && next.size > 1) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateSelected(patch: Partial<EditableLocation>) {
    setDrafts((current) => {
      const next = { ...current };
      for (const id of selectedIds) next[id] = { ...next[id], ...patch, source: LocationSource.Manual };
      return next;
    });
  }

  function updateOne(id: string, patch: Partial<EditableLocation>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch, source: LocationSource.Manual },
    }));
  }

  async function pasteCoordinates() {
    setIsPastingCoordinates(true);
    try {
      const coordinates = parseCoordinatePair(await readText());
      if (!coordinates) {
        toast.error('Clipboard must contain coordinates like "40.03458, -3.59860"');
        return;
      }
      updateSelected(coordinates);
      toast.success(
        `Coordinates pasted to ${selectedIds.size} ${selectedIds.size === 1 ? 'photo' : 'photos'}`,
      );
    } catch {
      toast.error('Could not read coordinates from the clipboard');
    } finally {
      setIsPastingCoordinates(false);
    }
  }

  async function lookupSelectedElevations() {
    const entries = liveAssets
      .filter((asset) => selectedIds.has(asset.id))
      .map((asset) => ({ id: asset.id, location: drafts[asset.id] }))
      .filter(
        ({ location }) =>
          location.latitude !== null &&
          location.longitude !== null &&
          isValidLatLon(location.latitude, location.longitude),
      );
    if (entries.length === 0) {
      toast.error('Enter valid latitude and longitude before looking up altitude');
      return;
    }

    setIsLookingUpElevation(true);
    try {
      const elevations = await lookupElevations(
        entries.map(({ location }) => ({
          latitude: location.latitude as number,
          longitude: location.longitude as number,
        })),
      );
      const updated = elevations.filter((altitude) => altitude !== null).length;
      setDrafts((current) => {
        const next = { ...current };
        entries.forEach(({ id }, index) => {
          const altitude = elevations[index];
          if (altitude !== null) {
            next[id] = { ...next[id], altitude };
          }
        });
        return next;
      });
      if (updated > 0) {
        toast.success(`Found altitude for ${updated} ${updated === 1 ? 'photo' : 'photos'}`);
      } else {
        toast.info('No elevation data was available for the selected coordinates');
      }
    } catch {
      toast.error('Could not look up altitude. Check your internet connection');
    } finally {
      setIsLookingUpElevation(false);
    }
  }

  function selectedEntries() {
    return liveAssets
      .filter((asset) => selectedIds.has(asset.id))
      .map((asset) => ({ id: asset.id, location: drafts[asset.id] }));
  }

  async function fillPlaceFromCoordinates() {
    const entries = selectedEntries().filter(
      ({ location }) =>
        location.latitude !== null &&
        location.longitude !== null &&
        isValidLatLon(location.latitude, location.longitude),
    );
    if (entries.length === 0) {
      toast.error('Enter valid latitude and longitude before looking up the place');
      return;
    }

    setIsReverseGeocoding(true);
    try {
      const cache = new Map<string, GeocodedPlace | null>();
      const results = new Map<string, GeocodedPlace>();
      for (const { id, location } of entries) {
        const key = `${location.latitude!.toFixed(4)},${location.longitude!.toFixed(4)}`;
        if (!cache.has(key)) {
          cache.set(key, await reverseGeocode(location.latitude as number, location.longitude as number));
        }
        const place = cache.get(key);
        if (place) results.set(id, place);
      }
      if (results.size === 0) {
        toast.info('No place found for the selected coordinates');
        return;
      }
      setDrafts((current) => {
        const next = { ...current };
        for (const [id, place] of results) {
          next[id] = {
            ...next[id],
            city: place.city,
            state: place.state,
            country: place.country,
            countryCode: place.countryCode,
            source: LocationSource.Auto,
          };
        }
        return next;
      });
      toast.success(`Filled place for ${results.size} ${results.size === 1 ? 'photo' : 'photos'}`);
    } catch {
      toast.error('Could not look up the place for the selected coordinates');
    } finally {
      setIsReverseGeocoding(false);
    }
  }

  async function fillCoordinatesFromPlace() {
    const entries = selectedEntries().filter(({ location }) =>
      Boolean(location.city || location.state || location.country),
    );
    if (entries.length === 0) {
      toast.error('Enter a city, region or country before looking up coordinates');
      return;
    }

    setIsForwardGeocoding(true);
    try {
      const cache = new Map<string, { latitude: number; longitude: number } | null>();
      const results = new Map<string, { latitude: number; longitude: number }>();
      for (const { id, location } of entries) {
        const key = [location.city, location.state, location.country].join('|').toLowerCase();
        if (!cache.has(key)) cache.set(key, await forwardGeocode(location));
        const coords = cache.get(key);
        if (coords) results.set(id, coords);
      }
      if (results.size === 0) {
        toast.info('No coordinates found for the entered place');
        return;
      }
      setDrafts((current) => {
        const next = { ...current };
        for (const [id, coords] of results) {
          next[id] = { ...next[id], latitude: coords.latitude, longitude: coords.longitude };
        }
        return next;
      });
      toast.success(`Filled coordinates for ${results.size} ${results.size === 1 ? 'photo' : 'photos'}`);
    } catch {
      toast.error('Could not look up coordinates for the entered place');
    } finally {
      setIsForwardGeocoding(false);
    }
  }

  async function handleApply() {
    if (!canApply) return;
    await bulkAction.run({
      label: 'Updating locations',
      summary: (outcome) =>
        `Updated the location of ${outcome.total.toLocaleString()} ${outcome.total === 1 ? 'file' : 'files'}`,
      action: async (onFileProgress): Promise<BulkOutcome> => {
        const filenameById = new Map(changedAssets.map((asset) => [asset.id, asset.filename]));
        const beforeById = new Map(
          changedAssets.map((asset) => [asset.id, editableLocationFrom(asset.metadata.location)]),
        );
        const { fileFailures } = await AssetsService.updateAssetsLocation(
          changedAssets.map((asset) => ({ id: asset.id, location: drafts[asset.id] })),
          onFileProgress,
        );
        const afterAssets = await Promise.all(
          changedAssets.map((asset) => AssetsService.getByUUID(asset.id)),
        );
        const afterById = new Map(
          afterAssets.map((asset) => [asset.id, editableLocationFrom(asset.metadata.location)]),
        );
        const undo = async () => {
          const currentAssets = await Promise.all(
            changedAssets.map((asset) => AssetsService.getByUUID(asset.id)),
          );
          for (const current of currentAssets) {
            const expected = afterById.get(current.id);
            if (!expected || !locationsEqual(editableLocationFrom(current.metadata.location), expected)) {
              throw new Error(`${current.filename} had its location edited again`);
            }
          }
          await AssetsService.updateAssetsLocation(
            currentAssets.map((asset) => ({
              id: asset.id,
              location: beforeById.get(asset.id) ?? { ...EMPTY_LOCATION },
            })),
          );
        };
        return {
          total: changedAssets.length,
          fileCount: changedAssets.length,
          undo,
          fileFailures: [...fileFailures].map(([id, message]) => ({
            id,
            label: filenameById.get(id) ?? id,
            reason: `could not write to file (${message})`,
          })),
        };
      },
    });
  }

  return {
    liveAssets,
    drafts,
    selectedIds,
    selectedDrafts,
    changedAssets,
    isApplying,
    isPastingCoordinates,
    isLookingUpElevation,
    isReverseGeocoding,
    isForwardGeocoding,
    hasInvalidDraft,
    canApply,
    hasSelectedCoordinates,
    hasSelectedPlace,
    selectOnly,
    toggleSelected,
    updateSelected,
    updateOne,
    setSelectedIds,
    pasteCoordinates,
    lookupSelectedElevations,
    fillPlaceFromCoordinates,
    fillCoordinatesFromPlace,
    handleApply,
    bulkAction,
    editorRef,
  };
}

type EditLocationForm = ReturnType<typeof useEditLocationForm>;

function LocationList({ form }: { form: EditLocationForm }) {
  const allSelected = form.selectedIds.size === form.liveAssets.length;

  return (
    <section className="flex min-h-32 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <p className="text-sm font-semibold">Photos</p>
          <p className="text-xs text-muted-foreground">{form.selectedIds.size} selected</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            form.setSelectedIds(
              allSelected
                ? new Set([form.liveAssets[0].id])
                : new Set(form.liveAssets.map((asset) => asset.id)),
            )
          }
        >
          {allSelected ? 'Select one' : 'Select all'}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {form.liveAssets.map((asset) => {
          const draft = form.drafts[asset.id];
          const selected = form.selectedIds.has(asset.id);
          const changed = !locationsEqual(draft, editableLocationFrom(asset.metadata.location));
          return (
            <button
              key={asset.id}
              type="button"
              className={`grid w-full grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 border-b px-3 py-2 text-left transition-colors ${
                selected ? 'bg-accent/70' : 'hover:bg-accent/35'
              }`}
              aria-pressed={selected}
              onClick={(event) =>
                event.ctrlKey || event.metaKey ? form.toggleSelected(asset.id) : form.selectOnly(asset.id)
              }
            >
              <div className="h-12 w-12 overflow-hidden rounded-md bg-muted">
                <AssetThumbnail asset={asset} size={ThumbnailSize.XS} />
              </div>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium" title={asset.filename}>
                    {asset.filename}
                  </span>
                  {changed && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Changed" />
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {composeLocationName(draft) || 'No place name'}
                </span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {formatCoordinates(draft)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Tooltip for one of this dialog's icon actions. The wrapper keeps pointer
 * events once the button is disabled (buttons drop them), so the tooltip can
 * still explain what the action is waiting for.
 */
function ActionTooltip({ tooltip, children }: { tooltip: string; children: JSX.Element }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function numberInputValue(aggregate: ReturnType<typeof commonLocationValue<'latitude'>>): string | number {
  return aggregate.mixed || aggregate.value === null ? '' : aggregate.value;
}

/** Stays pinned above the scrolling fields: it names what an edit will touch. */
function LocationDetailsHeader({ form }: { form: EditLocationForm }) {
  const selectionLabel =
    form.selectedIds.size === 1 ? 'the selected photo' : `${form.selectedIds.size} selected photos`;

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold">Location details</p>
        <p className="truncate text-xs text-muted-foreground">Changes apply to {selectionLabel}.</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => form.updateSelected({ ...EMPTY_LOCATION })}
      >
        <IconTrash size={15} />
        Clear location
      </Button>
    </div>
  );
}

function LocationFields({ form }: { form: EditLocationForm }) {
  const latitude = commonLocationValue(form.selectedDrafts, 'latitude');
  const longitude = commonLocationValue(form.selectedDrafts, 'longitude');
  const altitude = commonLocationValue(form.selectedDrafts, 'altitude');
  const sublocation = commonLocationValue(form.selectedDrafts, 'sublocation');
  const city = commonLocationValue(form.selectedDrafts, 'city');
  const state = commonLocationValue(form.selectedDrafts, 'state');
  const country = commonLocationValue(form.selectedDrafts, 'country');
  const countryCode = commonLocationValue(form.selectedDrafts, 'countryCode');

  function parseNumber(value: string): number | null {
    if (value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Only the one pair on screen can be copied: across a mixed selection there
  // is no single value to put on the clipboard.
  const copyablePair =
    !latitude.mixed && !longitude.mixed && latitude.value !== null && longitude.value !== null
      ? formatCoordinatePair(latitude.value, longitude.value)
      : null;

  async function copyCoordinates() {
    if (!copyablePair) return;

    try {
      await writeText(copyablePair);
      toast.success('Coordinates copied to clipboard', { description: copyablePair });
    } catch {
      toast.error('Could not copy the coordinates');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="overflow-hidden rounded-lg border">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-2">
            <IconMapPin size={16} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Coordinates</p>
              <p className="text-xs text-muted-foreground">GPS position pinned on the map</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ActionTooltip
              tooltip={
                copyablePair
                  ? `Copy ${copyablePair} to the clipboard`
                  : 'Select a single photo with coordinates to copy them.'
              }
            >
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                disabled={copyablePair === null}
                onClick={() => void copyCoordinates()}
                aria-label="Copy coordinates"
              >
                <IconCopy size={16} />
              </Button>
            </ActionTooltip>
            <Button
              type="button"
              size="sm"
              variant="outline"
              isLoading={form.isPastingCoordinates}
              onClick={() => void form.pasteCoordinates()}
            >
              {!form.isPastingCoordinates && <IconClipboard size={15} />}
              Paste coordinates
            </Button>
            <ActionTooltip
              tooltip={
                form.hasSelectedPlace
                  ? 'Look up coordinates for the place below. Requires an internet connection.'
                  : 'Enter a city, region or country below to look up its coordinates.'
              }
            >
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                isLoading={form.isForwardGeocoding}
                disabled={!form.hasSelectedPlace}
                onClick={() => void form.fillCoordinatesFromPlace()}
                aria-label="Coordinates from place"
              >
                {!form.isForwardGeocoding && <IconWorldSearch size={16} />}
              </Button>
            </ActionTooltip>
          </div>
        </header>
        <div className="grid gap-3 p-3 sm:grid-cols-3">
          <CoordinateField
            label="Latitude"
            min={-90}
            max={90}
            value={numberInputValue(latitude)}
            mixed={latitude.mixed}
            emptyPlaceholder="Enter or paste latitude"
            onChange={(value) => form.updateSelected({ latitude: parseNumber(value) })}
          />
          <CoordinateField
            label="Longitude"
            min={-180}
            max={180}
            value={numberInputValue(longitude)}
            mixed={longitude.mixed}
            emptyPlaceholder="Enter or paste longitude"
            onChange={(value) => form.updateSelected({ longitude: parseNumber(value) })}
          />
          <CoordinateField
            label="Altitude"
            value={numberInputValue(altitude)}
            mixed={altitude.mixed}
            emptyPlaceholder="Enter altitude"
            suffix="m"
            action={
              <ActionTooltip
                tooltip={
                  form.hasSelectedCoordinates
                    ? 'Look up terrain elevation with Open-Meteo. Requires an internet connection.'
                    : 'Set a latitude and longitude to look up the altitude.'
                }
              >
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  isLoading={form.isLookingUpElevation}
                  disabled={!form.hasSelectedCoordinates}
                  onClick={() => void form.lookupSelectedElevations()}
                  aria-label="Look up altitude"
                >
                  {!form.isLookingUpElevation && <IconMountain size={16} />}
                </Button>
              </ActionTooltip>
            }
            onChange={(value) => form.updateSelected({ altitude: parseNumber(value) })}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-2">
            <IconWorld size={16} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Place</p>
              <p className="text-xs text-muted-foreground">Named location saved with the photo</p>
            </div>
          </div>
          <ActionTooltip
            tooltip={
              form.hasSelectedCoordinates
                ? 'Look up the place for the coordinates above. Requires an internet connection.'
                : 'Set a latitude and longitude above to look up the place.'
            }
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              isLoading={form.isReverseGeocoding}
              disabled={!form.hasSelectedCoordinates}
              onClick={() => void form.fillPlaceFromCoordinates()}
            >
              {!form.isReverseGeocoding && <IconMapPinSearch size={15} />}
              Place from coordinates
            </Button>
          </ActionTooltip>
        </header>
        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <PlaceField
            label="City"
            aggregate={city}
            emptyPlaceholder="Enter city"
            onChange={(value) => form.updateSelected({ city: value })}
          />
          <PlaceField
            label="Region / state"
            aggregate={state}
            emptyPlaceholder="Enter region or state"
            onChange={(value) => form.updateSelected({ state: value })}
          />
          <CountryField
            aggregate={country}
            codeAggregate={countryCode}
            // Resolving the name to an ISO code (when it matches a known country)
            // keeps grouping/flags canonical; free text that matches nothing
            // clears the code so we never group by a stale country.
            onChange={(value, code) => form.updateSelected({ country: value, countryCode: code })}
          />
          <PlaceField
            label="Spot / place"
            aggregate={sublocation}
            emptyPlaceholder="Enter a spot, e.g. a landmark"
            onChange={(value) => form.updateSelected({ sublocation: value })}
            description="Neighborhood, landmark, venue or another specific place within the city."
          />
        </div>
      </section>

      {form.hasInvalidDraft && (
        <p className="text-xs text-destructive-text">
          Latitude must be between −90 and 90, longitude between −180 and 180, and both coordinates must be
          set together.
        </p>
      )}
    </div>
  );
}

function CoordinateField({
  label,
  value,
  mixed,
  emptyPlaceholder,
  onChange,
  min,
  max,
  suffix,
  action,
}: {
  label: string;
  value: string | number;
  mixed: boolean;
  emptyPlaceholder: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  suffix?: string;
  action?: JSX.Element;
}) {
  const inputId = `edit-location-${label.toLowerCase()}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-sm">
      <label className="font-medium" htmlFor={inputId}>
        {label}
      </label>
      <div className="relative">
        <Input
          id={inputId}
          type="number"
          step="any"
          min={min}
          max={max}
          className={action ? 'pr-16' : suffix ? 'pr-8' : undefined}
          value={value}
          placeholder={mixed ? 'Mixed' : emptyPlaceholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && (
          <span
            className={`pointer-events-none absolute inset-y-0 flex items-center text-xs text-muted-foreground ${
              action ? 'right-10' : 'right-3'
            }`}
          >
            {suffix}
          </span>
        )}
        {action && <span className="absolute inset-y-0 right-1 flex items-center">{action}</span>}
      </div>
    </div>
  );
}

function PlaceField({
  label,
  aggregate,
  emptyPlaceholder,
  onChange,
  description,
}: {
  label: string;
  aggregate: { mixed: boolean; value: string | null };
  emptyPlaceholder: string;
  onChange: (value: string | null) => void;
  description?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        value={aggregate.mixed ? '' : (aggregate.value ?? '')}
        placeholder={aggregate.mixed ? 'Mixed' : emptyPlaceholder}
        onChange={(event) => onChange(normalizePlaceName(event.target.value))}
      />
      {description && <span className="text-xs text-muted-foreground">{description}</span>}
    </label>
  );
}

/**
 * Kept small so the whole list fits without an inner scrollbar: a scrollable
 * popover inside the modal fights the dialog's scroll-lock (react-remove-scroll),
 * which broke wheel/trackpad scrolling. Short, type-to-filter results avoid that.
 */
const COUNTRY_SUGGESTION_LIMIT = 8;

function filterCountries(query: string): readonly CountryOption[] {
  const q = query.trim().toLowerCase();
  // Only suggest once the user types — an on-focus dump of every country made a
  // tall popover that swallowed scroll gestures.
  if (!q) return [];
  return getCountryOptions()
    .filter((option) => option.name.toLowerCase().includes(q) || option.code.toLowerCase().startsWith(q))
    .slice(0, COUNTRY_SUGGESTION_LIMIT);
}

/**
 * Country input that stays free-text but nudges toward real countries: a styled
 * combobox suggests localized names with their flag and ISO code (a native
 * `<datalist>` can't render either), and any entry that resolves to a code shows
 * its flag and back-fills the code so grouping stays canonical.
 */
function CountryField({
  aggregate,
  codeAggregate,
  onChange,
}: {
  aggregate: { mixed: boolean; value: string | null };
  codeAggregate: { mixed: boolean; value: string | null };
  onChange: (value: string | null, code: string | null) => void;
}) {
  const value = aggregate.mixed ? '' : (aggregate.value ?? '');
  // Prefer the country's stored ISO code (canonical) so the flag shows even when
  // the name is in another language than the UI (e.g. embedded "United States"
  // while the picker is in Spanish). Fall back to resolving it from the name.
  const storedCode = codeAggregate.mixed ? null : codeAggregate.value;
  const resolvedCode = storedCode ?? countryCodeFromName(value);

  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => filterCountries(value), [value]);

  // Keep the highlight in range whenever the list (or open state) changes.
  useEffect(() => setActiveIndex(0), [value, open]);

  const commit = (option: CountryOption): void => {
    onChange(option.name, option.code);
    setOpen(false);
  };

  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="font-medium">Country</span>
      <Popover open={open && suggestions.length > 0} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative" ref={anchorRef}>
            {/* Always render the slot (flag or a neutral placeholder) so the input
                padding never changes — no layout shift as the code resolves. */}
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center">
              {resolvedCode ? (
                <CountryFlag
                  code={resolvedCode}
                  className="w-5 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.1)]"
                />
              ) : (
                <span className="flex w-5 justify-center" aria-label="Unknown country">
                  <IconFlag size={15} className="text-muted-foreground" />
                </span>
              )}
            </span>
            <Input
              role="combobox"
              aria-expanded={open}
              autoComplete="off"
              className="pl-10"
              value={value}
              placeholder={aggregate.mixed ? 'Mixed' : 'Enter or pick a country'}
              onChange={(event) => {
                const name = normalizePlaceName(event.target.value);
                onChange(name, countryCodeFromName(name));
                setOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setOpen(true);
                  setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === 'Enter' && open && suggestions[activeIndex]) {
                  event.preventDefault();
                  commit(suggestions[activeIndex]);
                } else if (event.key === 'Escape') {
                  setOpen(false);
                }
              }}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          // z-1000001 sits above the dialog layer (1000000); portaling escapes the
          // dialog's overflow clipping so the list is never cut off. Height fits the
          // capped result count so it never needs its own scrollbar (which the modal's
          // scroll-lock would fight).
          className="z-1000001 max-h-80 w-(--radix-popover-trigger-width) overflow-auto p-1"
          align="start"
          sideOffset={4}
          // Keep focus (and the caret) in the input while the list is open, and
          // don't close when the user clicks back into the input to edit.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target instanceof Node && anchorRef.current?.contains(event.target)) {
              event.preventDefault();
            }
          }}
        >
          <div role="listbox" aria-label="Countries">
            {suggestions.map((option, index) => (
              <button
                key={option.code}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                  index === activeIndex ? 'bg-accent' : 'hover:bg-accent',
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit(option)}
              >
                <CountryFlag
                  code={option.code}
                  className="w-5 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.1)]"
                />
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{option.code}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </label>
  );
}

/**
 * Single-photo left panel: just the preview and the filename. The fields next to
 * it already show the place and the coordinates, so no summary is repeated here.
 */
function SinglePhotoPanel({ form }: { form: EditLocationForm }) {
  const asset = form.liveAssets[0];

  return (
    <section className="flex min-h-0 flex-col gap-2">
      <div className="min-h-28 flex-1 overflow-hidden rounded-lg border bg-muted">
        <AssetThumbnail asset={asset} className="h-full w-full" />
      </div>
      <span className="shrink-0 truncate text-sm font-medium" title={asset.filename}>
        {asset.filename}
      </span>
    </section>
  );
}

function EditLocationContent({
  assets,
  onClose,
  onRunningChange,
  onPhaseChange,
}: {
  assets: AssetInClient[];
  onClose: () => void;
  onRunningChange: (running: boolean) => void;
  onPhaseChange: (phase: BulkActionDialogPhaseKind) => void;
}) {
  const form = useEditLocationForm(assets, onRunningChange, onPhaseChange);
  const isSingle = form.liveAssets.length === 1;
  const mapMarkers = useMemo<LocationMapMarker[]>(
    () =>
      form.liveAssets.flatMap((asset) => {
        const location = form.drafts[asset.id];
        return location.latitude !== null && location.longitude !== null
          ? [
              {
                id: asset.id,
                latitude: location.latitude,
                longitude: location.longitude,
                selected: form.selectedIds.has(asset.id),
                label: asset.filename,
              },
            ]
          : [];
      }),
    [form.drafts, form.liveAssets, form.selectedIds],
  );

  if (form.bulkAction.phase.kind === 'result') {
    return (
      <BulkActionResultStep
        summary={form.bulkAction.phase.summary}
        outcome={form.bulkAction.phase.outcome}
        isUndoing={form.bulkAction.isUndoing}
        onUndo={() => void form.bulkAction.undo(onClose)}
        onDone={onClose}
      />
    );
  }

  return (
    <>
      <DialogBody
        ref={form.editorRef}
        className={`flex flex-col gap-3 overflow-hidden ${
          form.isApplying ? 'pointer-events-none select-none opacity-60' : ''
        }`}
        aria-busy={form.isApplying}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          {/*
            Photos and map share one column so the fields beside them get the
            full dialog height to scroll in — a short window no longer squeezes
            them into a couple of rows. The map stays out of the scroll pane, so
            the wheel never fights it.
          */}
          <div className="flex min-h-0 flex-col gap-3 md:w-88 md:shrink-0">
            {isSingle ? <SinglePhotoPanel form={form} /> : <LocationList form={form} />}
            <div className="h-[clamp(8.5rem,24vh,17rem)] shrink-0">
              <LocationMap
                className="h-full"
                markers={mapMarkers}
                editable
                onMapClick={(latitude, longitude) => form.updateSelected({ latitude, longitude })}
                onMarkerSelect={form.selectOnly}
                onMarkerChange={(id, latitude, longitude) => {
                  form.selectOnly(id);
                  form.updateOne(id, { latitude, longitude });
                }}
              />
            </div>
          </div>
          <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <LocationDetailsHeader form={form} />
            {/* `px-2` keeps the focus ring of the fields inside this scroll pane visible. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-1">
              <LocationFields form={form} />
            </div>
            {/* Same column as the fields, matching the date dialog: only when Apply would write. */}
            <Collapse open={form.changedAssets.length > 0 && !form.hasInvalidDraft} className="mx-2 shrink-0">
              <MetadataImpactNotice impact="automatic" showReadOnly />
            </Collapse>
          </section>
        </div>
      </DialogBody>

      <DialogFooter>
        {form.bulkAction.phase.kind === 'running' ? (
          <BulkActionProgress label={form.bulkAction.phase.label} progress={form.bulkAction.phase.progress} />
        ) : (
          <>
            {!isSingle && (
              <span className="mr-auto self-center text-xs text-muted-foreground">
                {form.changedAssets.length} of {form.liveAssets.length} files changed
              </span>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void form.handleApply()} disabled={!form.canApply}>
              Apply
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

export function EditLocationDialog() {
  const open = useEditLocationDialog((state) => state.open);
  const assets = useEditLocationDialog((state) => state.assets);
  const close = useEditLocationDialog((state) => state.close);
  const [rendered, setRendered] = useState(assets);
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<BulkActionDialogPhaseKind>('edit');

  useEffect(() => {
    if (open) {
      setRendered(assets);
    } else {
      setIsRunning(false);
      setPhase('edit');
    }
  }, [assets, open]);

  const isSingle = rendered.length === 1;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !isRunning && close()}>
      <DialogContent
        className={
          phase === 'result'
            ? 'w-[min(94vw,40rem)]'
            : `h-[min(85vh,54rem)] ${isSingle ? 'w-[min(94vw,62rem)]' : 'w-[min(96vw,76rem)]'}`
        }
        hideCloseButton={isRunning}
      >
        <DialogHeader>
          <DialogTitle>Edit location</DialogTitle>
          <DialogDescription>
            {phase === 'running'
              ? 'Saving location changes to the library and photo files.'
              : phase === 'result'
                ? 'Review what was updated and any files that could not be written.'
                : rendered.length === 1
                  ? 'Place this photo on the map or enter its coordinates.'
                  : `Place ${rendered.length} photos together, or select rows to adjust them individually.`}
          </DialogDescription>
        </DialogHeader>
        {open && rendered.length > 0 && (
          <EditLocationContent
            key={rendered.map((asset) => asset.id).join(',')}
            assets={rendered}
            onClose={close}
            onRunningChange={setIsRunning}
            onPhaseChange={setPhase}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
