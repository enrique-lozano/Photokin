import { Navigate } from 'react-router-dom';
import { AppRoutes } from '@/router';
import { useSettingsStore } from '@/stores/settingsStore';

export function HomeRedirect() {
  const pages = useSettingsStore((state) => state.navigationPages);
  const firstPage = pages.find(({ visible }) => visible)!;
  return <Navigate to={AppRoutes[firstPage.id]} replace />;
}
