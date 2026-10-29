import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/ui/toast';
import { TagsService } from '@/db/api/services/tags.service';
import { TagInClient } from '@/db/models/TagDTO';
import { changeProfilePhoto } from './profilePhoto';

vi.mock('@/db/api/services/tags.service', () => ({
  TagsService: { getByUUID: vi.fn(), setProfileRegion: vi.fn() },
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  toastOnError: async (action: Promise<unknown>) => {
    try {
      await action;
    } catch (error) {
      toast.error(String(error));
    }
  },
}));

beforeEach(() => vi.resetAllMocks());

const person = (profileRegionId: string | null) =>
  TagInClient.fromDB({
    id: 'person',
    name: 'Person',
    parentId: null,
    fullPath: 'Person',
    rootId: 'person',
    depth: 0,
    profileRegionId,
  });

describe('profile photo actions', () => {
  it('saves and offers Undo that restores the previous preference', async () => {
    vi.mocked(TagsService.getByUUID).mockResolvedValueOnce(person('previous'));
    await changeProfilePhoto('person', 'chosen');
    expect(TagsService.setProfileRegion).toHaveBeenCalledWith('person', 'chosen');
    const options = vi.mocked(toast.success).mock.calls[0][1];
    expect(options?.action?.label).toBe('Undo');

    vi.mocked(TagsService.getByUUID).mockResolvedValueOnce(person('chosen'));
    options?.action?.onClick();
    await vi.waitFor(() =>
      expect(TagsService.setProfileRegion).toHaveBeenLastCalledWith('person', 'previous'),
    );
  });

  it('does not undo a newer change', async () => {
    vi.mocked(TagsService.getByUUID).mockResolvedValue(person(null));
    await changeProfilePhoto('person', 'chosen');
    const options = vi.mocked(toast.success).mock.calls[0][1];
    options?.action?.onClick();
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('changed again')),
    );
    expect(TagsService.setProfileRegion).toHaveBeenCalledTimes(1);
  });

  it('resets to automatic selection and does not announce failed writes as success', async () => {
    vi.mocked(TagsService.getByUUID).mockResolvedValue(person('previous'));
    await changeProfilePhoto('person', null);
    expect(TagsService.setProfileRegion).toHaveBeenCalledWith('person', null);
    expect(toast.success).toHaveBeenCalledWith('Using automatic profile photo', expect.anything());

    vi.mocked(TagsService.setProfileRegion).mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(changeProfilePhoto('person', 'chosen')).rejects.toThrow('Database unavailable');
    expect(toast.success).toHaveBeenCalledTimes(1);
  });
});
