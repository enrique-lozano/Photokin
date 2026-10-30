import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatesSidebar } from './DuplicatesSidebar';
import { DuplicateRelationship, type DuplicateSet } from './duplicateTypes';
import { SetListRow } from './SetListRow';
import { useDuplicatesStore } from './useDuplicatesStore';

vi.mock('./useDuplicatesStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useDuplicatesStore')>();
  return {
    ...actual,
    useDuplicatesStore: Object.assign(
      (selector: (state: ReturnType<typeof actual.useDuplicatesStore.getState>) => unknown) =>
        selector(actual.useDuplicatesStore.getState()),
      actual.useDuplicatesStore,
    ),
  };
});

vi.mock('./SetListRow', () => ({
  SetListRow: vi.fn(({ set, onSelect }: { set: DuplicateSet; onSelect: () => void }) => (
    <button onClick={onSelect}>{set.title}</button>
  )),
}));
vi.mock('./RescanControl', () => ({ RescanControl: () => null }));
vi.mock('./KeepRuleControl', () => ({ KeepRuleControl: () => null }));
vi.mock('./useDuplicateRemoval', () => ({ useDuplicateRemoval: () => vi.fn() }));
vi.mock('@/components/page-content/ImportStatus', () => ({ useImportStatus: () => null }));

const sets: DuplicateSet[] = Array.from({ length: 1758 }, (_, index) => ({
  id: `set-${index}`,
  title: `Photo ${index}`,
  relationship: DuplicateRelationship.Exact,
  members: [],
  representativeIndex: 0,
  capturedAt: null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useDuplicatesStore.setState({
    sets,
    ignoredSets: [],
    decisions: {},
    activeSetId: 'set-0',
    typeFilter: 'all',
    sort: 'recoverable',
    restoreIgnored: vi.fn(),
  });
});

describe('DuplicatesSidebar lazy set list', () => {
  it('only mounts a small window of 1,758 sets and preserves row selection', () => {
    const markup = renderToStaticMarkup(<DuplicatesSidebar />);
    const rows = vi.mocked(SetListRow).mock.calls;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(25);
    expect(markup).toContain('1758');
    expect(markup).toContain('aria-setsize="1758"');
    expect(rows[0][0].active).toBe(true);

    rows[1][0].onSelect();
    expect(useDuplicatesStore.getState().activeSetId).toBe('set-1');
  });

  it('preserves filtered empty states', () => {
    useDuplicatesStore.setState({ typeFilter: DuplicateRelationship.Burst });
    const markup = renderToStaticMarkup(<DuplicatesSidebar />);
    expect(markup).toContain('No sets of this type');
    expect(SetListRow).not.toHaveBeenCalled();
  });

  it('keeps the ignored list separate and restores a selected ignored set', () => {
    useDuplicatesStore.setState({ typeFilter: 'ignored', ignoredSets: [sets[0]] });
    const markup = renderToStaticMarkup(<DuplicatesSidebar />);
    expect(markup).not.toContain('Review &amp; remove');
    expect(SetListRow).toHaveBeenCalledTimes(1);
    expect(vi.mocked(SetListRow).mock.calls[0][0].active).toBe(false);

    vi.mocked(SetListRow).mock.calls[0][0].onSelect();
    expect(useDuplicatesStore.getState().restoreIgnored).toHaveBeenCalledWith('');
    expect(useDuplicatesStore.getState().typeFilter).toBe('all');
    expect(useDuplicatesStore.getState().activeSetId).toBe('set-0');
  });
});
