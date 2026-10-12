export const config = {
  appName: (import.meta.env?.VITE_APP_NAME as string | undefined) || 'APP_NAME',
  builder: 'Stackstone Consulting',
  routes: { home: '/', play: '/play' },
} as const;
