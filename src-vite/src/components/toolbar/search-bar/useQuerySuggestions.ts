import { useState } from 'react';
import { AssetsService } from '@/db/api/services/assets.service';
import { RegionsService } from '@/db/api/services/regions.service';
import { TagsService } from '@/db/api/services/tags.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import {
  CompletionContext,
  fieldSuggestions,
  matchingValues,
  operatorSuggestions,
  QuerySuggestion,
  staticValueSuggestions,
} from './queryCompletion';

export function useQuerySuggestions(context: CompletionContext | null, more: boolean) {
  const [revision, setRevision] = useState(0);
  const key =
    context?.kind === 'value' && ['person', 'tag', 'camera', 'lens', 'location'].includes(context.key)
      ? context.key
      : '';
  const { data, loading, error } = useLiveQuery(
    async () => {
      let items: QuerySuggestion[] = [];
      if (key === 'tag' || key === 'person') {
        const tags =
          key === 'tag'
            ? await TagsService.getAll()
            : (await RegionsService.getRegionTags()).flatMap((person) =>
                person.tag && person.totalResults > person.unconfirmedResults ? [person.tag] : [],
              );
        items = tags.map((tag) => ({
          id: tag.id,
          label: tag.name,
          detail: tag.fullPath,
          text: tag.fullPath,
          kind: 'value',
        }));
      } else if (key === 'camera' || key === 'lens') {
        const rows =
          key === 'camera'
            ? await AssetsService.getTopCameraBodies({ limit: Number.MAX_SAFE_INTEGER })
            : await AssetsService.getTopLenses({ limit: Number.MAX_SAFE_INTEGER });
        items = rows.map((row) => ({
          id: row.label,
          label: row.label,
          detail: `${row.count.toLocaleString()} items`,
          text: row.label,
          kind: 'value',
        }));
      } else if (key === 'location') {
        const rows = await AssetsService.getFileCountByLocation({});
        items = rows.flatMap((row) =>
          row.locationName
            ? [
                {
                  id: row.locationName,
                  label: row.locationName,
                  detail: `${row.totalImages.toLocaleString()} items`,
                  text: row.locationName,
                  kind: 'value' as const,
                },
              ]
            : [],
        );
      }
      return { key, items };
    },
    ['assets', 'tags', 'fileTags', 'tagRegionInfo'],
    { extDependencies: [key, revision] },
  );

  let items: QuerySuggestion[] = [];
  let truncated = false;
  if (context?.kind === 'field') items = fieldSuggestions(context.query, more);
  else if (context?.kind === 'operator') items = operatorSuggestions(context.key);
  else if (context) {
    items = staticValueSuggestions(context);
    if (key && data?.key === key && !loading && !error) {
      const matches = matchingValues(data.items, context.query);
      items.push(...matches.items);
      truncated = matches.truncated;
    }
  }
  return {
    items,
    truncated,
    dynamic: !!key,
    loading: !!key && (loading || data?.key !== key) && !error,
    error: key ? error : null,
    retry: () => setRevision((value) => value + 1),
  };
}
