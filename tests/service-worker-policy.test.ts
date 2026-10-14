import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type CacheableRequest = {
  method: string;
  url: string;
  destination: string;
};
type PolicyGlobal = {
  shouldCacheStaticRequest?: (
    request: CacheableRequest,
    origin: string,
  ) => boolean;
};

const policyPath = fileURLToPath(
  new URL(
    '../artifacts/party-game/public/service-worker-policy.js',
    import.meta.url,
  ),
);

describe('service worker static cache policy', () => {
  it('caches only same-origin GET assets and never API or socket traffic', () => {
    const self: PolicyGlobal = {};
    const source = readFileSync(policyPath, 'utf8');
    runInNewContext(source, { self, URL, Set });
    const shouldCache = self.shouldCacheStaticRequest;

    expect(shouldCache).toBeTypeOf('function');
    expect(
      shouldCache!(
        {
          method: 'GET',
          url: 'https://turnstone.example/assets/player.js',
          destination: 'script',
        },
        'https://turnstone.example',
      ),
    ).toBe(true);
    expect(
      shouldCache!(
        {
          method: 'GET',
          url: 'https://turnstone.example/api/games/abc/view',
          destination: '',
        },
        'https://turnstone.example',
      ),
    ).toBe(false);
    expect(
      shouldCache!(
        {
          method: 'GET',
          url: 'https://turnstone.example/socket.io/?EIO=4',
          destination: '',
        },
        'https://turnstone.example',
      ),
    ).toBe(false);
    expect(
      shouldCache!(
        {
          method: 'GET',
          url: 'https://third-party.example/font.woff2',
          destination: 'font',
        },
        'https://turnstone.example',
      ),
    ).toBe(false);
    expect(
      shouldCache!(
        {
          method: 'GET',
          url: 'https://turnstone.example/game/abc',
          destination: 'document',
        },
        'https://turnstone.example',
      ),
    ).toBe(false);
    expect(
      shouldCache!(
        {
          method: 'POST',
          url: 'https://turnstone.example/assets/player.js',
          destination: 'script',
        },
        'https://turnstone.example',
      ),
    ).toBe(false);
  });
});
