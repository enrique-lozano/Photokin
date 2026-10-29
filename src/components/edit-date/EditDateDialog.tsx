import { AssetThumbnail } from '@/components/asset-thumbnail/AssetThumbnail';
import { BulkActionProgress } from '@/components/bulk-action/BulkActionProgress';
import { EXPLICIT_METADATA_WRITE_WORDING } from '@/components/bulk-action/BulkActionResult';
import { BulkActionResultStep } from '@/components/bulk-action/BulkActionResultStep';
import {
  useBulkActionDialog,
  useInertWhen,
  type BulkActionDialogPhaseKind,
} from '@/components/bulk-action/useBulkActionDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { InfoHint } from '@/components/ui/infoHint';
import { Input } from '@/components/ui/input';
import { InputWithIcon } from '@/components/ui/inputWithIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssetsService } from '@/db/api/services/assets.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { useLiveAssetSnapshot } from '@/hooks/useLiveAssetSnapshot';
import { cn } from '@/lib/utils';
import {
  computeNewDate,
  dateTimeLocalValueToDate,
  dateToDateTimeLocalValue,
  isOffsetZero,
  ZERO_OFFSET,
  type DateOffset,
  type DateSource,
} from '@/media/metadata/dates/dateAdjustment';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import type { BulkOutcome } from '@/system/bulkOutcome';
import { tauriFileTimestamps } from '@/system/diskManager';
import { formatDate } from '@/utils/dateFormatter';
import { IconArrowNarrowDown, IconCalendar } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useEditDateDialog } from './editDateDialogStore';

function getSourceOptions(many: boolean): { value: DateSource; label: string; hint: string }[] {
  return [
    {
      value: 'current',
      label: many ? 'Current date of each file' : 'Current date of the file',
      hint: many ? 'Start from the date each file already has.' : 'Start from the date the file already has.',
    },
    {
      value: 'filename',
      label: 'Date from file name',
      hint: 'Read a date encoded in the file name (e.g. IMG_20220701_113932).',
    },
    {
      value: 'custom',
      label: many ? 'A new date for all files' : 'A new date',
      hint: many ? 'Set the same starting date for every file.' : 'Set a specific date.',
    },
  ];
}

/** Displays a UTC date/time, matching how the value is stored and written back. */
function formatCell(date: Date | null): string {
  return date
    ? formatDate(date, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      })
    : '';
}

interface EditDateRow {
  asset: AssetInClient;
  currentDate: Date;
  newDate: Date | null;
}

