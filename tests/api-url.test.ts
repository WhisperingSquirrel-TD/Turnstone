import { describe, expect, it } from 'vitest';
import { apiUrl } from '../artifacts/party-game/src/api-url';

describe('API URL routing', () => {
  it('uses the shared same-origin API path in the Replit preview', () => {
    expect(apiUrl('/csrf', null)).toBe('/api/csrf');
  });

  it('uses the configured sibling API origin when it is available', () => {
    expect(
      apiUrl('/csrf', 'https://live.oathstone.stackstoneconsulting.co.uk/'),
    ).toBe('https://live.oathstone.stackstoneconsulting.co.uk/api/csrf');
  });
});
