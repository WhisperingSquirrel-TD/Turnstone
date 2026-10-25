import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { config } from '../artifacts/party-game/src/config';

describe('single-source owner identity', () => {
  it('stores the confirmed name, tagline/byline and organisation in config', () => {
    const spec = readFileSync(
      new URL('../docs/SPEC.md', import.meta.url),
      'utf8',
    );
    const ownerName = /Product name: APP_NAME is "([^"]+)"/.exec(spec)?.[1];
    expect(ownerName).toBeTruthy();
    expect(config.appName).toBe(ownerName);
    expect(config.tagline).toBe('A game of traitors and faithful.');
    expect(config.byline).toBe('made by Stackstone Consulting');
    expect(config.organisation).toEqual({
      name: config.builder,
      url: 'https://stackstoneconsulting.co.uk/',
      location: { locality: 'Abingdon', region: 'Oxfordshire' },
    });
  });
  it('derives built title/social metadata from config, not template literals', () => {
    const source = readFileSync(
      new URL('../artifacts/party-game/index.html', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/(?:<title>|content=")APP_NAME/);
    expect(source).toContain('__PUBLIC_TITLE__');
    expect(source).not.toContain('__APP_NAME__');
    const output = readFileSync(
      new URL(
        '../artifacts/party-game/dist/public/index.html',
        import.meta.url,
      ),
      'utf8',
    );
    expect(output).toContain(`<title>${config.appName}</title>`);
    expect(output).toContain(`property="og:title" content="${config.appName}"`);
    expect(output).toContain(
      `name="twitter:title" content="${config.appName}"`,
    );
    expect(output).not.toContain('__APP_NAME__');
    expect(output).not.toContain('__PUBLIC_TITLE__');
  });
});