/** Shared state + derived data + apply logic behind both the single and multi layouts. */
function useEditDateForm(
  assets: AssetInClient[],
  onRunningChange: (running: boolean) => void,
  onPhaseChange: (phase: BulkActionDialogPhaseKind) => void,
) {
  const [source, setSource] = useState<DateSource>('current');
  const [customValue, setCustomValue] = useState(() =>
    dateToDateTimeLocalValue(assets[0]?.metadata.date ?? new Date()),
  );
  const [offset, setOffset] = useState<DateOffset>(ZERO_OFFSET);
  // Each field is an independent switch — the dialog fully decides what gets
  // written, with no coupling to the global write-back preference.
  const [writeTaken, setWriteTaken] = useState(true);
  const [writeDigitized, setWriteDigitized] = useState(false);
  const [writeModified, setWriteModified] = useState(false);
  const [writeFileModifyTime, setWriteFileModifyTime] = useState(false);
  const bulkAction = useBulkActionDialog(onRunningChange, onPhaseChange);
  const isApplying = bulkAction.phase.kind === 'running';
  const editorRef = useInertWhen(isApplying);

  const liveAssets = useLiveAssetSnapshot(assets);

  const customDate = source === 'custom' ? dateTimeLocalValueToDate(customValue) : null;

  const rows = useMemo<EditDateRow[]>(
    () =>
      liveAssets.map((asset) => ({
        asset,
        currentDate: asset.metadata.date,
        newDate: computeNewDate(source, asset, customDate, offset),
      })),
    [liveAssets, source, customDate, offset],
  );

  const applicable = useMemo(() => rows.filter((row) => row.newDate !== null), [rows]);
  const skippedCount = rows.length - applicable.length;
  const anyFieldSelected = writeTaken || writeDigitized || writeModified || writeFileModifyTime;
  const canApply = applicable.length > 0 && anyFieldSelected && !isApplying;

  const handleApply = async () => {
    if (applicable.length === 0) return;
    await bulkAction.run({
      label: 'Adjusting date & time',
      summary: (outcome) =>
        `Updated the date of ${outcome.total.toLocaleString()} ${outcome.total === 1 ? 'file' : 'files'}`,
      action: async (onFileProgress): Promise<BulkOutcome> => {
        const updates = applicable.map(({ asset, newDate }) => ({ id: asset.id, date: newDate as Date }));
        const filenameById = new Map(applicable.map(({ asset }) => [asset.id, asset.filename]));
        const beforeDates = new Map(applicable.map(({ asset }) => [asset.id, asset.metadata.date]));
        const beforeMtimes = writeFileModifyTime
          ? new Map(
              await Promise.all(
                applicable.map(
                  async ({ asset }) =>
                    [asset.id, (await tauriFileTimestamps(asset.fullPath)).modified] as const,
                ),
              ),
            )
          : new Map<string, Date | null>();
        const writeOptions = {
          writeTaken,
          writeDigitized,
          writeModified,
          setFileModifyTime: writeFileModifyTime,
          onlyExistingTags: false,
        };

        const { fileFailures } = await AssetsService.updateAssetsCaptureDate(
          updates,
          writeOptions,
          onFileProgress,
        );

        const afterDates = new Map(updates.map((update) => [update.id, update.date.toISOString()]));
        const undo = async () => {
          const currentAssets = await Promise.all(
            applicable.map(({ asset }) => AssetsService.getByUUID(asset.id)),
          );
          for (const current of currentAssets) {
            if (current.metadata.date.toISOString() !== afterDates.get(current.id)) {
              throw new Error(`${current.filename} had its date edited again`);
            }
          }
          await AssetsService.updateAssetsCaptureDate(
            currentAssets.map((asset) => ({
              id: asset.id,
              date: beforeDates.get(asset.id) ?? asset.metadata.date,
            })),
            { ...writeOptions, setFileModifyTime: false },
          );
          if (writeFileModifyTime) {
            const mtimeUpdates = currentAssets.flatMap((asset) => {
              const date = beforeMtimes.get(asset.id);
              return date ? [{ id: asset.id, date }] : [];
            });
            if (mtimeUpdates.length > 0) {
              await AssetsService.updateAssetsCaptureDate(
                mtimeUpdates,
                {
                  writeTaken: false,
                  writeDigitized: false,
                  writeModified: false,
                  setFileModifyTime: true,
                  onlyExistingTags: false,
                },
                undefined,
                { skipDatabaseUpdate: true },
              );
            }
          }
        };
        return {
          total: applicable.length,
          fileCount: applicable.length,
          fileFailures: [...fileFailures].map(([id, message]) => ({
            id,
            label: filenameById.get(id) ?? id,
            reason: `could not write to file (${message})`,
          })),
          undo,
        };
      },
    });
  };

  return {
    source,
    setSource,
    customValue,
    setCustomValue,
    offset,
    setOffset,
    writeTaken,
    setWriteTaken,
    writeDigitized,
    setWriteDigitized,
    writeModified,
    setWriteModified,
    writeFileModifyTime,
    setWriteFileModifyTime,
    isApplying,
    rows,
    applicable,
    skippedCount,
    canApply,
    handleApply,
    bulkAction,
    editorRef,
  };
}

type EditDateForm = ReturnType<typeof useEditDateForm>;

function EditDateResult({ form, onClose }: { form: EditDateForm; onClose: () => void }) {
  if (form.bulkAction.phase.kind !== 'result') return null;

  return (
    <BulkActionResultStep
      summary={form.bulkAction.phase.summary}
      outcome={form.bulkAction.phase.outcome}
      wording={EXPLICIT_METADATA_WRITE_WORDING}
      isUndoing={form.bulkAction.isUndoing}
      onUndo={() => void form.bulkAction.undo(onClose)}
      onDone={onClose}
    />
  );
}

