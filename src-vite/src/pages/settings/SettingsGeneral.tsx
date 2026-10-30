import { emit } from '@tauri-apps/api/event';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  IconCalendar,
  IconEyeOff,
  IconHash,
  IconLayoutGrid,
  IconMapPin,
  IconMoon,
  IconTextSize,
  IconTypography,
  IconUsers,
} from '@tabler/icons-react';
import { useEffect } from 'react';
import {
  SettingsGroup,
  SettingsPageHeader,
  SettingsRadioGroup,
  SettingsSegmentedRow,
  SettingsSelectRow,
  SettingsToggleRow,
} from '@/components/settings/SettingsRow';
import { RatingMode } from '@/common/ratingModeOptions';
import { TimelineGroupBy, useSettingsStore } from '../../stores/settingsStore';
import {
  APPEARANCE_OPTIONS,
  Appearance,
  FONT_LABELS,
  SCALE_LABELS,
  SCALE_VALUES,
  THEME_LABELS,
  applyAllSettings,
  normalizeScale,
} from '../../utils/theme';
import { SETTINGS_BASE_HEIGHT, SETTINGS_BASE_WIDTH } from '../../utils/openSettingsWindow';

export function SettingsGeneral() {
  const appearance = useSettingsStore((state) => state.appearance);
  const lightTheme = useSettingsStore((state) => state.lightTheme);
  const darkTheme = useSettingsStore((state) => state.darkTheme);
  const scale = useSettingsStore((state) => state.scale);
  const font = useSettingsStore((state) => state.font);
  const showTimelineGroupCount = useSettingsStore((state) => state.showTimelineGroupCount);
  const showTimelineGroupLocation = useSettingsStore((state) => state.showTimelineGroupLocation);
  const timelineGroupBy = useSettingsStore((state) => state.timelineGroupBy);
  const ratingMode = useSettingsStore((state) => state.ratingMode);
  const countUnverifiedFaces = useSettingsStore((state) => state.countUnverifiedFaces);
  const showHiddenItemsAtStartup = useSettingsStore((state) => state.showHiddenItemsAtStartup);

  const currentTheme = appearance === Appearance.Light ? lightTheme : darkTheme;
  const appearanceOptions = APPEARANCE_OPTIONS.map(({ label, value }) => ({
    label,
    value: String(value),
  }));
  const themeOptions = THEME_LABELS.map((label, index) => ({ label, value: String(index) }));
  const fontOptions = FONT_LABELS.map((label, index) => ({ label, value: String(index) }));
  const scaleOptions = SCALE_VALUES.map((scaleValue, index) => ({
    label: SCALE_LABELS[index],
    value: String(scaleValue),
  }));
  const timelineGroupOptions: { label: string; value: TimelineGroupBy }[] = [
    { label: 'Day', value: 'day' },
    { label: 'Month', value: 'month' },
    { label: 'Year', value: 'year' },
  ];

  useEffect(() => {
    applyAllSettings({ appearance, lightTheme, darkTheme, scale, font });
  }, [appearance, lightTheme, darkTheme, scale, font]);

  useEffect(() => {
    void emit('settings-font-changed', font);
  }, [font]);

  useEffect(() => {
    void emit('settings-appearance-changed', appearance);
  }, [appearance]);

  useEffect(() => {
    void emit('settings-scale-changed', scale);
  }, [scale]);

  useEffect(() => {
    void emit('settings-lightTheme-changed', lightTheme);
  }, [lightTheme]);

  useEffect(() => {
    void emit('settings-darkTheme-changed', darkTheme);
  }, [darkTheme]);

  function handleThemeChange(themeIndex: number) {
    // Keep a single theme identity across light/dark modes.
    useSettingsStore.getState().setLightTheme(themeIndex);
    useSettingsStore.getState().setDarkTheme(themeIndex);
  }

  async function handleScaleChange(newScale: number) {
    useSettingsStore.getState().setScale(newScale);

    try {
      const appWindow = getCurrentWindow();
      const windowScale = normalizeScale(newScale);
      const minSize = new LogicalSize(
        Math.round(SETTINGS_BASE_WIDTH * windowScale),
        Math.round(SETTINGS_BASE_HEIGHT * windowScale),
      );
      await appWindow.setMinSize(minSize);

      const factor = await appWindow.scaleFactor();
      const physical = await appWindow.innerSize();
      const logicalWidth = physical.width / factor;
      const logicalHeight = physical.height / factor;

      if (logicalWidth < minSize.width || logicalHeight < minSize.height) {
        await appWindow.setSize(
          new LogicalSize(Math.max(logicalWidth, minSize.width), Math.max(logicalHeight, minSize.height)),
        );
      }
    } catch (error) {
      console.error('Failed to update window min size on scale change', error);
    }
  }

  function handleShowTimelineGroupCountChange(value: boolean) {
    useSettingsStore.getState().setShowTimelineGroupCount(value);
    // Broadcast to the main window, where the timeline is rendered.
    void emit('settings-showTimelineGroupCount-changed', value);
  }

  function handleShowTimelineGroupLocationChange(value: boolean) {
    useSettingsStore.getState().setShowTimelineGroupLocation(value);
    void emit('settings-showTimelineGroupLocation-changed', value);
  }

  function handleTimelineGroupByChange(value: TimelineGroupBy) {
    useSettingsStore.getState().setTimelineGroupBy(value);
    void emit('settings-timelineGroupBy-changed', value);
  }

  function handleRatingModeChange(value: RatingMode) {
    useSettingsStore.getState().setRatingMode(value);
    void emit('settings-ratingMode-changed', value);
  }

  return (
    <>
      <SettingsPageHeader title="General" />

      <SettingsGroup title="Appearance">
        <SettingsSegmentedRow
          icon={<IconMoon size={18} />}
          label="Color mode"
          value={String(appearance)}
          options={appearanceOptions}
          onValueChange={(value) => useSettingsStore.getState().setAppearance(Number(value) as Appearance)}
        />

        <SettingsSelectRow
          icon={<IconLayoutGrid size={18} />}
          label="Theme"
          value={String(currentTheme)}
          options={themeOptions}
          onValueChange={(value) => handleThemeChange(Number(value))}
        />

        <SettingsSelectRow
          icon={<IconTextSize size={18} />}
          label="Font size"
          value={String(scale)}
          options={scaleOptions}
          onValueChange={(value) => void handleScaleChange(Number(value))}
        />

        <SettingsSelectRow
          icon={<IconTypography size={18} />}
          label="Font"
          value={String(font)}
          options={fontOptions}
          onValueChange={(value) => useSettingsStore.getState().setFont(Number(value))}
        />
      </SettingsGroup>

      <SettingsGroup title="People and hidden items">
        <SettingsToggleRow
          icon={<IconEyeOff size={18} />}
          label="Show hidden items on start"
          description="Includes hidden people, ignored faces and hidden albums."
          checked={showHiddenItemsAtStartup}
          onCheckedChange={(value) => {
            useSettingsStore.getState().setShowHiddenItemsAtStartup(value);
            void emit('settings-showHiddenItemsAtStartup-changed', value);
          }}
        />
        <SettingsToggleRow
          icon={<IconUsers size={18} />}
          label="Count unverified faces in people filters"
          description="Pending detections count toward Alone, Group photo and No people."
          checked={countUnverifiedFaces}
          onCheckedChange={(value) => {
            useSettingsStore.getState().setCountUnverifiedFaces(value);
            void emit('settings-countUnverifiedFaces-changed', value);
          }}
        />
      </SettingsGroup>

      <SettingsGroup title="Timeline">
        <SettingsSegmentedRow
          icon={<IconCalendar size={18} />}
          label="Group photos by"
          value={timelineGroupBy}
          options={timelineGroupOptions}
          onValueChange={handleTimelineGroupByChange}
        />

        <SettingsToggleRow
          icon={<IconHash size={18} />}
          label="Show photo count per group"
          checked={showTimelineGroupCount}
          onCheckedChange={handleShowTimelineGroupCountChange}
        />

        <SettingsToggleRow
          icon={<IconMapPin size={18} />}
          label="Show location per group"
          checked={showTimelineGroupLocation}
          onCheckedChange={handleShowTimelineGroupLocationChange}
        />
      </SettingsGroup>

      <SettingsGroup title="Ratings">
        <SettingsRadioGroup
          label="Ratings"
          value={ratingMode}
          options={[
            {
              value: RatingMode.Favorites,
              label: 'Favorites',
              badge: 'Recommended',
              description: 'Mark the photos you love with a single heart.',
            },
            {
              value: RatingMode.Stars,
              label: '1–5 stars',
              description: 'Rate photos from 1 to 5 stars for detailed ranking and sorting.',
            },
          ]}
          onValueChange={(value) => handleRatingModeChange(value as RatingMode)}
        />
      </SettingsGroup>
    </>
  );
}
