import {
  SettingsButtonRow,
  SettingsGroup,
  SettingsIconButton,
  SettingsPageHeader,
  SettingsRow,
} from '@/components/settings/SettingsRow';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { DEFAULT_NAVIGATION_PAGES, MAIN_PAGES, type NavigationPage } from '@/common/navigationPages';
import { useSettingsStore } from '@/stores/settingsStore';
import { IconArrowDown, IconArrowUp, IconRestore } from '@tabler/icons-react';
import { isTauri } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

export function SettingsNavigation() {
  const pages = useSettingsStore((state) => state.navigationPages);
  const visibleCount = pages.filter(({ visible }) => visible).length;

  async function savePages(next: NavigationPage[]) {
    useSettingsStore.getState().setNavigationPages(next);
    if (!isTauri()) return;
    try {
      await emit('settings-navigationPages-changed', useSettingsStore.getState().navigationPages);
    } catch (error) {
      console.error('Failed to sync navigation settings', error);
      toast.error(
        'Navigation was saved, but the main window could not be updated. Reopen it to apply changes.',
      );
    }
  }

  function movePage(index: number, direction: -1 | 1) {
    const next = [...pages];
    const target = index + direction;
    [next[index], next[target]] = [next[target], next[index]];
    void savePages(next);
  }

  return (
    <>
      <SettingsPageHeader
        title="Navigation"
        description="Choose which pages appear in the sidebar and their order. Photokin opens the first visible page on start."
      />
      <SettingsGroup
        title="Main pages"
        description="Hidden pages remain accessible through links. Keep at least one page visible."
      >
        {pages.map((page, index) => {
          const label = MAIN_PAGES.find(({ id }) => id === page.id)!.label;
          const isLastVisible = page.visible && visibleCount === 1;
          return (
            <SettingsRow
              key={page.id}
              label={label}
              description={isLastVisible ? 'At least one page must stay visible.' : undefined}
            >
              <div className="flex items-center gap-2">
                <SettingsIconButton
                  label={`Move ${label} up`}
                  disabled={index === 0}
                  onClick={() => movePage(index, -1)}
                >
                  <IconArrowUp size={16} />
                </SettingsIconButton>
                <SettingsIconButton
                  label={`Move ${label} down`}
                  disabled={index === pages.length - 1}
                  onClick={() => movePage(index, 1)}
                >
                  <IconArrowDown size={16} />
                </SettingsIconButton>
                <Switch
                  aria-label={`Show ${label} in sidebar`}
                  checked={page.visible}
                  disabled={isLastVisible}
                  onCheckedChange={(visible) =>
                    void savePages(
                      pages.map((entry) => (entry.id === page.id ? { ...entry, visible } : entry)),
                    )
                  }
                />
              </div>
            </SettingsRow>
          );
        })}
      </SettingsGroup>
      <SettingsGroup>
        <SettingsButtonRow
          icon={<IconRestore size={18} />}
          label="Restore default navigation"
          description="Show all pages in their original order."
          buttonLabel="Restore defaults"
          onAction={() => void savePages(DEFAULT_NAVIGATION_PAGES)}
        />
      </SettingsGroup>
    </>
  );
}