/** The right-hand controls, identical between the single and multi layouts. */
function EditDateControls({
  form,
  many,
  className,
}: {
  form: EditDateForm;
  many: boolean;
  className?: string;
}) {
  const {
    source,
    setSource,
    customValue,
    setCustomValue,
    offset,
    setOffset,
    writeTaken,
    setWriteTaken,
    writeDigitized,
    setWriteDigitized,
    writeModified,
    setWriteModified,
    writeFileModifyTime,
    setWriteFileModifyTime,
  } = form;

  const rewritesFile = writeTaken || writeDigitized || writeModified;

  return (
    // `px-2` keeps the focus ring of the controls inside this scroll pane visible.
    <div className={cn('flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto px-2', className)}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">New date based on</legend>
        {getSourceOptions(many).map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-accent',
              source === option.value && 'border-primary bg-accent/60',
            )}
          >
            <input
              type="radio"
              name="edit-date-source"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
              checked={source === option.value}
              onChange={() => setSource(option.value)}
            />
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{option.label}</span>
              <Collapse open={source === option.value}>
                <span className="block pt-0.5 text-xs text-muted-foreground">{option.hint}</span>
              </Collapse>
            </span>
          </label>
        ))}
      </fieldset>

      <Collapse open={source === 'custom'}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Date &amp; time (UTC)</span>
          <InputWithIcon
            type="datetime-local"
            step={60}
            startIcon={<IconCalendar />}
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
          />
        </label>
      </Collapse>

      {/* An absolute date needs no offset, so the shift controls fold away in that mode. */}
      <Collapse open={source !== 'custom'}>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Then shift by</span>
          <div className="flex items-start gap-2">
            <Select
              value={String(offset.direction)}
              onValueChange={(value) =>
                setOffset((prev) => ({ ...prev, direction: Number(value) === -1 ? -1 : 1 }))
              }
            >
              <SelectTrigger className="w-16 min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">+</SelectItem>
                <SelectItem value="-1">−</SelectItem>
              </SelectContent>
            </Select>
            <OffsetField
              label="days"
              value={offset.days}
              onChange={(days) => setOffset((prev) => ({ ...prev, days }))}
            />
            <OffsetField
              label="hrs"
              value={offset.hours}
              onChange={(hours) => setOffset((prev) => ({ ...prev, hours }))}
            />
            <OffsetField
              label="min"
              value={offset.minutes}
              onChange={(minutes) => setOffset((prev) => ({ ...prev, minutes }))}
            />
          </div>
          {isOffsetZero(offset) && <span className="text-xs text-muted-foreground">No offset applied.</span>}
        </div>
      </Collapse>

      <fieldset className="flex flex-col border-t pt-4">
        <legend className="mb-2 text-sm font-medium">Metadata to update</legend>

        <div className="flex flex-col gap-2.5">
          <FieldToggle
            label="Date taken"
            hint="The original capture date (EXIF DateTimeOriginal, IPTC/XMP created)."
            checked={writeTaken}
            onChange={setWriteTaken}
          />
          <FieldToggle
            label="Date digitized"
            hint="When the photo was scanned or imported (EXIF CreateDate, IPTC/XMP digital-creation)."
            checked={writeDigitized}
            onChange={setWriteDigitized}
          />
          <FieldToggle
            label="Date modified (metadata)"
            hint="The ModifyDate/MetadataDate fields stored inside the file's metadata."
            checked={writeModified}
            onChange={setWriteModified}
          />
          <FieldToggle
            label="File modified time"
            hint={`The ${
              many ? 'files' : 'file'
            } modification time on disk — doesn't rewrite the file's contents.`}
            checked={writeFileModifyTime}
            onChange={setWriteFileModifyTime}
          />
        </div>

        {/* Spacing lives inside the collapsing region so it leaves no gap when closed. */}
        <Collapse open={rewritesFile}>
          <MetadataImpactNotice impact="explicit" className="mt-2.5" />
        </Collapse>
      </fieldset>
    </div>
  );
}

function EditDateFooter({ form, many, onClose }: { form: EditDateForm; many: boolean; onClose: () => void }) {
  const { rows, applicable, skippedCount, canApply, isApplying, handleApply } = form;

  if (form.bulkAction.phase.kind === 'running') {
    return (
      <DialogFooter>
        <BulkActionProgress label={form.bulkAction.phase.label} progress={form.bulkAction.phase.progress} />
      </DialogFooter>
    );
  }

  return (
    <DialogFooter>
      {many && (
        <div className="mr-auto self-center text-xs text-muted-foreground">
          {skippedCount > 0 && `${skippedCount} of ${rows.length} skipped · `}
          {applicable.length} {applicable.length === 1 ? 'file' : 'files'} to update
        </div>
      )}
      <Button type="button" variant="outline" onClick={onClose} disabled={isApplying}>
        Cancel
      </Button>
      <Button type="button" onClick={() => void handleApply()} disabled={!canApply}>
        Apply
      </Button>
    </DialogFooter>
  );
}

