import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleChevron,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { CameraTags } from '@/db/models/CameraTags';
import { getMeteringModeLabel } from '@/media/metadata/fields/meteringMode';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import {
  buildCaptureChips,
  flashIcon,
  formatCameraName,
  formatExposureCompensation,
  hasAnyCameraData,
  meteringModeIcon,
  whiteBalanceIcon,
} from './CameraInfo';
import { CameraMaker } from './CameraMaker';
import { InfoRowText } from './InfoRowText';
import { MetadataRows, visibleRows } from './MetadataRows';
import { useInfoPanelState } from './infoPanelState';

export function CaptureCard({
  camera,
  disabled,
  onEdit,
}: {
  camera: CameraTags;
  disabled: boolean;
  onEdit: () => void;
}) {
  const expanded = useInfoPanelState((state) => state.captureExpanded);
  const toggle = useInfoPanelState((state) => state.toggleCapture);
  const present = hasAnyCameraData(camera);
  const cameraName = formatCameraName(camera.Make, camera.Model);
  const rows = visibleRows([
    { label: 'Exposure program', value: camera.ExposureProgram },
    { label: 'Exposure compensation', value: formatExposureCompensation(camera.ExposureCompensation) },
    {
      label: 'Metering',
      value: getMeteringModeLabel(camera.MeteringMode),
      icon: meteringModeIcon(camera.MeteringMode),
    },
    { label: 'White balance', value: camera.WhiteBalance, icon: whiteBalanceIcon(camera.WhiteBalance) },
    { label: 'Flash', value: camera.Flash, icon: flashIcon(camera.Flash) },
  ]);
  const summaryItems = [
    {
      icon: meteringModeIcon(camera.MeteringMode),
      value: getMeteringModeLabel(camera.MeteringMode),
    },
    {
      icon: whiteBalanceIcon(camera.WhiteBalance),
      value: camera.WhiteBalance,
    },
    {
      icon: flashIcon(camera.Flash),
      value: camera.Flash,
    },
  ].filter((item) => item.value);
  const summary =
    summaryItems.map((item) => item.value).join(' · ') || rows.map((row) => row.value).join(' · ');
  return (
    <section className="info-surface capture-card">
      <div className="capture-card__identity">
        <CameraMaker make={camera.Make} empty={!cameraName} />
        <InfoRowText
          title={cameraName || (camera.Lens ? 'Camera - not set' : 'Camera & lens - not set')}
          subtitle={camera.Lens}
          className={
            cameraName ? 'gap-[3px]' : 'gap-[3px] rounded-[8px] border border-dashed border-border p-[9px]'
          }
          titleClassName={
            cameraName
              ? 'truncate'
              : 'overflow-hidden text-ellipsis text-xs font-normal text-muted-foreground'
          }
          subtitleClassName="truncate"
        />
        {present && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit capture"
            title="Edit capture"
            disabled={disabled}
            onClick={onEdit}
          >
            <IconPencil size={16} />
          </Button>
        )}
      </div>
      <div className="capture-strip">
        {buildCaptureChips(camera).map((chip) => {
          const unit = chip.value.endsWith('mm') ? ' mm' : null;
          return (
            <div
              key={chip.label}
              data-empty={chip.empty}
              title={chip.label}
              aria-label={`${chip.label}: ${chip.value}`}
            >
              <chip.icon size={20} aria-hidden />

              <span className="min-w-0 whitespace-nowrap">
                <span className={`text-sm font-semibold${chip.empty ? ' text-muted-foreground' : ''}`}>
                  {unit ? chip.value.slice(0, -3) : chip.value}
                </span>
                {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
              </span>
            </div>
          );
        })}
      </div>
      {!present && (
        <div className="capture-card__add">
          <Button variant="outline" disabled={disabled} onClick={onEdit}>
            <IconPlus size={16} />
            Add capture details
          </Button>
        </div>
      )}
      {!!rows.length && (
        <Collapsible open={expanded} onOpenChange={toggle}>
          <CollapsibleTrigger className="info-expand-row">
            {expanded ? (
              <span className="shrink-0 text-sm font-semibold">More settings</span>
            ) : (
              <span className="capture-summary" title={summary}>
                {summaryItems.map(({ icon: Icon, value }, index) => (
                  <span key={`${value}-${index}`}>
                    {Icon && <Icon size={18} aria-hidden />}
                    {value}
                  </span>
                ))}
                {!summaryItems.length && <span className="info-truncate">{summary}</span>}
              </span>
            )}
            <CollapsibleChevron size={18} />
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <MetadataRows rows={rows} />
          </CollapsiblePanel>
        </Collapsible>
      )}
    </section>
  );
}
