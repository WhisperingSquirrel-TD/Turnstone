import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

document.getElementById('static-home')?.remove();
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