/** Multi-file layout: a scrollable preview table beside the controls. */
function EditDateMultiContent({
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
  const form = useEditDateForm(assets, onRunningChange, onPhaseChange);

  if (form.bulkAction.phase.kind === 'result') {
    return <EditDateResult form={form} onClose={onClose} />;
  }

  return (
    <>
      <DialogBody
        ref={form.editorRef}
        className={`flex flex-col gap-4 overflow-hidden md:flex-row ${
          form.isApplying ? 'pointer-events-none select-none opacity-60' : ''
        }`}
        aria-busy={form.isApplying}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,10rem)_minmax(0,10rem)] gap-x-3 border-b px-2 pb-2 text-xs font-medium text-muted-foreground">
            <span />
            <span>File</span>
            <span>Current date</span>
            <span>New date</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {form.rows.map(({ asset, currentDate, newDate }) => (
              <div
                key={asset.id}
                className="grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,10rem)_minmax(0,10rem)] items-center gap-x-3 border-b px-2 py-1.5 text-sm"
              >
                <div className="h-11 w-11 overflow-hidden rounded bg-muted">
                  <AssetThumbnail asset={asset} size={ThumbnailSize.XS} />
                </div>
                <span className="min-w-0 truncate" title={asset.filename}>
                  {asset.filename}
                </span>
                <span className="truncate text-muted-foreground">{formatCell(currentDate)}</span>
                {newDate ? (
                  <span className="truncate font-medium text-foreground">{formatCell(newDate)}</span>
                ) : (
                  <span className="truncate text-xs italic text-muted-foreground">No date in file name</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <EditDateControls form={form} many className="md:w-72 md:flex-none md:shrink-0" />
      </DialogBody>

      <EditDateFooter form={form} many onClose={onClose} />
    </>
  );
}

/** Single-file layout: a large preview + a current → new summary beside the controls. */
function EditDateSingleContent({
  asset,
  onClose,
  onRunningChange,
  onPhaseChange,
}: {
  asset: AssetInClient;
  onClose: () => void;
  onRunningChange: (running: boolean) => void;
  onPhaseChange: (phase: BulkActionDialogPhaseKind) => void;
}) {
  const form = useEditDateForm([asset], onRunningChange, onPhaseChange);

  if (form.bulkAction.phase.kind === 'result') {
    return <EditDateResult form={form} onClose={onClose} />;
  }

  const { currentDate, newDate } = form.rows[0];

  return (
    <>
      <DialogBody
        ref={form.editorRef}
        className={`flex flex-col gap-5 overflow-hidden sm:flex-row ${
          form.isApplying ? 'pointer-events-none select-none opacity-60' : ''
        }`}
        aria-busy={form.isApplying}
      >
        <div className="flex shrink-0 flex-col gap-3 sm:w-60">
          <div className="mx-auto aspect-square w-40 overflow-hidden rounded-lg border bg-muted sm:w-full">
            <AssetThumbnail asset={asset} className="h-full w-full" />
          </div>
          <span className="truncate text-sm font-medium" title={asset.filename}>
            {asset.filename}
          </span>

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current date
              </span>
              <span className="text-sm">{formatCell(currentDate)}</span>
            </div>
            <IconArrowNarrowDown size={18} className="text-muted-foreground" />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                New date
              </span>
              {newDate ? (
                <span className="text-sm font-semibold text-foreground">{formatCell(newDate)}</span>
              ) : (
                <span className="text-sm italic text-muted-foreground">No date found in the file name</span>
              )}
            </div>
          </div>
        </div>

        <EditDateControls form={form} many={false} />
      </DialogBody>

      <EditDateFooter form={form} many={false} onClose={onClose} />
    </>
  );
}

interface FieldToggleProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A checkbox row with a bold label and an info tooltip explaining the field. */
function FieldToggle({ label, hint, checked, onChange }: FieldToggleProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
        <span className="font-medium">{label}</span>
      </label>
      <InfoHint>{hint}</InfoHint>
    </div>
  );
}

interface OffsetFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function OffsetField({ label, value, onChange }: OffsetFieldProps) {
  return (
    <label className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <Input
        type="number"
        min={0}
        className="w-full px-2 text-center"
        value={value}
        onChange={(event) => onChange(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
      />
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
    </label>
  );
}

/** Global host: mounted once in the app shell, driven by {@link useEditDateDialog}. */
export function EditDateDialog() {
  const open = useEditDateDialog((state) => state.open);
  const assets = useEditDateDialog((state) => state.assets);
  const close = useEditDateDialog((state) => state.close);

  // Keep the last assets during the close animation so the body doesn't blank out.
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
  }, [open, assets]);

  const isSingle = rendered.length === 1;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !isRunning && close()}>
      <DialogContent
        className={
          phase === 'result'
            ? 'w-[min(94vw,40rem)]'
            : isSingle
              ? 'w-[min(94vw,44rem)]'
              : 'w-[min(94vw,60rem)]'
        }
        hideCloseButton={isRunning}
      >
        <DialogHeader>
          <DialogTitle>Adjust date &amp; time</DialogTitle>
          <DialogDescription>
            {phase === 'running'
              ? 'Saving date changes to the library and photo files.'
              : phase === 'result'
                ? 'Review what was updated and any files that could not be written.'
                : isSingle
                  ? 'Preview and change the capture date of this file.'
                  : `Preview and change the capture date of ${rendered.length} files.`}
          </DialogDescription>
        </DialogHeader>
        {open &&
          (isSingle ? (
            <EditDateSingleContent
              key={rendered[0].id}
              asset={rendered[0]}
              onClose={close}
              onRunningChange={setIsRunning}
              onPhaseChange={setPhase}
            />
          ) : (
            <EditDateMultiContent
              key={rendered.map((asset) => asset.id).join(',')}
              assets={rendered}
              onClose={close}
              onRunningChange={setIsRunning}
              onPhaseChange={setPhase}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}
