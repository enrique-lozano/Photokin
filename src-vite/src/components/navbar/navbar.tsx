import {
  IconCalendarMonth,
  IconCalendarMonthFilled,
  IconChartBar,
  IconCopy,
  IconCopyFilled,
  IconFolderBolt,
  IconFolderFilled,
  IconMapPin,
  IconMapPinFilled,
  IconMoodNerd,
  IconSettings,
  IconTag,
  IconTagFilled,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { Link, Path, useLocation } from 'react-router-dom';
import { PhotokinMark } from '../brand/PhotokinMark';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { AppRoutes } from '../../router';
import { SettingsTab, useSettingsStore } from '../../stores/settingsStore';
import { MAIN_PAGES, type MainPageId } from '@/common/navigationPages';
import { openSettingsWindow } from '../../utils/openSettingsWindow';
import './navbar.css';

import type { JSX } from 'react';

interface NavBarEl {
  label: string;
  icon: JSX.Element;
  selectedIcon: JSX.Element;
  path: string | Partial<Path>;
}

const MENU_ICON_SIZE = 22;

function isNavItemActive(pathname: string, path: NavBarEl['path']): boolean {
  const target = typeof path === 'string' ? path : (path.pathname ?? '');
  if (!target) return false;
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function Navbar() {
  const navigationPages = useSettingsStore((state) => state.navigationPages);
  const navElements: Record<MainPageId, Omit<NavBarEl, 'label'>> = {
    albums: {
      icon: <IconFolderBolt size={MENU_ICON_SIZE} />,
      selectedIcon: <IconFolderFilled size={MENU_ICON_SIZE} />,
      path: AppRoutes.albums,
    },
    tags: {
      icon: <IconTag size={MENU_ICON_SIZE} />,
      selectedIcon: <IconTagFilled size={MENU_ICON_SIZE} />,
      path: AppRoutes.tags,
    },
    people: {
      icon: <IconMoodNerd size={MENU_ICON_SIZE} />,
      selectedIcon: <IconMoodNerd size={MENU_ICON_SIZE} className="navbar-icon--filled-face" />,
      path: AppRoutes.people,
    },
    places: {
      icon: <IconMapPin size={MENU_ICON_SIZE} />,
      selectedIcon: <IconMapPinFilled size={MENU_ICON_SIZE} />,
      path: AppRoutes.places,
    },
    calendar: {
      icon: <IconCalendarMonth size={MENU_ICON_SIZE} />,
      selectedIcon: <IconCalendarMonthFilled size={MENU_ICON_SIZE} />,
      path: AppRoutes.calendar,
    },
    stats: {
      icon: <IconChartBar size={MENU_ICON_SIZE} />,
      selectedIcon: <IconChartBar size={MENU_ICON_SIZE} fill="currentColor" />,
      path: AppRoutes.stats,
    },
    duplicates: {
      icon: <IconCopy size={MENU_ICON_SIZE} />,
      selectedIcon: <IconCopyFilled size={MENU_ICON_SIZE} />,
      path: AppRoutes.duplicates,
    },
  };
  const visibleElements: NavBarEl[] = navigationPages
    .filter(({ visible }) => visible)
    .map(({ id }) => ({
      ...navElements[id],
      label: MAIN_PAGES.find((page) => page.id === id)!.label,
    }));

  const { pathname } = useLocation();

  return (
    <aside className="navbar">
      <div className="navbar-logo" aria-label="Photokin" data-tauri-drag-region>
        <PhotokinMark size={24} />
      </div>

      <nav className="page-selector">
        <ul className="menu">
          {visibleElements.map((navItem) => (
            <li key={navItem.label}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to={navItem.path}
                    aria-current={isNavItemActive(pathname, navItem.path) ? 'page' : undefined}
                    className={clsx('navbar-link', isNavItemActive(pathname, navItem.path) && 'selected')}
                  >
                    <span className="navbar-link__icon" aria-hidden="true">
                      <span className="navbar-link__icon-outline">{navItem.icon}</span>
                      <span className="navbar-link__icon-filled">{navItem.selectedIcon}</span>
                    </span>
                    <span className="navbar-link__label">{navItem.label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{navItem.label}</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      </nav>

      <div className="navbar-settings">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="navbar-link"
              aria-label="Open settings"
              onClick={() => void openSettingsWindow(SettingsTab.About)}
            >
              <span className="navbar-link__icon">
                <IconSettings size={MENU_ICON_SIZE} />
              </span>
              <span className="navbar-link__label">Settings</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
