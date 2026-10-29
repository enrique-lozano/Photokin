import { Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityDetailRoute } from './EntityDetailRoute';

const mocks = vi.hoisted(() => ({ id: 'first' }));

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useParams: () => ({ id: mocks.id }),
}));

describe('entity detail route state boundary', () => {
  beforeEach(() => {
    mocks.id = 'first';
  });

  it('keys the entire detail subtree, not only its gallery', () => {
    const children = (
      <main>
        <header>Summary</header>
        <div role="dialog">Edit details</div>
        <section>Gallery</section>
      </main>
    );
    const boundary = EntityDetailRoute({ children });

    expect(boundary.type).toBe(Fragment);
    expect(boundary.key).toBe('first');
    expect(boundary.props.children).toBe(children);
  });

  it('changes the boundary identity when navigating to another entity', () => {
    mocks.id = 'first';
    const first = EntityDetailRoute({ children: <main /> });
    mocks.id = 'second';
    const second = EntityDetailRoute({ children: <main /> });

    expect(second.key).toBe('second');
    expect(second.key).not.toBe(first.key);
  });

  it('keeps the boundary identity during same-entity data refreshes', () => {
    mocks.id = 'same-person';
    const before = EntityDetailRoute({ children: <main>5 photos</main> });
    const after = EntityDetailRoute({ children: <main>7 photos</main> });

    expect(after.key).toBe(before.key);
    expect(renderToStaticMarkup(after)).toContain('7 photos');
  });

  it('adds no layout element around the detail page', () => {
    expect(
      renderToStaticMarkup(
        <EntityDetailRoute>
          <main>Selected item</main>
        </EntityDetailRoute>,
      ),
    ).toBe('<main>Selected item</main>');
  });
});
