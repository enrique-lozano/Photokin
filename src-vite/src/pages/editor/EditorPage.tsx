import { WindowControls } from '@/components/app-shell/WindowControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleChevron,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ConfirmationDialogHost } from '@/components/ui/confirmation-dialog';
import { confirm, useConfirmationDialog } from '@/components/ui/confirmationDialogStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { AppToaster } from '@/components/ui/toaster';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  initialEdit,
  orientRegion,
  pixelCrop,
  reframeCrop,
  transformedSize,
  transformRegion,
  type ImageEdit,
} from '@/media/edit/editGeometry';
import { estimateEditBytes, fileSizeChange, QUALITY_MARKS, qualityLabel } from '@/media/edit/editPreview';
import {
  requestEditor,
  type EditorData,
  type EditorPreview,
  type PreparedEditorEdit,
} from '@/media/edit/editorProtocol';
import { useWindowControls } from '@/system/useWindowControls';
import { formatBytes } from '@/utils/numberFormatter';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconChevronDown,
  IconCrop,
  IconDeviceFloppy,
  IconEye,
  IconFlipHorizontal,
  IconFlipVertical,
  IconLoader2,
  IconRestore,
  IconRotate,
  IconRotateClockwise,
} from '@tabler/icons-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { useEffect, useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import './editor.css';

function EditorTitleBar({ filename }: { filename?: string }) {
  const { startDragging, handleDragRegionDoubleClick } = useWindowControls();
  return (
    <div
      className={`editor-titlebar${platform() === 'macos' ? ' editor-titlebar-mac' : ''}`}
      data-tauri-drag-region
      onMouseDown={startDragging}
      onDoubleClick={(event) => {
        if (event.target instanceof Element && event.target.closest('.window-controls')) return;
        void handleDragRegionDoubleClick(event);
      }}
    >
      <h1 data-tauri-drag-region title={filename}>
        {filename ? `Edit - ${filename}` : 'Photo editor'}
      </h1>
      <WindowControls />
    </div>
  );
}

