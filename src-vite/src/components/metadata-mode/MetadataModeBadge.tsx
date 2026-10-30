import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMetadataModeInfo } from './useMetadataModeInfo';

interface MetadataModeBadgeProps {
  /** Hide the explanatory tooltip where the surrounding UI already explains the mode (settings). */
  showTooltip?: boolean;
}

/** Current file-metadata mode at a glance. Reads the persisted settings itself. */
export function MetadataModeBadge({ showTooltip = true }: MetadataModeBadgeProps) {
  const { variant, Icon, label, hint } = useMetadataModeInfo();

  const badge = (
    <Badge variant={variant} tabIndex={showTooltip ? 0 : undefined}>
      <Icon />
      {label}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="top">
        <p className="font-semibold">Metadata: {label}</p>
        <p className="text-muted-foreground">{hint}</p>
      </TooltipContent>
    </Tooltip>
  );
}
