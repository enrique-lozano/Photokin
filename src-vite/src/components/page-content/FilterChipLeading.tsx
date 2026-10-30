import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import {
  IconCalendar,
  IconHeart,
  IconMapPin,
  IconMapPinOff,
  IconPhoto,
  IconStar,
  IconTagOff,
  IconUser,
  IconUserOff,
  IconUsers,
  IconVideo,
} from '@tabler/icons-react';
import type { ChipIconName, ContentFilterChip } from './contentFilterChips';

const CHIP_ICONS: Record<ChipIconName, typeof IconCalendar> = {
  calendar: IconCalendar,
  heart: IconHeart,
  star: IconStar,
  video: IconVideo,
  photo: IconPhoto,
  user: IconUser,
  users: IconUsers,
  userOff: IconUserOff,
  tagOff: IconTagOff,
  mapPin: IconMapPin,
  mapPinOff: IconMapPinOff,
};

/** The small adornment before a chip label: a person's face, else its icon. */
export function FilterChipLeading({ chip }: { chip: ContentFilterChip }) {
  if (chip.faceRegion) {
    return <FaceThumbnail region={chip.faceRegion} className="filter-chip__face" />;
  }

  if (!chip.icon) return null;

  const Icon = CHIP_ICONS[chip.icon];
  return <Icon size={14} stroke={1.8} />;
}
