import { FaceContextPreview } from '@/components/face-thumbnail/FaceContextPreview';
import { FaceThumbnail } from '@/components/face-thumbnail/FaceThumbnail';
import { Kbd } from '@/components/ui/kbd';
import { toast } from '@/components/ui/toast';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AssetsService } from '@/db/api/services/assets.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';
import { PersonRegion } from '@/db/models/PersonInfo';
import { TagInClient } from '@/db/models/TagDTO';
import { findBestMatch } from '@/media/faces/faceBestMatch';
import { formatDate } from '@/utils/dateFormatter';
import {
  IconChevronRight,
  IconCamera,
  IconEyeOff,
  IconPlus,
  IconRestore,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { KeyboardEvent, ReactNode, RefObject, useId, useMemo, useRef, useState } from 'react';

export type AssignPersonOption = {
  /** Tag id of the person. */
  id: string;
  name: string;
  total?: number;
  representativeRegion?: PersonRegion;
};

type BestMatch = AssignPersonOption & { score?: number };

/** Anything the card can be positioned against, e.g. a face tile or the cursor. */
export type AssignCardAnchor = { getBoundingClientRect: () => DOMRect };

type AssignFacePopoverProps = {
  /** Trigger element (the face crop, or an "Assign" button for a selection). Optional with `anchor`. */
  children?: ReactNode;
  /** Search placeholder, e.g. "Change person" or "Name this face". */
  title?: string;
  existingPeople: AssignPersonOption[];
  /** All tags, including non-person tags that can collide with a new name. */
  existingTags: TagInClient[];
  /** Suggested person, listed as the best match. Looked up from `region` when omitted. */
  bestMatch?: BestMatch;
  onAssignExisting: (tagId: string) => void | Promise<void>;
  onCreateNew: (name: string) => void | Promise<void>;
  /** When provided, renders "Not a face". */
  onDiscard?: () => void | Promise<void>;
  /** Keeps this detection but removes it from future review and matching. */
  onHide?: () => void | Promise<void>;
  /** Returns an ignored detection to the review queue. */
  onRestore?: () => void | Promise<void>;
  onSetProfilePhoto?: () => Promise<void>;
  /** Notified when the card opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** Controls the open state; pair with `onOpenChange`. */
  open?: boolean;
  /** Positions the card on this instead of the trigger. Keep it stable while open. */
  anchor?: AssignCardAnchor;
  /** The one face being named: shows its photo, file and date, and its best match. */
  region?: PersonRegion;
  /** Several faces named at once: avatars in the header, actions in the plural. */
  faces?: PersonRegion[];
  /** Renders "Open photo" under the photo. */
  onOpenPhoto?: () => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
};

const FREQUENT_LIMIT = 4;
const SEARCH_LIMIT = 6;
const HEADER_AVATARS = 4;
const PHOTO_BAND_HEIGHT = 132;

/**
 * Assignment card for one face or a selection: the photo for context, a
 * "Who is this?" search, the best match and the most frequent people, then
 * New person / Hide / Not a face. ↑↓ move, Enter takes the highlighted row,
 * Esc closes. H and Del act when focus is outside the search field (Del also
 * in an empty field), so names starting with H can still be typed.
 */
export function AssignFacePopover({
  children,
  open: openProp,
  onOpenChange,
  anchor,
  align = 'start',
  side = 'bottom',
  ...bodyProps
}: AssignFacePopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const anchorRef = useRef<AssignCardAnchor | null>(null);
  anchorRef.current = anchor ?? null;
  const inputRef = useRef<HTMLInputElement>(null);

  function setOpenState(next: boolean) {
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  const bodyKey = bodyProps.region?.id ?? bodyProps.faces?.map((face) => face.id).join(',') ?? '';

  return (
    // Modal: the page behind is inert while the card is open (no hover
    // previews, chip clicks or selection); a click outside just closes it.
    <Popover modal open={open} onOpenChange={setOpenState}>
      {children && <PopoverTrigger asChild>{children}</PopoverTrigger>}
      {anchor && <PopoverAnchor virtualRef={anchorRef as RefObject<AssignCardAnchor>} />}
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        collisionPadding={12}
        data-assign-card=""
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        className="assign-card z-1000001"
      >
        <AssignCardBody key={bodyKey} {...bodyProps} inputRef={inputRef} onDone={() => setOpenState(false)} />
      </PopoverContent>
    </Popover>
  );
}

type AssignCardBodyProps = Omit<
  AssignFacePopoverProps,
  'children' | 'open' | 'onOpenChange' | 'anchor' | 'align' | 'side'
> & {
  inputRef: RefObject<HTMLInputElement | null>;
  onDone: () => void;
};

type CardOption = { kind: 'person'; person: AssignPersonOption } | { kind: 'create' };

/** Mounted only while open, so the search and highlight start fresh each time. */
function AssignCardBody({
  title = 'Who is this?',
  existingPeople,
  existingTags,
  bestMatch: bestMatchProp,
  onAssignExisting,
  onCreateNew,
  onDiscard,
  onHide,
  onRestore,
  onSetProfilePhoto,
  region,
  faces,
  onOpenPhoto,
  inputRef,
  onDone,
}: AssignCardBodyProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const plural = (faces?.length ?? 0) > 1;
  const lookUpMatch = !bestMatchProp && !!region && !region.tagId;
  const { data: foundMatch } = useLiveQuery(
    () => (lookUpMatch ? findBestMatch(region.id) : Promise.resolve(null)),
    ['faceEmbeddings'],
    { extDependencies: [lookUpMatch, region?.id] },
  );
  const bestMatch = useMemo<BestMatch | undefined>(() => {
    if (bestMatchProp) return bestMatchProp;
    if (!foundMatch) return undefined;
    const person = existingPeople.find((candidate) => candidate.id === foundMatch.tagId);
    return person && { ...person, score: foundMatch.similarity };
  }, [bestMatchProp, foundMatch, existingPeople]);

  const trimmed = query.trim();
  const personName = trimmed.replaceAll('/', ' ').replace(/\s+/g, ' ').trim();
  const normalizedName = personName.toLowerCase();
  const exactPerson = existingPeople.find((person) => person.name.toLowerCase() === normalizedName);
  const exactTag =
    existingTags.find((tag) => tag.id === exactPerson?.id) ??
    existingTags.find((tag) => tag.name.toLowerCase() === normalizedName);
  const reusableTag =
    exactTag && !exactPerson && !existingTags.some((candidate) => candidate.parentId === exactTag.id)
      ? exactTag
      : undefined;
  const canCreate = personName.length > 0 && !exactTag;

  const frequent = useMemo(
    () => existingPeople.filter((person) => person.id !== bestMatch?.id).slice(0, FREQUENT_LIMIT),
    [existingPeople, bestMatch],
  );
  const matches = useMemo(() => {
    const normalized = trimmed.toLowerCase();
    if (!normalized) return [];
    return existingPeople
      .filter((person) => person.name.toLowerCase().includes(normalized))
      .slice(0, SEARCH_LIMIT);
  }, [existingPeople, trimmed]);

  const options = useMemo<CardOption[]>(() => {
    if (!trimmed) {
      return [...(bestMatch ? [bestMatch] : []), ...frequent].map((person) => ({ kind: 'person', person }));
    }
    const people: CardOption[] = matches.map((person) => ({ kind: 'person', person }));
    return canCreate || reusableTag ? [...people, { kind: 'create' }] : people;
  }, [trimmed, bestMatch, frequent, matches, canCreate, reusableTag]);

  async function withClose(action: () => void | Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onDone();
    } catch {
      setBusy(false);
    }
  }

  function createPerson() {
    if (reusableTag) void withClose(() => onAssignExisting(reusableTag.id));
    else if (canCreate) void withClose(() => onCreateNew(personName));
  }

  function choose(option: CardOption) {
    if (option.kind === 'create') createPerson();
    else void withClose(() => onAssignExisting(option.person.id));
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + delta + options.length) % options.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const highlighted = options[activeIndex];
      if (highlighted) choose(highlighted);
      return;
    }
    if (event.key === 'Delete' && !query && onDiscard) {
      event.preventDefault();
      void withClose(onDiscard);
    }
  }

  function onCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target === inputRef.current || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.key === 'h' || event.key === 'H') && onHide) {
      event.preventDefault();
      void withClose(onHide);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && onDiscard) {
      event.preventDefault();
      void withClose(onDiscard);
    }
  }

  const activeOption = options[activeIndex];
  const optionId = (index: number) => `${listId}-opt-${index}`;

  function personRow(person: AssignPersonOption, index: number, score?: number) {
    return (
      <button
        key={person.id}
        id={optionId(index)}
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        className={'assign-card__row' + (index === activeIndex ? ' is-active' : '')}
        disabled={busy}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => choose({ kind: 'person', person })}
      >
        <FaceThumbnail region={person.representativeRegion} className="assign-card__avatar" />
        <span className="assign-card__row-name">{person.name}</span>
        {score !== undefined ? (
          <span className="assign-card__score" title="How alike the faces look">
            {Math.round(score * 100)}%
          </span>
        ) : (
          person.total !== undefined && (
            <span className="assign-card__row-meta" title={`${person.total.toLocaleString()} faces`}>
              {person.total.toLocaleString()}
            </span>
          )
        )}
      </button>
    );
  }

  return (
    <div className="assign-card__body" onKeyDown={onCardKeyDown}>
      {plural && faces ? (
        <div className="assign-card__plural">
          <span className="assign-card__stack" aria-hidden>
            {faces.slice(0, HEADER_AVATARS).map((face) => (
              <FaceThumbnail key={face.id} region={face} className="assign-card__stack-avatar" />
            ))}
          </span>
          <span className="assign-card__plural-title">Assign {faces.length.toLocaleString()} faces to…</span>
        </div>
      ) : (
        region && <AssignCardPhoto region={region} onOpenPhoto={onOpenPhoto} />
      )}

      <div className="assign-card__search">
        <IconSearch size={15} aria-hidden />
        <input
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={activeOption ? optionId(activeIndex) : undefined}
          aria-label="Search people"
          placeholder={title}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onSearchKeyDown}
        />
        <Kbd aria-hidden>↑↓</Kbd>
      </div>

      <div className="assign-card__list" role="listbox" id={listId} aria-label="People">
        {!trimmed ? (
          <>
            {bestMatch && (
              <>
                <p className="assign-card__section">Best match</p>
                {personRow(bestMatch, 0, bestMatch.score)}
              </>
            )}
            {frequent.length > 0 && (
              <>
                <p className="assign-card__section">Frequent</p>
                {frequent.map((person, index) => personRow(person, index + (bestMatch ? 1 : 0)))}
              </>
            )}
          </>
        ) : (
          <>
            {matches.map((person, index) => personRow(person, index))}
            {matches.length === 0 && (
              <p className="assign-card__empty">
                {exactTag && !reusableTag
                  ? 'That name is already a tag, not a person'
                  : `No one named “${trimmed}” yet`}
              </p>
            )}
            {(canCreate || reusableTag) && (
              <button
                id={optionId(matches.length)}
                type="button"
                role="option"
                aria-selected={activeIndex === matches.length}
                className={
                  'assign-card__row assign-card__row--create' +
                  (activeIndex === matches.length ? ' is-active' : '')
                }
                disabled={busy}
                onMouseEnter={() => setActiveIndex(matches.length)}
                onClick={createPerson}
              >
                <IconPlus size={16} aria-hidden />
                <span className="assign-card__row-name">
                  {reusableTag ? `Use “${reusableTag.name}”` : `New person “${personName}”`}
                </span>
                {activeIndex === matches.length && <Kbd aria-hidden>↵</Kbd>}
              </button>
            )}
          </>
        )}
      </div>

      <div className="assign-card__actions">
        {onSetProfilePhoto && (
          <button
            type="button"
            className="assign-card__action"
            disabled={busy}
            onClick={() =>
              withClose(async () => {
                try {
                  await onSetProfilePhoto();
                } catch (error) {
                  toast.error(String(error));
                  throw error;
                }
              })
            }
          >
            <IconCamera size={16} aria-hidden />
            Use as profile photo
          </button>
        )}
        {!trimmed && (
          <button
            type="button"
            className="assign-card__action"
            disabled={busy}
            onClick={() => inputRef.current?.focus()}
          >
            <IconPlus size={16} aria-hidden />
            New person…
            <span className="assign-card__action-hint text-xs font-normal text-muted-foreground">
              type a name
            </span>
          </button>
        )}
        {onHide && (
          <button
            type="button"
            className="assign-card__action"
            disabled={busy}
            onClick={() => withClose(onHide)}
          >
            <IconEyeOff size={16} aria-hidden />
            {plural ? 'Hide faces' : 'Hide face'}
            <Kbd aria-hidden>H</Kbd>
          </button>
        )}
        {onRestore && (
          <button
            type="button"
            className="assign-card__action"
            disabled={busy}
            onClick={() => withClose(onRestore)}
          >
            <IconRestore size={16} aria-hidden />
            Restore
          </button>
        )}
        {onDiscard && (
          <button
            type="button"
            className="assign-card__action assign-card__action--danger"
            disabled={busy}
            onClick={() => withClose(onDiscard)}
          >
            <IconTrash size={16} aria-hidden />
            {plural ? 'Not faces' : 'Not a face'}
            <Kbd aria-hidden>Del</Kbd>
          </button>
        )}
      </div>
    </div>
  );
}

/** The photo with the face boxed, its file name and date. */
function AssignCardPhoto({ region, onOpenPhoto }: { region: PersonRegion; onOpenPhoto?: () => void }) {
  const { data: asset } = useLiveQuery(() => AssetsService.getByUUID(region.assetId), ['assets'], {
    extDependencies: [region.assetId],
  });
  const date = asset && !Number.isNaN(asset.metadata.date.getTime()) ? asset.metadata.date : null;

  return (
    <div className="assign-card__photo">
      <FaceContextPreview region={region} bandHeight={PHOTO_BAND_HEIGHT} />
      <div className="assign-card__photo-meta">
        <span className="assign-card__photo-name">
          {asset &&
            (date ? `${asset.filename} · ${formatDate(date, { dateStyle: 'medium' })}` : asset.filename)}
        </span>
        {onOpenPhoto && (
          <button type="button" className="assign-card__open" onClick={onOpenPhoto}>
            Open photo
            <IconChevronRight size={14} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
