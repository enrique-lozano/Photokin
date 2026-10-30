import { toast, toastOnError } from '@/components/ui/toast';
import { TagsService } from '@/db/api/services/tags.service';

export async function changeProfilePhoto(personId: string, regionId: string | null): Promise<void> {
  const previous = (await TagsService.getByUUID(personId)).profileRegionId;
  await TagsService.setProfileRegion(personId, regionId);
  toast.success(regionId ? 'Profile photo updated' : 'Using automatic profile photo', {
    action: {
      label: 'Undo',
      onClick: () =>
        void toastOnError(
          (async () => {
            const current = await TagsService.getByUUID(personId);
            if (current.profileRegionId !== regionId) {
              throw new Error('The profile photo was changed again after this update.');
            }
            await TagsService.setProfileRegion(personId, previous);
          })(),
        ),
    },
  });
}
