import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isAppShellRoute } from '@workspace/shared/app-routes';
import { config } from './config';

export function routeMetadata(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const app = isAppShellRoute(path);
  return {
    canonical: app
      ? null
      : path === '/'
        ? config.companyPageUrl
        : new URL(path, config.siteOrigin).href,
    robots: app || config.preLaunch ? 'noindex, nofollow' : 'index, follow',
  };
}

export function RouteMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const metadata = routeMetadata(pathname);
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (metadata.canonical) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.append(canonical);
      }
      canonical.href = metadata.canonical;
    } else {
      canonical?.remove();
      document.querySelector('meta[property="og:url"]')?.remove();
      document.querySelector('meta[name="twitter:url"]')?.remove();
    }
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    robots.content = metadata.robots;
  }, [pathname]);
  return null;
}
