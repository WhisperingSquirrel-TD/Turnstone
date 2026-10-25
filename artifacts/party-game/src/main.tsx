import './index.css';
import './public-home.css';
import './HoldRoleDemo.css';
import { installPublicHoldDemo } from './public-demo';
import { PUBLIC_MARKETING_ROUTE_PATHS } from '@workspace/shared/app-routes';
import { gameThemeForPhase, readDisplayPreference } from './game-theme';
import { config } from './config';

const basePath = new URL(
  import.meta.env.BASE_URL,
  window.location.origin,
).pathname.replace(/\/+$/, '');
const path = window.location.pathname.startsWith(`${basePath}/`)
  ? window.location.pathname.slice(basePath.length)
  : window.location.pathname;
const normalizedPath = path.replace(/\/+$/, '') || '/';
const isStaticPublicPage =
  normalizedPath === '/llms.txt' ||
  PUBLIC_MARKETING_ROUTE_PATHS.some((route) => route === normalizedPath);

if (isStaticPublicPage) {
  const phoneTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const updateTheme = () => {
    let preference: 'system' | 'light' | 'dark' = 'system';
    try {
      preference = readDisplayPreference(window.localStorage);
    } catch {
      // Public pages remain usable without device storage.
    }
    const theme = gameThemeForPhase(undefined, preference, phoneTheme.matches);
    document
      .getElementById('static-home')
      ?.setAttribute('data-game-theme', theme);
    const icon = document.querySelector<HTMLImageElement>('.brand-credit img');
    if (icon)
      icon.src = `${basePath}${theme === 'night' ? config.stackstoneIcons.onDark : config.stackstoneIcons.onLight}`;
  };
  updateTheme();
  phoneTheme.addEventListener('change', updateTheme);
  window.addEventListener('storage', updateTheme);
  if (normalizedPath === '/') installPublicHoldDemo();
} else {
  document.getElementById('static-home')?.remove();
  void (async () => {
    const [{ createRoot }, { default: App }] = await Promise.all([
      import('react-dom/client'),
      import('./App'),
    ]);
    createRoot(document.getElementById('root')!).render(<App />);

    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      const workerUrl = new URL(
        `${import.meta.env.BASE_URL}service-worker.js`,
        window.location.origin,
      );
      void navigator.serviceWorker
        .register(workerUrl, { scope: import.meta.env.BASE_URL })
        .catch(() => {
          document.documentElement.dataset.staticAssetCache = 'unavailable';
        });
    }
  })();
}
