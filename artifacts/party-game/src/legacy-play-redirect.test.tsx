import { describe, expect, it } from 'vitest';
import { canonicalPlayTarget } from './legacy-play-redirect';

describe('canonicalPlayTarget', () => {
  it('preserves query and hash', () => {
    expect(
      canonicalPlayTarget({
        pathname: '/play',
        search: '?entry=create',
        hash: '#x',
      }),
    ).toBe('/?entry=create#x');
  });
  it('handles trailing slash and bare path', () => {
    expect(
      canonicalPlayTarget({ pathname: '/play/', search: '', hash: '' }),
    ).toBe('/');
  });
  it('ignores other paths', () => {
    expect(
      canonicalPlayTarget({ pathname: '/join', search: '', hash: '' }),
    ).toBeNull();
  });
});
