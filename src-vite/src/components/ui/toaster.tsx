import { Slide, ToastContainer, type ToastPosition } from 'react-toastify';
import { useSettingsStore } from '../../stores/settingsStore';
import { Appearance } from '../../utils/theme';
import 'react-toastify/ReactToastify.css';
import './toast.css';

type AppToasterProps = {
  /**
   * Where notifications appear. Defaults to the bottom-right so toasts and the
   * process notifications share a single corner of the app.
   */
  position?: ToastPosition;
};

/**
 * App-wide notification host. Renders a single `react-toastify` container that
 * shows both regular toasts and live process notifications, stacked in the
 * bottom-right. Mount it once per window (main shell + settings window).
 */
export function AppToaster({ position = 'bottom-right' }: AppToasterProps) {
  const appearance = useSettingsStore((state) => state.appearance);
  const theme = appearance === Appearance.Dark ? 'dark' : 'light';

  return (
    <ToastContainer
      position={position}
      theme={theme}
      transition={Slide}
      newestOnTop={false}
      closeOnClick={false}
      pauseOnHover
      draggable
      closeButton
      hideProgressBar
      autoClose={4000}
      className="app-toast-container"
      toastClassName="app-toast-item"
    />
  );
}
