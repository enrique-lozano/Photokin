import type { PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PersonRegion } from '@/db/models/PersonInfo';
import { FaceStatus } from '@/db/models/TagRegionInfoDTO';
import { ProfilePhotoDialog } from './ProfilePhotoDialog';

vi.mock('./profilePhoto', () => ({ changeProfilePhoto: vi.fn() }));
vi.mock('@/components/face-thumbnail/FaceThumbnail', () => ({
  FaceThumbnail: () => <span className="face-thumbnail" />,
}));
vi.mock('@/components/ui/dialog', () => {
  const Wrapper = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return Object.fromEntries(
    [
      'Dialog',
      'DialogBody',
      'DialogContent',
      'DialogDescription',
      'DialogFooter',
      'DialogHeader',
      'DialogTitle',
    ].map((name) => [name, Wrapper]),
  );
});

const face = (id: string, changes: Partial<PersonRegion> = {}): PersonRegion => ({
  id,
  assetId: 'photo',
  tagId: 'person',
  confirmed: true,
  faceStatus: FaceStatus.Confirmed,
  area: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
  path: 'C:\\photos\\photo.jpg',
  ...changes,
});

function markup(regions: PersonRegion[], profileRegionId: string | null = null) {
  return renderToStaticMarkup(
    <ProfilePhotoDialog
      open
      onOpenChange={vi.fn()}
      personId="person"
      personName="Alex"
      regions={regions}
      profileRegionId={profileRegionId}
      representativeRegionId="chosen"
    />,
  );
}

describe('profile photo picker', () => {
  it('offers only this person’s confirmed available faces and identifies the current portrait', () => {
    const html = markup(
      [
        face('chosen'),
        face('another'),
        face('suggested', { confirmed: false, faceStatus: FaceStatus.Pending }),
        face('rejected', { faceStatus: FaceStatus.Rejected }),
        face('other', { tagId: 'another-person' }),
        face('missing', { path: '' }),
      ],
      'chosen',
    );
    expect(html.match(/Use face \d as profile photo/g)).toHaveLength(2);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('Choose a confirmed face for Alex');
    expect(html).toContain('not your original photos');
    expect(html).toContain('Use automatic photo');
  });

  it('explains how to unlock the picker when there are no confirmed faces', () => {
    const html = markup([]);
    expect(html).toContain('Confirm a face to choose a profile photo.');
    expect(html).not.toContain('Use face 1');
    expect(html).toMatch(/disabled=""[^>]*>.*?Use automatic photo/);
  });
});
