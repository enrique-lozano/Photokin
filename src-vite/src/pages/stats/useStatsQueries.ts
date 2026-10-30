import { SearchQuery } from '@/common/fileSearchFilters';
import { AssetsService } from '@/db/api/services/assets.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';

export function useStatsQueries(searchQuery: SearchQuery) {
  const options = { extDependencies: [searchQuery] };
  const overview = useLiveQuery(() => AssetsService.getStatsOverview({ searchQuery }), ['assets'], options);
  const activity = useLiveQuery(
    () => AssetsService.getFileCountByMonth({ searchQuery }),
    ['assets'],
    options,
  );
  const gear = useLiveQuery(
    async () => {
      const [cameras, lenses] = await Promise.all([
        AssetsService.getTopCameraBodies({ searchQuery }),
        AssetsService.getTopLenses({ searchQuery }),
      ]);
      return { cameras, lenses };
    },
    ['assets'],
    options,
  );
  const captureSettings = useLiveQuery(
    async () => {
      const [whiteBalances, flashValues] = await Promise.all([
        AssetsService.getTopWhiteBalances({ searchQuery }),
        AssetsService.getTopFlashValues({ searchQuery }),
      ]);
      return { whiteBalances, flashValues };
    },
    ['assets'],
    options,
  );
  const exposure = useLiveQuery(
    async () => {
      const [
        iso,
        isoDistribution,
        focalLengths,
        focalLengthDistribution,
        apertures,
        apertureDistribution,
        shutterSpeeds,
        shutterSpeedDistribution,
      ] = await Promise.all([
        AssetsService.getTopIso({ searchQuery }),
        AssetsService.getIsoDistribution({ searchQuery }),
        AssetsService.getTopFocalLengths({ searchQuery }),
        AssetsService.getFocalLengthDistribution({ searchQuery }),
        AssetsService.getTopApertures({ searchQuery }),
        AssetsService.getApertureDistribution({ searchQuery }),
        AssetsService.getTopShutterSpeeds({ searchQuery }),
        AssetsService.getShutterSpeedDistribution({ searchQuery }),
      ]);
      return {
        iso,
        isoDistribution,
        focalLengths,
        focalLengthDistribution,
        apertures,
        apertureDistribution,
        shutterSpeeds,
        shutterSpeedDistribution,
      };
    },
    ['assets'],
    options,
  );
  const ratings = useLiveQuery(
    () => AssetsService.getRatingDistribution({ searchQuery }),
    ['assets'],
    options,
  );

  return { overview, activity, gear, captureSettings, exposure, ratings };
}
