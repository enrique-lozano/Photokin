import { describe, expect, it } from 'vitest';
import { sidebarSectionKey } from './useScrollSidebarSelection';

describe('sidebarSectionKey', () => {
  it('groups detail routes under their top-level section', () => {
    expect(sidebarSectionKey('/tags/view/abc')).toBe('/tags');
    expect(sidebarSectionKey('/people/view/abc')).toBe('/people');
    expect(sidebarSectionKey('/albums')).toBe('/albums');
    expect(sidebarSectionKey('/places')).toBe('/places');
  });
});
