import { FilterCriteria } from '@/common/query/filters/FilterCriteria';
import type { SearchFilter } from '@/common/query/filters/FilterTypes';
import { SEARCH_KEYWORDS } from '@/common/query/searchKeywords';
import {
  IconAperture,
  IconBolt,
  IconCalendar,
  IconCalendarPlus,
  IconCamera,
  IconCheck,
  IconClock,
  IconExposure,
  IconFile,
  IconFileDescription,
  IconFilter,
  IconFocusCentered,
  IconFolder,
  IconMapPin,
  IconMinus,
  IconPhoto,
  IconRuler,
  IconSearch,
  IconStar,
  IconSunHigh,
  IconTag,
  IconTagOff,
  IconTrash,
  IconUserOff,
  IconUsers,
  IconVideo,
} from '@tabler/icons-react';

export const FIELD_ICONS: Record<string, typeof IconSearch> = {
  type: IconPhoto,
  person: IconUsers,
  person_count: IconUsers,
  tag: IconTag,
  tag_count: IconTag,
  rating: IconStar,
  date: IconCalendar,
  after: IconCalendar,
  before: IconCalendar,
  year: IconCalendar,
  month: IconCalendar,
  day: IconCalendar,
  weekday: IconCalendar,
  added: IconCalendarPlus,
  filename: IconFile,
  description: IconFileDescription,
  size: IconFile,
  camera: IconCamera,
  lens: IconAperture,
  aperture: IconAperture,
  iso: IconCamera,
  focal: IconRuler,
  shutter: IconClock,
  whitebalance: IconSunHigh,
  flashvalue: IconBolt,
  exposureprogram: IconExposure,
  metering: IconFocusCentered,
  location: IconMapPin,
  has: IconCheck,
  no: IconMinus,
};

const CRITERIA_ICONS = new Map<FilterCriteria, typeof IconSearch>([
  ...SEARCH_KEYWORDS.map(({ key, criteria }) => [criteria, FIELD_ICONS[key]] as const),
  [FilterCriteria.path, IconFolder],
  [FilterCriteria.rated, IconStar],
  [FilterCriteria.trashed, IconTrash],
  [FilterCriteria.flash, IconBolt],
  [FilterCriteria.locationCity, IconMapPin],
  [FilterCriteria.locationState, IconMapPin],
  [FilterCriteria.locationCountry, IconMapPin],
  [FilterCriteria.locationCountryCode, IconMapPin],
]);

export function SearchFilterIcon({ filter }: { filter: SearchFilter }) {
  const Icon =
    filter.filterCriteria === FilterCriteria.mediaType
      ? filter.value === 'video'
        ? IconVideo
        : IconPhoto
      : filter.operator === 'equals' &&
          filter.value === 0 &&
          filter.filterCriteria === FilterCriteria.tag_count
        ? IconTagOff
        : filter.operator === 'equals' &&
            filter.value === 0 &&
            filter.filterCriteria === FilterCriteria.person_count
          ? IconUserOff
          : (CRITERIA_ICONS.get(filter.filterCriteria) ?? IconFilter);

  return <Icon size={14} stroke={1.8} aria-hidden="true" className="shrink-0" />;
}
