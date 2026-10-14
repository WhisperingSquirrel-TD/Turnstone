import './index.css';
import './public-home.css';
import './HoldRoleDemo.css';
import { installPublicHoldDemo } from './public-demo';

const basePath = new URL(
  import.meta.env.BASE_URL,
  window.location.origin,
).pathname.replace(/\/+$/, '');
const path = window.location.pathname.startsWith(`${basePath}/`)
  ? window.location.pathname.slice(basePath.length)
  : window.location.pathname;
const isStaticPublicPage = ['/', '/faq', '/compare', '/llms.txt'].includes(
  path.replace(/\/+$/, '') || '/',
);

if (isStaticPublicPage) {
  if ((path.replace(/\/+$/, '') || '/') === '/') installPublicHoldDemo();
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