export function EditorPage() {
  const assetId = new URLSearchParams(window.location.search).get('assetId') ?? '';
  const [data, setData] = useState<EditorData>();
  const [edit, setEdit] = useState<ImageEdit>();
  const [aspect, setAspect] = useState('free');
  const [animatedCrop, setAnimatedCrop] = useState<PercentCrop>();
  const cropAnimation = useRef<number | null>(null);
  const [prepared, setPrepared] = useState<PreparedEditorEdit>();
  const [preparedKey, setPreparedKey] = useState('');
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<'copy' | 'overwrite'>('copy');
  const [preview, setPreview] = useState<{ key: string; data: EditorPreview }>();
  const [previewError, setPreviewError] = useState('');
  const [comparing, setComparing] = useState(false);
  const [previewingCrop, setPreviewingCrop] = useState(false);
  const comparePointer = useRef(false);
  const compareKeys = useRef(new Set<string>());
  const [sourceLoaded, setSourceLoaded] = useState(false);
  const [bounds, setBounds] = useState({ width: 700, height: 550 });
  const stage = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const savingRef = useRef(false);
  const preparingRef = useRef(false);
  const filenameEdited = useRef(false);
  const dirty = useRef(false);
  const editKey = JSON.stringify(edit);
  const previewFormat = edit?.format;
  const previewQuality = previewFormat === 'png' ? 100 : edit?.quality;
  const previewKey = `${previewFormat}:${previewQuality}`;

  useEffect(
    () => () => {
      if (cropAnimation.current !== null) cancelAnimationFrame(cropAnimation.current);
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void requestEditor<EditorData>({ action: 'load', assetId })
      .then((loaded) => {
        if (!active) return;
        setData(loaded);
        setEdit(initialEdit(loaded.width, loaded.height, loaded.format));
        setFilename(`${loaded.filename.replace(/\.[^.]+$/, '')}_edited.${loaded.format}`);
      })
      .catch((failure: unknown) => {
        if (active) setError(String(failure));
      });
    return () => {
      active = false;
    };
  }, [assetId]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    if (!data || !sourceLoaded || !previewFormat || previewQuality === undefined) return;
    let active = true;
    setPreviewError('');
    const timeout = window.setTimeout(() => {
      void requestEditor<EditorPreview>({
        action: 'preview',
        assetId,
        edit: { ...initialEdit(data.width, data.height, previewFormat), quality: previewQuality },
      })
        .then((result) => {
          if (active) setPreview({ key: previewKey, data: result });
        })
        .catch((failure: unknown) => {
          if (active) setPreviewError(`Photo quality preview unavailable: ${String(failure)}`);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [assetId, data, sourceLoaded, previewFormat, previewQuality, previewKey]);

  useEffect(() => {
    const releaseCompareKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'm') compareKey('m', false);
    };
    window.addEventListener('blur', endComparison);
    window.addEventListener('keyup', releaseCompareKey);
    document.addEventListener('visibilitychange', endComparison);
    return () => {
      window.removeEventListener('blur', endComparison);
      window.removeEventListener('keyup', releaseCompareKey);
      document.removeEventListener('visibilitychange', endComparison);
    };
  }, []);

  useEffect(() => {
    const current = getCurrentWindow();
    const stop = current.onCloseRequested(async (event) => {
      if (closing.current) return;
      event.preventDefault();
      if (savingRef.current || preparingRef.current) return;
      if (
        dirty.current &&
        !(await confirm({
          icon: <IconAlertTriangle />,
          title: 'Discard this edit?',
          description: 'Your unsaved changes will be lost. The original photo has not been changed.',
          confirmLabel: 'Discard changes',
          tone: 'warning',
        }))
      )
        return;
      closing.current = true;
      await requestEditor({ action: 'discard', assetId }).catch(() => {});
      await current.close();
    });
    return () => {
      void stop.then((unlisten) => unlisten());
    };
  }, [assetId]);

  function change(next: ImageEdit) {
    dirty.current = true;
    endComparison();
    if (next.crop[2] === 1 && next.crop[3] === 1) setPreviewingCrop(false);
    setError('');
    setEdit(next);
  }

  async function prepare(): Promise<PreparedEditorEdit> {
    if (!edit) throw new Error('Wait for the photo to finish loading.');
    if (prepared && preparedKey === editKey) return prepared;
    preparingRef.current = true;
    setBusy(true);
    setError('');
    setPrepared(undefined);
    setPreparedKey('');
    try {
      const result = await requestEditor<PreparedEditorEdit>({ action: 'prepare', assetId, edit });
      setPrepared(result);
      setPreparedKey(editKey);
      if (!filenameEdited.current) setFilename(result.suggestedName);
      return result;
    } finally {
      preparingRef.current = false;
      setBusy(false);
    }
  }

  function endComparison() {
    comparePointer.current = false;
    compareKeys.current.clear();
    setComparing(false);
  }

  function compareKey(key: string, held: boolean) {
    if (held) compareKeys.current.add(key);
    else compareKeys.current.delete(key);
    setComparing(comparePointer.current || compareKeys.current.size > 0);
  }

  async function save(overwrite: boolean) {
    if (!data || !edit || savingRef.current || preparingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    endComparison();
    setError('');
    try {
      const result = await prepare();
      const copyName = filenameEdited.current ? filename : result.suggestedName;
      const destination = overwrite ? data.filename : copyName;
      const confirmed = await confirm({
        icon: <IconDeviceFloppy />,
        title: overwrite ? 'Replace the original photo?' : 'Save an edited copy?',
        description: overwrite
          ? 'This replaces the original file and cannot be undone. Keep a backup if you may need it.'
          : 'The original photo will stay unchanged. The edited copy will be added to this album.',
        tone: overwrite ? 'destructive' : 'default',
        confirmLabel: overwrite ? 'Replace original' : 'Save copy',
        content: (
          <div className="editor-confirm">
            <strong>{destination}</strong>
            <span>
              {result.width} x {result.height} · {formatBytes(result.bytes)}
            </span>
            {(!data.canOverwrite || edit.format !== data.format) && (
              <p className="editor-warning">
                <IconAlertTriangle size={18} />
                Converting formats may omit metadata the destination format cannot store. The original photo
                will stay unchanged.
              </p>
            )}
            <Collapsible className="editor-confirm__details text-xs text-muted-foreground">
              <CollapsibleTrigger className="editor-confirm__details-trigger">
                Metadata details
                <CollapsibleChevron size={14} />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <p>
                  Existing camera, date, location, keywords and color-profile data are copied where supported.
                  Orientation, dimensions, previews and face regions are corrected for the edited photo.
                </p>
              </CollapsiblePanel>
            </Collapsible>
          </div>
        ),
      });
      if (!confirmed) return;
      await requestEditor<{ path: string }>({
        action: 'save',
        assetId,
        token: result.token,
        overwrite,
        filename: copyName,
      });
      dirty.current = false;
      closing.current = true;
      await getCurrentWindow().close();
    } catch (failure) {
      setError(String(failure));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!data || !edit)
    return (
      <main className="editor-page">
        <EditorTitleBar />
        <div className="editor-loading" aria-busy={!error}>
          {error ? (
            <IconAlertTriangle size={28} />
          ) : (
            <IconLoader2 size={28} className="motion-safe:animate-spin" aria-hidden />
          )}
          <p role={error ? 'alert' : 'status'}>{error || 'Opening photo...'}</p>
          {!error && <span className="editor-hint">Loading the photo and its editing details.</span>}
          <Button variant="outline" onClick={() => void getCurrentWindow().close()}>
            Close
          </Button>
        </div>
        <ConfirmationDialogHost />
      </main>
    );

  const size = transformedSize(data.width, data.height, edit.turns);
  const crop = pixelCrop(edit, data.width, data.height);
  const cropped = crop.x !== 0 || crop.y !== 0 || crop.width !== size.width || crop.height !== size.height;
  const showCropPreview = cropped && previewingCrop;
  const previewSize = showCropPreview ? crop : size;
  const scale = Math.max(
    0.001,
    Math.min((bounds.width - 48) / previewSize.width, (bounds.height - 48) / previewSize.height, 1),
  );
  const percentCrop: PercentCrop = {
    unit: '%',
    x: edit.crop[0] * 100,
    y: edit.crop[1] * 100,
    width: edit.crop[2] * 100,
    height: edit.crop[3] * 100,
  };
  const ready = prepared && preparedKey === editKey && !busy;
  const sample = preview?.key === previewKey && !previewError ? preview.data : undefined;
  const outputBytes = ready ? prepared.bytes : sample ? estimateEditBytes(sample, edit) : undefined;
  const sizeChange = outputBytes === undefined ? undefined : fileSizeChange(data.bytes, outputBytes);
  const estimated = !ready;
  const sizeDescription = ready
    ? 'Exact file size, including preserved photo details.'
    : 'Estimated from a display-resolution compression sample. Image detail, cropping and preserved metadata can change the final size. Saving calculates the exact size before confirmation.';
  const removedFaces = data.regions.filter(
    (region) => !transformRegion(region, edit, data.width, data.height),
  ).length;
  const changed = dirty.current;
  const canOverwrite = data.canOverwrite && edit.format === data.format;
  const overwrite = saveMode === 'overwrite' && canOverwrite;

  function applyCrop(next: PercentCrop) {
    if (!edit) return;
    const updated: ImageEdit = {
      ...edit,
      crop: [next.x / 100, next.y / 100, next.width / 100, next.height / 100],
    };
    const pixels = pixelCrop(updated, data!.width, data!.height);
    if (pixels.width < 1 || pixels.height < 1) return;
    change({ ...updated, width: pixels.width, height: pixels.height });
  }

  function stopCropAnimation() {
    if (cropAnimation.current !== null) cancelAnimationFrame(cropAnimation.current);
    cropAnimation.current = null;
    setAnimatedCrop(undefined);
  }

  function selectAspect(value: string) {
    const start = animatedCrop ?? percentCrop;
    stopCropAnimation();
    setAspect(value);
    if (value === 'free') return;
    const target = centerCrop(
      makeAspectCrop({ unit: '%', width: 100 }, Number(value), size.width, size.height),
      size.width,
      size.height,
    );
    applyCrop(target);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const started = performance.now();
    setAnimatedCrop(start);
    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / 260);
      const eased = 1 - (1 - progress) ** 3;
      setAnimatedCrop({
        unit: '%',
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        width: start.width + (target.width - start.width) * eased,
        height: start.height + (target.height - start.height) * eased,
      });
      if (progress < 1) cropAnimation.current = requestAnimationFrame(frame);
      else stopCropAnimation();
    };
    cropAnimation.current = requestAnimationFrame(frame);
  }

  function transform(turns: number, horizontal: boolean, vertical: boolean) {
    if (!edit) return;
    stopCropAnimation();
    const swap = turns % 2 !== edit.turns % 2;
    const operations = { turns, flipHorizontal: horizontal, flipVertical: vertical };
    const next = { ...edit, ...operations, crop: reframeCrop(edit, operations) };
    const pixels = pixelCrop(next, data!.width, data!.height);
    if (swap && aspect !== 'free') setAspect(String(1 / Number(aspect)));
    change({
      ...next,
      width: pixels.width,
      height: pixels.height,
    });
  }

  return (
    <main
      className="editor-page"
      aria-busy={saving || busy}
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          saving ||
          busy ||
          useConfirmationDialog.getState().open ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        if (
          event.key.toLowerCase() === 'm' &&
          sourceLoaded &&
          changed &&
          !(
            event.target instanceof Element &&
            event.target.closest(
              'input, textarea, select, [contenteditable="true"], [role="option"], [role="slider"], [role="combobox"], [role="menuitemradio"]',
            )
          )
        ) {
          event.preventDefault();
          compareKey('m', true);
          return;
        }
        if (
          (event.target instanceof Element &&
            event.target.closest(
              'input, button, textarea, select, [role="option"], [role="slider"], [role="combobox"], [role="menuitemradio"]',
            )) ||
          comparing
        )
          return;
        if (event.key.toLowerCase() === 'r') {
          event.preventDefault();
          transform((edit.turns + (event.shiftKey ? 3 : 1)) % 4, edit.flipVertical, edit.flipHorizontal);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          void getCurrentWindow().close();
        } else if (event.key === 'Enter' && sourceLoaded && changed) {
          event.preventDefault();
          void save(overwrite);
        }
      }}
    >
      <AppToaster />
      <ConfirmationDialogHost />
      <EditorTitleBar filename={data.filename} />
      <div className="editor-body">
        <section className="editor-preview" aria-label="Photo preview">
          <div className="editor-preview-toolbar">
            <fieldset
              className="editor-transform-tools"
              disabled={saving || busy || comparing || !sourceLoaded}
              aria-label="Rotate and flip"
            >
              {[
                {
                  label: 'Rotate left',
                  Icon: IconRotate,
                  action: () => transform((edit.turns + 3) % 4, edit.flipVertical, edit.flipHorizontal),
                },
                {
                  label: 'Rotate right',
                  Icon: IconRotateClockwise,
                  action: () => transform((edit.turns + 1) % 4, edit.flipVertical, edit.flipHorizontal),
                },
                {
                  label: 'Flip horizontally',
                  Icon: IconFlipHorizontal,
                  pressed: edit.flipHorizontal,
                  action: () => transform(edit.turns, !edit.flipHorizontal, edit.flipVertical),
                },
                {
                  label: 'Flip vertically',
                  Icon: IconFlipVertical,
                  pressed: edit.flipVertical,
                  action: () => transform(edit.turns, edit.flipHorizontal, !edit.flipVertical),
                },
              ].map(({ label, Icon, action, pressed }) => (
                <Tooltip key={label}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={label}
                      aria-pressed={pressed}
                      onClick={action}
                    >
                      <Icon size={19} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              ))}
            </fieldset>
            {cropped && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={showCropPreview ? 'bg-accent text-accent-foreground' : undefined}
                    aria-label="Preview crop"
                    aria-pressed={showCropPreview}
                    disabled={saving || busy || comparing || !sourceLoaded}
                    onClick={() => {
                      stopCropAnimation();
                      setPreviewingCrop((value) => !value);
                    }}
                  >
                    <IconCrop size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showCropPreview ? 'Return to adjusting the crop' : 'Preview crop'}
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="editor-compare-button"
                  variant="outline"
                  size="sm"
                  disabled={saving || busy || !sourceLoaded || !changed}
                  aria-pressed={comparing}
                  aria-label="Compare with original"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    comparePointer.current = true;
                    setComparing(true);
                  }}
                  onPointerUp={() => {
                    comparePointer.current = false;
                    setComparing(compareKeys.current.size > 0);
                  }}
                  onPointerCancel={endComparison}
                  onLostPointerCapture={() => {
                    comparePointer.current = false;
                    setComparing(compareKeys.current.size > 0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== ' ' && event.key !== 'Enter') return;
                    event.preventDefault();
                    compareKey(event.key, true);
                  }}
                  onKeyUp={(event) => {
                    if (event.key !== ' ' && event.key !== 'Enter') return;
                    event.preventDefault();
                    compareKey(event.key, false);
                  }}
                  onBlur={() => {
                    compareKey(' ', false);
                    compareKey('Enter', false);
                  }}
                >
                  <IconEye size={16} />
                  Compare
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Hold to see the original. Release to return to your edit. Shortcut: M.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className={`editor-stage${comparing ? ' editor-stage-before' : ''}`} ref={stage}>
            <ReactCrop
              crop={showCropPreview ? undefined : (animatedCrop ?? percentCrop)}
              style={
                showCropPreview
                  ? { width: crop.width * scale, height: crop.height * scale, overflow: 'hidden' }
                  : undefined
              }
              onChange={(_, percent) => {
                stopCropAnimation();
                applyCrop(percent);
              }}
              aspect={aspect === 'free' ? undefined : Number(aspect)}
              ruleOfThirds
              keepSelection
              disabled={saving || busy || comparing || showCropPreview || !sourceLoaded}
              minWidth={1}
              minHeight={1}
            >
              <div
                className="editor-oriented"
                style={{
                  width: size.width * scale,
                  height: size.height * scale,
                  transform: showCropPreview
                    ? `translate(${-crop.x * scale}px, ${-crop.y * scale}px)`
                    : undefined,
                }}
              >
                <img
                  src={convertFileSrc(sample?.previewPath ?? data.previewPath)}
                  alt={data.filename}
                  draggable={false}
                  onLoad={() => setSourceLoaded(true)}
                  onError={() =>
                    sample
                      ? setPreviewError(
                          'The photo quality preview could not be displayed. Reopen the editor to try again.',
                        )
                      : setError(
                          'The photo could not be displayed. Close the editor and reopen it to try again.',
                        )
                  }
                  style={{
                    width: data.width * scale,
                    height: data.height * scale,
                    transform: `translate(-50%, -50%) scaleX(${edit.flipHorizontal ? -1 : 1}) scaleY(${edit.flipVertical ? -1 : 1}) rotate(${edit.turns * 90}deg)`,
                  }}
                />
                {!showCropPreview &&
                  data.regions.map((region, index) => {
                    const area = orientRegion(region, edit);
                    return (
                      <span
                        key={index}
                        className="editor-face"
                        style={{
                          left: `${(area.x - area.w / 2) * 100}%`,
                          top: `${(area.y - area.h / 2) * 100}%`,
                          width: `${area.w * 100}%`,
                          height: `${area.h * 100}%`,
                        }}
                      />
                    );
                  })}
              </div>
            </ReactCrop>
            <img
              className="editor-original"
              src={convertFileSrc(data.previewPath)}
              alt="Original photo before edits"
              draggable={false}
              hidden={!comparing}
            />
            {comparing && (
              <Badge variant="secondary" className="editor-original-label">
                Original
              </Badge>
            )}
            {(busy || (!error && !sourceLoaded)) && (
              <div className="editor-stage-status" role="status">
                <IconLoader2 size={24} className="motion-safe:animate-spin" aria-hidden />
                <span>{busy ? 'Preparing photo to save...' : 'Loading photo...'}</span>
                {busy && (
                  <span className="editor-hint">Rendering at full size and preserving photo details.</span>
                )}
              </div>
            )}
          </div>
          <p className="editor-canvas-caption">
            {comparing ? (
              'Original photo. Release Compare or M to return to your edit.'
            ) : showCropPreview ? (
              'Cropped photo. Turn off Preview crop to adjust. Hold Compare or M to see the original.'
            ) : !sample && !previewError && sourceLoaded ? (
              <>
                <IconLoader2 size={14} className="motion-safe:animate-spin" aria-hidden /> Updating photo
                quality preview...
              </>
            ) : (
              'Drag the edges to crop. Hold Compare or M to see the original.'
            )}
          </p>
        </section>
        <aside className="editor-panel" aria-label="Edit settings">
          <fieldset disabled={saving || busy || comparing || !sourceLoaded} className="editor-fields">
            <section className="editor-tool-section" aria-label="Crop">
              <h2>Crop</h2>
              <label>
                Aspect ratio
                <Select value={aspect} onValueChange={selectAspect}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value={String(size.width / size.height)}>Original</SelectItem>
                    {[
                      [1, 'Square 1:1'],
                      [4 / 3, 'Landscape 4:3'],
                      [3 / 2, 'Landscape 3:2'],
                      [16 / 9, 'Wide 16:9'],
                      [3 / 4, 'Portrait 3:4'],
                      [2 / 3, 'Portrait 2:3'],
                      [9 / 16, 'Portrait 9:16'],
                    ]
                      .filter(([ratio]) => ratio !== size.width / size.height)
                      .map(([ratio, label]) => (
                        <SelectItem key={ratio} value={String(ratio)}>
                          {label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="editor-measure">
                <span>Crop size</span>
                <strong>
                  {crop.width} x {crop.height} px
                </strong>
              </div>
              {removedFaces > 0 && (
                <p className="editor-warning">
                  <IconAlertTriangle size={18} />
                  {removedFaces} face {removedFaces === 1 ? 'region will' : 'regions will'} be removed from
                  the edited photo.
                </p>
              )}
            </section>
            <section className="editor-tool-section" aria-label="Save settings">
              <h2>Save settings</h2>
              <label>
                File format
                <Select
                  value={edit.format}
                  onValueChange={(value) => {
                    if (value !== 'jpg' && value !== 'png' && value !== 'webp') return;
                    setSaveMode('copy');
                    setFilename((current) =>
                      current ? `${current.replace(/\.[^.]*$/, '')}.${value}` : current,
                    );
                    change({ ...edit, format: value });
                  }}
                >
                  <SelectTrigger aria-label="File format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jpg">
                      JPEG{data.canOverwrite && data.format === 'jpg' ? ' · Original format' : ''}
                    </SelectItem>
                    {data.canOverwrite && (
                      <>
                        <SelectItem value="png">
                          PNG · lossless{data.format === 'png' ? ' · Original format' : ''}
                        </SelectItem>
                        <SelectItem value="webp">
                          WebP{data.format === 'webp' ? ' · Original format' : ''}
                        </SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </label>
              {edit.format !== 'png' ? (
                <>
                  <div className="editor-quality">
                    <div className="editor-measure">
                      <span className="editor-quality-label">Photo quality</span>
                      <strong>{edit.quality}%</strong>
                    </div>
                    <Slider
                      min={1}
                      max={100}
                      step={1}
                      value={[edit.quality]}
                      onValueChange={([quality]) => change({ ...edit, quality })}
                      aria-label="Photo quality"
                      aria-valuetext={`${edit.quality}% - ${qualityLabel(edit.quality)}`}
                      className="editor-quality-slider"
                      disabled={saving || busy || comparing || !sourceLoaded}
                    />
                    <div className="editor-quality-marks">
                      {QUALITY_MARKS.map(({ quality, label }) => (
                        <Button
                          key={quality}
                          variant="ghost"
                          size="xs"
                          style={{ left: `${((quality - 1) / 99) * 100}%` }}
                          className={
                            qualityLabel(edit.quality) === label ? 'editor-quality-mark-active' : undefined
                          }
                          title={`Quality ${quality}`}
                          aria-pressed={qualityLabel(edit.quality) === label}
                          onClick={() => change({ ...edit, quality })}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    <p className="editor-hint">
                      Saving compresses the photo again, even without edits. 100% may produce a larger file;
                      it does not restore lost detail.
                    </p>
                  </div>
                </>
              ) : (
                <div className="editor-quality">
                  <div className="editor-measure">
                    <span>Photo quality</span>
                    <strong>Lossless</strong>
                  </div>
                  <p className="editor-hint">PNG keeps full image quality. No compression preview needed.</p>
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="editor-file-size" tabIndex={0} aria-label={sizeDescription}>
                    <span>{estimated ? 'Estimated size' : 'File size'}</span>
                    <span className="editor-file-size-values" aria-live="polite">
                      {formatBytes(data.bytes)}
                      <IconArrowRight size={12} aria-hidden />
                      <strong>
                        {outputBytes === undefined
                          ? previewError
                            ? 'Unavailable'
                            : 'Estimating...'
                          : `${estimated ? '~' : ''}${formatBytes(outputBytes)}`}
                      </strong>
                    </span>
                    {sizeChange !== undefined && (
                      <Badge variant={sizeChange < 0 ? 'success' : sizeChange > 0 ? 'warning' : 'secondary'}>
                        {estimated ? '~' : ''}
                        {sizeChange > 0 ? '+' : ''}
                        {sizeChange}%
                      </Badge>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>{sizeDescription}</TooltipContent>
              </Tooltip>
            </section>
            {!overwrite && (
              <Collapsible className="editor-file-name">
                <CollapsibleTrigger className="editor-section-trigger">
                  File name
                  <CollapsibleChevron />
                </CollapsibleTrigger>
                <p className="editor-file-name-value" title={filename}>
                  {filename}
                </p>
                <CollapsiblePanel>
                  <label>
                    Save copy as
                    <Input
                      value={filename}
                      onChange={(event) => {
                        filenameEdited.current = true;
                        setFilename(event.target.value);
                      }}
                    />
                  </label>
                </CollapsiblePanel>
              </Collapsible>
            )}
          </fieldset>
        </aside>
      </div>
      {(error || previewError) && (
        <p className="editor-error" role="alert">
          {error || previewError}
        </p>
      )}
      <footer className="editor-footer">
        <Button
          variant="ghost"
          disabled={saving || busy || !changed}
          onClick={() => {
            stopCropAnimation();
            dirty.current = false;
            setEdit(initialEdit(data.width, data.height, data.format));
            setAspect('free');
            setPreviewingCrop(false);
            endComparison();
            setError('');
          }}
        >
          <IconRestore size={17} />
          Reset
        </Button>
        <div>
          <Button variant="ghost" disabled={saving || busy} onClick={() => void getCurrentWindow().close()}>
            Cancel
          </Button>
          <div className="editor-save-button" role="group" aria-label="Save photo">
            <Button
              disabled={busy || !sourceLoaded || !changed || (!overwrite && !filename)}
              isLoading={saving}
              onClick={() => void save(overwrite)}
            >
              <IconDeviceFloppy size={17} />
              {saving ? 'Saving...' : overwrite ? 'Overwrite' : 'Save as copy'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" disabled={saving || busy} aria-label="Save options" title="Save options">
                  <IconChevronDown size={17} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuRadioGroup
                  value={overwrite ? 'overwrite' : 'copy'}
                  onValueChange={(value) => setSaveMode(value as 'copy' | 'overwrite')}
                >
                  <DropdownMenuRadioItem value="overwrite" disabled={!canOverwrite}>
                    Overwrite original
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="copy">Save as copy</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </footer>
    </main>
  );
}
