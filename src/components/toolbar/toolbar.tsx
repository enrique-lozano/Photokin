import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';

import { AppRoutes } from '@/router';
import { useWindowControls } from '@/system/useWindowControls';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GlobalFilterButton } from '../app-shell/GlobalFilterButton';
import { WindowControls } from '../app-shell/WindowControls';
import { Button } from '../ui/button';
import { SearchBar } from './search-bar/SearchBar';
import './toolbar.css';

const canGoBack = () => window.history.state.idx !== 0;
const canGoForward = () => window.history.state.idx < window.history.length - 1;

export function Toolbar() {
  const [searchInputValue, setSearchInputValue] = useState('');

  const navigate = useNavigate();
  const [urlSearchParams] = useSearchParams();
  const { startDragging, handleDragRegionDoubleClick } = useWindowControls();

  // Keep the input in sync with the URL so the active query is visible when
  // landing on / navigating within the search page.
  const urlQuery = urlSearchParams.get('q') ?? '';
  useEffect(() => {
    setSearchInputValue(urlQuery);
  }, [urlQuery]);

  function handleQuerySubmit(submittedQuery?: string) {
    const nextQuery = submittedQuery ?? searchInputValue;
    const params = new URLSearchParams({
      q: nextQuery,
    });

    navigate({
      pathname: AppRoutes.search,
      search: params.toString(),
    });
  }

  return (
    <>
      <header className="toolbar-header h-(--toolbar-height)">
        <div className="toolbar-content-row" data-tauri-drag-region>
          {/* Search is the bar's one centred element; history rides on its left
              edge (as in Slack / VS Code) so it never pushes the field off centre.
              Where you are lives in each page's hero, not up here. */}
          <div className="toolbar-center-cluster" onMouseDown={(event) => event.stopPropagation()}>
            <div className="toolbar-history">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="toolbar-history-button text-main-navbar-foreground"
                aria-label="Go back"
                title="Back"
                disabled={!canGoBack()}
                onClick={() => navigate(-1)}
              >
                <IconArrowLeft size={18} />
              </Button>

              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="toolbar-history-button text-main-navbar-foreground"
                aria-label="Go forward"
                title="Forward"
                disabled={!canGoForward()}
                onClick={() => navigate(1)}
              >
                <IconArrowRight size={18} />
              </Button>
            </div>

            <div className="toolbar-search-slot">
              <SearchBar
                queryFromUrl={searchInputValue}
                onSubmit={handleQuerySubmit}
                trailing={<GlobalFilterButton />}
              />
            </div>
          </div>

          {/* The search cluster is absolutely centred, so this spans the whole bar. */}
          <div
            className="toolbar-drag-region"
            data-tauri-drag-region
            onMouseDown={startDragging}
            onDoubleClick={handleDragRegionDoubleClick}
          />

          <WindowControls />
        </div>
      </header>
    </>
  );
}
