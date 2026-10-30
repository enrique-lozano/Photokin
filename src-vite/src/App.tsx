import { useContext } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Lightbox } from './components/lightbox/Lightbox';
import { LightboxImageContext } from './context/LightboxContext';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useTrashRetention } from './hooks/useTrashRetention';
import { router } from './router';
import { ComparePhotos } from './components/compare/ComparePhotos';
import { useAppStore } from './stores/appState';

export function AppEntryPoint({ isAuxiliaryWindow }: { isAuxiliaryWindow: boolean }) {
  const { lightboxImage, lightboxOrigin, closeLightbox } = useContext(LightboxImageContext);
  const comparisonPair = useAppStore((state) => state.comparisonPair);

  useSettingsSync();
  useTrashRetention(!isAuxiliaryWindow);

  return (
    <>
      <RouterProvider router={router} />

      {!isAuxiliaryWindow && !comparisonPair && (
        <Lightbox img={lightboxImage} origin={lightboxOrigin} onClose={closeLightbox}></Lightbox>
      )}
      {!isAuxiliaryWindow && comparisonPair && <ComparePhotos pair={comparisonPair} />}
    </>
  );
}
