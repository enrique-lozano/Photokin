import type { PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { PersonEditDialog } from './PersonEditDialog';

vi.mock('@/db/api/services/tags.service', () => ({ TagsService: {} }));
vi.mock('../tags/TagWriteBackNote', () => ({ TagWriteBackNote: () => null }));
vi.mock('@/components/ui/dialog', () => {
  const Wrapper = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    Dialog: Wrapper,
    DialogBody: Wrapper,
    DialogContent: Wrapper,
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  };
});

it('keeps the person biography editor without relationship controls', () => {
  const markup = renderToStaticMarkup(
    <PersonEditDialog
      open
      onOpenChange={vi.fn()}
      person={{
        id: 'person',
        name: 'Alex',
        sex: null,
        dateBirth: null,
        dateDead: null,
        description: null,
      }}
    />,
  );

  for (const label of ['Name', 'Sex', 'Born', 'Died', 'Age', 'Brief description']) {
    expect(markup).toContain(label);
  }
  expect(markup).not.toContain('>Color<');
  expect(markup).toContain('Update this person’s details.');
  expect(markup).not.toMatch(/relationship|Select person|placeholder="Relation"/i);
});
