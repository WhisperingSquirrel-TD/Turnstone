import { existsSync, readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/App';
import { config } from '@/config';
import { en } from '@/locale/en-GB';
import { renderPublicHomeHtml } from '@/public-site-content';

const render = (path: string) =>
  renderToString(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

describe('routes', () => {
  it('renders the answer-first public home and byline', () => {
    const html = render('/');
    expect(html).toContain('Turnstone is a free game of traitors and faithful');
    expect(html).toContain('How it works');
    expect(html).toContain(
      'How do we play a traitor game at home with 15 people?',
    );
    expect(html).toContain('A Stackstone game');
  });
  it('starts with the E1 title card and keeps all entry actions enabled without fields', () => {
    const html = render('/play');
    expect(html).toContain('A game of traitors and faithful.');
    expect(html).toContain('Everyone plays. Even the host.');
    expect(html).toContain('Start a new game');
    expect(html).toContain('Join a game');
    expect(html).toContain('Practise alone first');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('in the room');
    expect(html).not.toContain('Rejoin an existing seat');
    expect(html).not.toContain('not available yet');
    expect(html).toContain('A Stackstone game');
  });
  it('uses clean, in-bounds stone geometry in the Turnstone SVG exports', () => {
    const darkEmblem = readFileSync(
      new URL(
        '../../../assets/brand/turnstone/turnstone-emblem-dark.svg',
        import.meta.url,
      ),
      'utf8',
    );
    const favicon = readFileSync(
      new URL('../../../assets/brand/turnstone/favicon.svg', import.meta.url),
      'utf8',
    );
    const lightEmblem = readFileSync(
      new URL(
        '../../../assets/brand/turnstone/turnstone-emblem-light.svg',
        import.meta.url,
      ),
      'utf8',
    );
    const publicFavicon = readFileSync(
      new URL('../public/favicon.svg', import.meta.url),
      'utf8',
    );
    const currentStackstoneIcon = readFileSync(
      new URL(
        '../public/brand/stackstone-icon-dark-outlined.svg',
        import.meta.url,
      ),
      'utf8',
    );
    const seatShapePattern =
      /<rect\b(?=[^>]*width="8")(?=[^>]*height="12")[^>]*>/g;

    expect(
      existsSync(
        new URL('../public/brand/turnstone-emblem-dark.svg', import.meta.url),
      ),
    ).toBe(false);
    expect(config.appIconPath).toBe('brand/stackstone-icon-dark-outlined.svg');
    expect(publicFavicon).toBe(currentStackstoneIcon);
    for (const source of [darkEmblem, lightEmblem, favicon]) {
      expect([...source.matchAll(seatShapePattern)]).toHaveLength(8);
      expect(source).not.toContain('translate(');
      expect(source).toContain('x="24" y="5" width="8" height="12" rx="4"');
      expect(source).toContain('rotate(315 28 28)');
    }
  });
  it('routes player links to a private-first loading screen', () => {
    const html = render('/game/rehearsal-id');
    expect(html).toContain('Loading your game');
    expect(html).not.toContain('Faithful');
    expect(html).not.toContain('Traitor');
  });
  it('keeps the Stackstone mark in game headers until the emblem is approved', () => {
    const entryHtml = render('/play');
    const entryHeader =
      entryHtml.match(/<header class="entry-brand"[\s\S]*?<\/header>/)?.[0] ??
      '';
    const entryFooter =
      entryHtml.match(/<footer class="entry-footer"[\s\S]*?<\/footer>/)?.[0] ??
      '';

    expect(entryHeader).toContain('data-testid="link-stackstone-mark"');
    expect(entryHeader).toContain('href="https://stackstoneconsulting.co.uk/"');
    expect(entryHeader).toContain(
      'src="/brand/stackstone-icon-dark-outlined.svg"',
    );
    expect(entryHeader).toContain('target="_blank"');
    expect(entryHeader).toContain('rel="noopener noreferrer"');
    expect(entryFooter).toContain('href="https://stackstoneconsulting.co.uk/"');
    expect(entryFooter).toContain(
      'src="/brand/stackstone-icon-dark-outlined.svg"',
    );
    expect(entryFooter).toContain('target="_blank"');
    expect(entryFooter).toContain('rel="noopener noreferrer"');

    const playerHtml = render('/game/rehearsal-id');
    const playerHeader =
      playerHtml.match(
        /<header class="public-home-brand public-shell-header[\s\S]*?<\/header>/,
      )?.[0] ?? '';
    const playerFooter =
      playerHtml.match(/<footer class="mx-auto mt-8[\s\S]*?<\/footer>/)?.[0] ??
      '';
    expect(playerHeader).toContain('data-testid="link-stackstone-mark"');
    expect(playerHeader).toContain(
      'href="https://stackstoneconsulting.co.uk/"',
    );
    expect(playerHeader).toContain(
      'src="/brand/stackstone-icon-dark-outlined.svg"',
    );
    expect(playerHeader).toContain('target="_blank"');
    expect(playerHeader).toContain('rel="noopener noreferrer"');
    expect(playerFooter).toContain(
      'href="https://stackstoneconsulting.co.uk/"',
    );
    expect(playerFooter).toContain(
      'src="/brand/stackstone-icon-dark-outlined.svg"',
    );
    expect(playerHtml).toContain('href="https://stackstoneconsulting.co.uk/"');
  });
  it('links the Stackstone mark externally, opening a new tab only in the player app', () => {
    const publicHtml = render('/');
    const playerHtml = render('/game/rehearsal-id');
    expect(publicHtml).toContain('href="https://stackstoneconsulting.co.uk/"');
    expect(publicHtml).not.toContain('target="_blank"');
    expect(playerHtml).toContain('href="https://stackstoneconsulting.co.uk/"');
    expect(playerHtml).toContain('target="_blank"');
    expect(playerHtml).toContain('rel="noopener noreferrer"');
  });
  it('uses the Stackstone mark in public headers and links in the same tab', () => {
    const publicHtml = render('/');
    const header =
      publicHtml.match(
        /<header class="public-home-brand public-shell-header[\s\S]*?<\/header>/,
      )?.[0] ?? '';
    const footer =
      publicHtml.match(/<footer class="mx-auto mt-8[\s\S]*?<\/footer>/)?.[0] ??
      '';
    expect(header).toContain('data-testid="link-stackstone-mark"');
    expect(header).toContain('href="https://stackstoneconsulting.co.uk/"');
    expect(header).toContain('src="/brand/stackstone-icon-dark-outlined.svg"');
    expect(header).not.toContain('target="_blank"');
    expect(footer).toContain('href="https://stackstoneconsulting.co.uk/"');
    expect(footer).toContain('src="/brand/stackstone-icon-dark-outlined.svg"');

    const staticHome = renderPublicHomeHtml('/');
    const staticHeader =
      staticHome.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
    const staticFooter =
      staticHome.match(
        /<footer class="public-home-footer"[\s\S]*?<\/footer>/,
      )?.[0] ?? '';
    expect(staticHeader).toContain(
      'href="https://stackstoneconsulting.co.uk/"',
    );
    expect(staticHeader).toContain('/brand/stackstone-icon-dark-outlined.svg');
    expect(staticFooter).toContain(
      'href="https://stackstoneconsulting.co.uk/"',
    );
  });
  it('renders accessible 404', () => {
    const html = render('/nope');
    expect(html).toContain(en.notFound.heading);
    expect(html).toContain('<main');
  });
});
