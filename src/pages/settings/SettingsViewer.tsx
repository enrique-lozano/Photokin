import {
  SettingsButtonRow,
  SettingsGroup,
  SettingsPageHeader,
  SettingsSegmentedRow,
  SettingsToggleRow,
} from '@/components/settings/SettingsRow';
import { useSettingsStore, ViewerMouseWheel } from '@/stores/settingsStore';
import { chooseExternalApp, externalAppName, type ExternalAppKind } from '@/system/externalApp';
import { IconInfoCircle, IconPhoto, IconPlayerPlay, IconPointer, IconRepeat } from '@tabler/icons-react';
import { emit } from '@tauri-apps/api/event';

function setApp(kind: ExternalAppKind, path: string) {
  const store = useSettingsStore.getState();
  if (kind === 'image') store.setExternalImageAppPath(path);
  else store.setExternalVideoAppPath(path);
  void emit('settings-externalApp-changed', { kind, path });
}

async function pickApp(kind: ExternalAppKind) {
  const path = await chooseExternalApp();
  if (path) setApp(kind, path);
}

const MOUSE_WHEEL_OPTIONS: { value: ViewerMouseWheel; label: string }[] = [
  { value: 'navigate', label: 'Next photo' },
  { value: 'zoom', label: 'Zoom' },
];
export function SettingsViewer() {
  const externalImageAppPath = useSettingsStore((state) => state.externalImageAppPath);
  const externalVideoAppPath = useSettingsStore((state) => state.externalVideoAppPath);
  const autoPlayVideo = useSettingsStore((state) => state.autoPlayVideo);
  const loopVideo = useSettingsStore((state) => state.loopVideo);
  const viewerMouseWheel = useSettingsStore((state) => state.viewerMouseWheel);
  const showPhotoDescription = useSettingsStore((state) => state.showPhotoDescription);

  return (
    <>
      <SettingsPageHeader title="Viewer" />

      <SettingsGroup title="Photo information">
        <SettingsToggleRow
          icon={<IconInfoCircle size={18} />}
          label="Show photo description"
          description="Shows the description in the info panel. Hiding it keeps saved descriptions."
          checked={showPhotoDescription}
          onCheckedChange={(value) => {
            useSettingsStore.getState().setShowPhotoDescription(value);
            void emit('settings-showPhotoDescription-changed', value);
          }}
        />
      </SettingsGroup>

      <SettingsGroup title="Video">
        <SettingsToggleRow
          icon={<IconPlayerPlay size={18} />}
          label="Auto play"
          description="Start videos as soon as they open."
          checked={autoPlayVideo}
          onCheckedChange={(value) => {
            useSettingsStore.getState().setAutoPlayVideo(value);
            void emit('settings-autoPlayVideo-changed', value);
          }}
        />
        <SettingsToggleRow
          icon={<IconRepeat size={18} />}
          label="Loop"
          description="Replay videos from the start when they end."
          checked={loopVideo}
          onCheckedChange={(value) => {
            useSettingsStore.getState().setLoopVideo(value);
            void emit('settings-loopVideo-changed', value);
          }}
        />
      </SettingsGroup>

      <SettingsGroup title="Open in another app">
        <SettingsButtonRow
          icon={<IconPhoto size={18} />}
          label="Photos"
          description={
            externalImageAppPath
              ? `Opens in ${externalAppName(externalImageAppPath)}.`
              : 'Uses your computer’s default photo app.'
          }
          buttonLabel={externalImageAppPath ? 'Change' : 'Choose app'}
          onAction={() => void pickApp('image')}
          clearLabel="Use default"
          onClear={externalImageAppPath ? () => setApp('image', '') : undefined}
        />
        <SettingsButtonRow
          icon={<IconPlayerPlay size={18} />}
          label="Videos"
          description={
            externalVideoAppPath
              ? `Opens in ${externalAppName(externalVideoAppPath)}.`
              : 'Uses your computer’s default video player.'
          }
          buttonLabel={externalVideoAppPath ? 'Change' : 'Choose app'}
          onAction={() => void pickApp('video')}
          clearLabel="Use default"
          onClear={externalVideoAppPath ? () => setApp('video', '') : undefined}
        />
      </SettingsGroup>

      <SettingsGroup title="Navigation">
        <SettingsSegmentedRow
          icon={<IconPointer size={18} />}
          label="Mouse wheel"
          description={
            viewerMouseWheel === 'navigate'
              ? 'What scrolling does when viewing a photo. Hold Ctrl while scrolling to zoom.'
              : 'What scrolling does when viewing a photo. Use the arrow keys to change photo.'
          }
          value={viewerMouseWheel}
          options={MOUSE_WHEEL_OPTIONS}
          onValueChange={(value) => {
            useSettingsStore.getState().setViewerMouseWheel(value);
            void emit('settings-viewerMouseWheel-changed', value);
          }}
        />
      </SettingsGroup>
    </>
  );
}
