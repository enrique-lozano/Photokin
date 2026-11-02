import { SearchQuery } from '@/common/fileSearchFilters';
import { AssetsService } from '@/db/api/services/assets.service';
import { useLiveQuery } from '@/db/connection/useLiveQuery';

export function useStatsQueries(searchQuery: SearchQuery, placeGroup: 'city' | 'country') {
  const options = { extDependencies: [searchQuery] };
  const overview = useLiveQuery(() => AssetsService.getStatsOverview({ searchQuery }), ['assets'], options);
  const activity = useLiveQuery(
    () => AssetsService.getFileCountByMonth({ searchQuery }),
    ['assets'],
    options,
  );
  const weekdays = useLiveQuery(
    () => AssetsService.getFileCountByDatePart({ searchQuery, part: 'weekday' }),
    ['assets'],
    options,
  );
  const places = useLiveQuery(
    () => AssetsService.getTopPlacesInScope({ searchQuery, limit: 6, groupBy: placeGroup }),
    ['assets'],
    { extDependencies: [searchQuery, placeGroup] },
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
      const [whiteBalances, flashValues, exposurePrograms, meteringModes] = await Promise.all([
        AssetsService.getTopWhiteBalances({ searchQuery }),
        AssetsService.getTopFlashValues({ searchQuery }),
        AssetsService.getTopExposurePrograms({ searchQuery }),
        AssetsService.getTopMeteringModes({ searchQuery }),
      ]);
      return { whiteBalances, flashValues, exposurePrograms, meteringModes };
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

  return { overview, activity, weekdays, places, gear, captureSettings, exposure, ratings };
}
