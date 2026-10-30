import { PointerEvent as ReactPointerEvent, ReactNode, useEffect, useRef, useState } from 'react';

import { useLocation } from 'react-router-dom';
import { useAppStore } from '../../stores/appState';
import { sidebarSectionKey, useScrollSidebarSelection } from './useScrollSidebarSelection';
import './secondaryNavbar.css';

interface SecondaryNavbarProps {
  title: string;
  children: ReactNode;
  /**
   * Extra signal that the sidebar list/tree has finished rendering (e.g. tag
   * count). Triggers another scroll attempt when async content lands.
   */
  scrollWatch?: string | number | null;
  /** When set, scroll this tree row by id before falling back to `.selected`. */
  scrollToItemId?: string | null;
}

export function SecondaryNavbar({ title, children, scrollWatch, scrollToItemId }: SecondaryNavbarProps) {
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const { pathname } = useLocation();
  const sectionKey = sidebarSectionKey(pathname);
  useScrollSidebarSelection(sidebarRef, sectionKey, scrollWatch, scrollToItemId);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const defaultWidthRef = useRef<number>(364);
  const [isDragging, setIsDragging] = useState(false);
  const { secondaryNavbarWidth, setSecondaryNavbarWidth } = useAppStore((state) => ({
    secondaryNavbarWidth: state.secondaryNavbarWidth,
    setSecondaryNavbarWidth: state.setSecondaryNavbarWidth,
  }));

  useEffect(() => {
    const sidebarEl = sidebarRef.current;
    if (!sidebarEl) return;

    const declaredWidth = Number.parseFloat(getComputedStyle(sidebarEl).getPropertyValue('--submenu-width'));
    const initialWidth = Number.isFinite(declaredWidth)
      ? declaredWidth
      : Math.round(sidebarEl.getBoundingClientRect().width);

    defaultWidthRef.current = initialWidth;
    if (secondaryNavbarWidth === null) {
      setSecondaryNavbarWidth(initialWidth);
    }
  }, [secondaryNavbarWidth, setSecondaryNavbarWidth]);

  useEffect(() => {
    if (!secondaryNavbarWidth) return;
    document.documentElement.style.setProperty('--page-sidebar-current-width', `${secondaryNavbarWidth}px`);
  }, [secondaryNavbarWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const deltaX = event.clientX - dragState.startX;
      const nextWidth = Math.min(560, Math.max(260, Math.round(dragState.startWidth + deltaX)));
      setSecondaryNavbarWidth(nextWidth);
    };

    const handlePointerEnd = () => {
      dragStateRef.current = null;
      setIsDragging(false);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [isDragging, setSecondaryNavbarWidth]);

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (secondaryNavbarWidth === null) return;
    event.preventDefault();
    dragStateRef.current = { startX: event.clientX, startWidth: secondaryNavbarWidth };
    setIsDragging(true);
    document.body.style.setProperty('cursor', 'ew-resize');
    document.body.style.setProperty('user-select', 'none');
  };

  const onHandleDoubleClick = () => {
    setSecondaryNavbarWidth(defaultWidthRef.current);
  };

  return (
    <div className={`page-sidebar ${isDragging ? 'page-sidebar--resizing' : ''}`} ref={sidebarRef}>
      <div className="page-sidebar-main-rounded-container" aria-label={title}>
        <div className="page-sidebar-body">{children}</div>
      </div>

      <button
        type="button"
        className="page-sidebar-resize-handle"
        onPointerDown={onHandlePointerDown}
        onDoubleClick={onHandleDoubleClick}
        aria-label="Resize sidebar"
      />
    </div>
  );
}
