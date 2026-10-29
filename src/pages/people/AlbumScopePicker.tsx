import { SearchCombobox } from '@/components/ui/search-combobox';
import { Switch } from '@/components/ui/switch';
import { AlbumsService } from '@/db/api/services/albums.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { AlbumInClient } from '@/db/models/AlbumDTO';
import { IconFolder } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useHiddenItemsStore } from '@/stores/hiddenItemsStore';
import { isAlbumHidden } from '@/pages/albums/mapAlbums';

function albumLabel(album: AlbumInClient): string {
  if (album.isAtTheRootLevel) return album.name;
  return album.relativePath.replace(/^[/\\]+/, '');
}

type AlbumScopePickerProps = {
  selectedIds: string[];
  includeSubAlbums: boolean;
  photoCount?: number;
  onChangeSelected: (ids: string[]) => void;
  onChangeIncludeSubAlbums: (value: boolean) => void;
};

/**
 * Lets the user limit a scan to specific albums (default: the whole library)
 * and choose whether nested sub-albums are included.
 */
export function AlbumScopePicker({
  selectedIds,
  includeSubAlbums,
  photoCount,
  onChangeSelected,
  onChangeIncludeSubAlbums,
}: AlbumScopePickerProps) {
  const { data: albums } = useLiveQuery(() => AlbumsService.getAll(), ['albums']);
  const showHiddenItems = useHiddenItemsStore((state) => state.showHiddenItems);

  const options = useMemo(
    () =>
      [...(albums ?? [])]
        .filter((album) => showHiddenItems || !isAlbumHidden(album, albums ?? []))
        .sort((a, b) => a.fullPath.localeCompare(b.fullPath))
        .map((album) => ({
          value: album.id,
          label: albumLabel(album),
          leading: <IconFolder size={15} className="text-muted-foreground" />,
          hint: isAlbumHidden(album, albums ?? []) ? 'Hidden' : undefined,
        })),
    [albums, showHiddenItems],
  );

  return (
    <>
      <SearchCombobox
        multiple
        value={selectedIds}
        onValueChange={onChangeSelected}
        options={options}
        placeholder="Whole library · search albums"
        emptyText="No albums found."
      />
      {photoCount !== undefined && (
        <p className="scan-scope-summary">{photoCount.toLocaleString()} photos to scan</p>
      )}

      <label className="scan-scope-subalbums" data-disabled={selectedIds.length === 0 || undefined}>
        <span className="scan-options-slider-label">Include sub-albums</span>
        <Switch
          checked={includeSubAlbums}
          disabled={selectedIds.length === 0}
          onCheckedChange={onChangeIncludeSubAlbums}
        />
      </label>
    </>
  );
}
