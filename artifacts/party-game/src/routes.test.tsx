import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/App';
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
      new URL('../../../branding/turnstone-emblem-dark.svg', import.meta.url),
      'utf8',
    );
    const favicon = readFileSync(
      new URL('../../../branding/favicon.svg', import.meta.url),
      'utf8',
    );
    const lightEmblem = readFileSync(
      new URL('../../../branding/turnstone-emblem-light.svg', import.meta.url),
      'utf8',
    );
    const publicEmblem = readFileSync(
      new URL('../public/brand/turnstone-emblem-dark.svg', import.meta.url),
      'utf8',
    );
    const publicFavicon = readFileSync(
      new URL('../public/favicon.svg', import.meta.url),
      'utf8',
    );
    const seatShapePattern =
      /<rect\b(?=[^>]*width="8")(?=[^>]*height="12")[^>]*>/g;

    expect(publicEmblem).toBe(darkEmblem);
    expect(publicFavicon).toBe(favicon);
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
  it('uses the Turnstone emblem in game headers and keeps Stackstone links on its website', () => {
    const entryHtml = render('/play');
    const entryHeader =
      entryHtml.match(/<header class="entry-brand"[\s\S]*?<\/header>/)?.[0] ??
      '';
    const entryFooter =
      entryHtml.match(/<footer class="entry-footer"[\s\S]*?<\/footer>/)?.[0] ??
      '';

    expect(entryHeader).toContain('data-testid="link-turnstone-mark"');
    expect(entryHeader).toContain('href="/"');
    expect(entryHeader).toContain('src="/brand/turnstone-emblem-dark.svg"');
    expect(entryHeader).not.toContain('stackstoneconsulting.co.uk');
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
    expect(playerHeader).toContain('data-testid="link-turnstone-mark"');
    expect(playerHeader).toContain('href="/"');
    expect(playerHeader).toContain('src="/brand/turnstone-emblem-dark.svg"');
    expect(playerHeader).not.toContain('stackstoneconsulting.co.uk');
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
  it('uses the Turnstone emblem in public headers and keeps Stackstone links in the footer', () => {
    const publicHtml = render('/');
    const header =
      publicHtml.match(
        /<header class="public-home-brand public-shell-header[\s\S]*?<\/header>/,
      )?.[0] ?? '';
    const footer =
      publicHtml.match(/<footer class="mx-auto mt-8[\s\S]*?<\/footer>/)?.[0] ??
      '';
    expect(header).toContain('data-testid="link-turnstone-mark"');
    expect(header).toContain('href="/"');
    expect(header).toContain('src="/brand/turnstone-emblem-dark.svg"');
    expect(header).not.toContain('stackstoneconsulting.co.uk');
    expect(footer).toContain('href="https://stackstoneconsulting.co.uk/"');
    expect(footer).toContain('src="/brand/stackstone-icon-dark-outlined.svg"');

    const staticHome = renderPublicHomeHtml('/');
    const staticHeader =
      staticHome.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
    const staticFooter =
      staticHome.match(
        /<footer class="public-home-footer"[\s\S]*?<\/footer>/,
      )?.[0] ?? '';
    expect(staticHeader).toContain('href="/"');
    expect(staticHeader).toContain('/brand/turnstone-emblem-dark.svg');
    expect(staticHeader).not.toContain('stackstoneconsulting.co.uk');
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
