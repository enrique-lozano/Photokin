import { IconCircleCheckFilled } from '@tabler/icons-react';

import { cn } from '@/lib/utils';

/** Selection tick drawn over photos and faces; white with a shadow so it reads on any image. */
export function SelectionCheck({ selected, size = 22 }: { selected: boolean; size?: number }) {
  return (
    <IconCircleCheckFilled
      size={size}
      className={cn(selected ? 'text-primary' : 'text-white drop-shadow-[0_1px_3px_hsl(0_0%_0%/0.8)]')}
    />
  );
}
