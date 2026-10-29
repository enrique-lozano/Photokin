import { TagsService } from '@/db/api/services/tags.service';
import { TagInClient } from '@/db/models/TagDTO';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { useMemo } from 'react';
import { PersonInfo } from '@/db/models/PersonInfo';
import { AssignPersonOption } from './AssignFacePopover';

/** Shared empty result, so a not-yet-loaded list keeps a stable identity for memoized consumers. */
const NO_TAGS: TagInClient[] = [];

/** Every tag that could collide with a newly typed person name. */
export function useFaceAssignmentTags() {
  const { data } = useLiveQuery(() => TagsService.getAll(), ['tags']);
  return data ?? NO_TAGS;
}

/** Known people as targets for assigning a face, most-photographed first. */
export function useAssignPersonOptions(people: PersonInfo[] | null): AssignPersonOption[] {
  return useMemo(
    () =>
      (people ?? [])
        .filter((person) => person.kind === 'known' && person.tag)
        .sort((a, b) => b.totalResults - a.totalResults)
        .map((person) => ({
          id: person.tag!.id,
          name: person.displayName,
          total: person.totalResults,
          representativeRegion: person.representativeRegion,
        })),
    [people],
  );
}
