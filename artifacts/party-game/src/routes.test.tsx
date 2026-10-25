import { existsSync, readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/App';
import { config } from '@/config';
import { en } from '@/locale/en-GB';
import {
  renderPublicAboutHtml,
  renderPublicCompareHtml,
  renderPublicComingSoonHtml,
  renderPublicFaqHtml,
  renderPublicHomeHtml,
  renderPublicHowToPlayHtml,
} from '@/public-site-content';

const render = (path: string) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const destination = new PassThrough();
    destination.on('data', (chunk: Buffer) => chunks.push(chunk));
    destination.on('end', () =>
      resolve(Buffer.concat(chunks).toString('utf8')),
    );
    destination.on('error', reject);
    const stream = renderToPipeableStream(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>,
      {
        onAllReady: () => stream.pipe(destination),
        onShellError: reject,
        onError: reject,
      },
    );
  });

describe('routes', () => {
  it('renders the entry welcome at root with one heading and no marketing content', async () => {
    const html = await render('/');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('Join a game');
    expect(html).toContain('data-testid="link-about-oathstone"');
    expect(html).not.toContain('How it works');
    expect(html).not.toContain('Oathstone is a free game of traitors');
    expect(html).toContain('made by Stackstone Consulting');
    expect(html.indexOf('button-join-game')).toBeLessThan(
      html.indexOf('button-create-game'),
    );
    expect(html.indexOf('button-create-game')).toBeLessThan(
      html.indexOf('button-practise-alone'),
    );
  });
  it('puts the invite code straight into the name field on join links', async () => {
    const html = await render('/join/abc');
    expect(html).toContain('data-testid="brand-footer-entry"');
  });
  it('starts with the E1 title card and keeps all entry actions enabled without fields', async () => {
    const html = await render('/');
    expect(html).toContain('A game of traitors and faithful.');
    expect(html).toContain('Everyone plays. Even the host.');
    expect(html).toContain('Create a new game');
    expect(html).toContain('Join a game');
    expect(html).toContain('Practise alone');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('in the room');
    expect(html).not.toContain('Rejoin an existing seat');
    expect(html).not.toContain('not available yet');
    expect(html).toContain('data-testid="brand-footer-entry"');
  });
  it('uses clean, in-bounds stone geometry in the Oathstone SVG exports', () => {
    const darkEmblem = readFileSync(
      new URL(
        '../../../assets/brand/oathstone/oathstone-emblem-dark.svg',
        import.meta.url,
      ),
      'utf8',
    );
    const favicon = readFileSync(
      new URL('../../../assets/brand/oathstone/favicon.svg', import.meta.url),
      'utf8',
    );
    const lightEmblem = readFileSync(
      new URL(
        '../../../assets/brand/oathstone/oathstone-emblem-light.svg',
        import.meta.url,
      ),
      'utf8',
    );
    const publicFavicon = readFileSync(
      new URL('../public/favicon.svg', import.meta.url),
      'utf8',
    );
    const currentStackstoneIcon = readFileSync(
      new URL('../public/brand/stackstone-icon-dark.svg', import.meta.url),
      'utf8',
    );
    const seatShapePattern =
      /<rect\b(?=[^>]*width="8")(?=[^>]*height="12")[^>]*>/g;

    expect(
      existsSync(
        new URL('../public/brand/oathstone-emblem-dark.svg', import.meta.url),
      ),
    ).toBe(false);
    expect(config.appIconPath).toBe('brand/stackstone-icon-dark.svg');
    expect(publicFavicon).toBe(currentStackstoneIcon);
    for (const source of [darkEmblem, lightEmblem, favicon]) {
      expect([...source.matchAll(seatShapePattern)]).toHaveLength(8);
      expect(source).not.toContain('translate(');
      expect(source).toContain('x="24" y="5" width="8" height="12" rx="4"');
      expect(source).toContain('rotate(315 28 28)');
    }
  });
  it('routes player links to a private-first loading screen', async () => {
    const html = await render('/game/rehearsal-id');
    expect(html).toContain('Loading your game');
    expect(html).not.toContain('Faithful');
    expect(html).not.toContain('Traitor');
  });
  it('keeps headers Oathstone-only and restores the Stackstone footer on entry and player screens', async () => {
    const entryHtml = await render('/');
    const entryHeader =
      entryHtml.match(/<header class="entry-brand"[\s\S]*?<\/header>/)?.[0] ??
      '';
    const entryFooter =
      entryHtml.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';

    expect(entryHeader).not.toContain('made by Stackstone');
    expect(entryHeader).not.toContain('stackstone-icon-dark-outlined.svg');
    expect(entryFooter).toContain('made by Stackstone Consulting');
    expect(entryFooter).toContain('href="https://stackstoneconsulting.co.uk/"');

    const playerHtml = await render('/game/rehearsal-id');
    const playerHeader =
      playerHtml.match(
        /<header class="public-home-brand public-shell-header[\s\S]*?<\/header>/,
      )?.[0] ?? '';
    const playerFooter =
      playerHtml.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(playerHeader).not.toContain('made by Stackstone');
    expect(playerHeader).not.toContain('stackstone-icon-dark-outlined.svg');
    expect(playerFooter).toContain('made by Stackstone Consulting');
    expect(playerHtml).toContain('href="https://stackstoneconsulting.co.uk/"');
  });
  it('links the Stackstone mark externally, opening a new tab only in the player app', async () => {
    const publicHtml = await render('/faq');
    const playerHtml = await render('/game/rehearsal-id');
    const publicFooter =
      publicHtml.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';
    const playerFooter =
      playerHtml.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(publicFooter).toContain(
      'href="https://stackstoneconsulting.co.uk/"',
    );
    expect(publicFooter).not.toContain('target="_blank"');
    expect(playerFooter).toContain('target="_blank"');
    expect(playerFooter).toContain('rel="noopener noreferrer"');
  });
  it('keeps public headers Oathstone-only and links to Stackstone in the footer', async () => {
    const publicHtml = await render('/faq');
    const header =
      publicHtml.match(
        /<header class="public-home-brand public-shell-header[\s\S]*?<\/header>/,
      )?.[0] ?? '';
    const footer = publicHtml.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(header).not.toContain('stackstoneconsulting.co.uk');
    expect(header).not.toContain('stackstone-icon-dark-outlined.svg');
    expect(footer).toContain('made by Stackstone Consulting');
    expect(footer).toContain('href="https://stackstoneconsulting.co.uk/"');
    expect(footer).toContain('src="/brand/stackstone-icon.svg"');
    expect(footer).toContain('alt="Stackstone Consulting"');
    expect(footer).not.toContain('target="_blank"');

    const staticHome = renderPublicHomeHtml('/');
    const staticHeader =
      staticHome.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
    const staticFooter =
      staticHome.match(
        /<footer class="public-home-footer"[\s\S]*?<\/footer>/,
      )?.[0] ?? '';
    expect(staticHeader).not.toContain('made by Stackstone');
    expect(staticHeader).not.toContain('/brand/stackstone-icon-dark.svg');
    expect(staticFooter).toContain('made by Stackstone Consulting');
    expect(staticFooter).toContain(
      'href="https://stackstoneconsulting.co.uk/"',
    );
    expect(staticFooter).toContain('/brand/stackstone-icon.svg');
    expect(staticFooter).toContain('alt="Stackstone Consulting"');
  });
  it('shows the Stackstone credit on every app screen', async () => {
    const homeHtml = await render('/faq');
    expect(homeHtml).toContain('made by Stackstone Consulting');
    expect(homeHtml).toContain('data-testid="brand-footer-shell"');
    expect(homeHtml).toContain('src="/brand/stackstone-icon.svg"');

    for (const path of [
      '/faq',
      '/compare',
      '/',
      '/join',
      '/game/rehearsal-id',
      '/nope',
    ]) {
      const pageHtml = await render(path);
      expect(pageHtml).toMatch(/data-testid="brand-footer-(?:shell|entry)"/);
    }
    for (const staticPage of [
      renderPublicAboutHtml(),
      renderPublicHowToPlayHtml(),
      renderPublicFaqHtml(),
      renderPublicCompareHtml(),
      renderPublicComingSoonHtml(),
    ]) {
      expect(staticPage).not.toContain('data-testid="brand-footer-static"');
    }

    const playerHtml = await render('/game/rehearsal-id');
    expect(
      playerHtml.match(
        /(?:class="oathstone-wordmark"|data-testid="text-entry-brand")/g,
      ) ?? [],
    ).toHaveLength(0);
    expect(playerHtml).toContain('data-testid="game-status-bar"');
    const playerHeader =
      playerHtml.match(
        /<header class="public-home-brand public-shell-header[\s\S]*?<\/header>/,
      )?.[0] ?? '';
    expect(playerHeader).not.toContain('made by Stackstone');
    expect(playerHeader).not.toContain('stackstone-icon-dark-outlined.svg');

    const entryHtml = await render('/');
    const entryHeader =
      entryHtml.match(/<header class="entry-brand"[\s\S]*?<\/header>/)?.[0] ??
      '';
    expect(entryHeader).not.toContain('made by Stackstone');
    expect(entryHeader).not.toContain('stackstone-icon-dark-outlined.svg');

    const publicHtml = await render('/faq');
    const publicHeader =
      publicHtml.match(
        /<header class="public-home-brand public-shell-header[\s\S]*?<\/header>/,
      )?.[0] ?? '';
    expect(publicHeader).not.toContain('made by Stackstone');
    expect(publicHeader).not.toContain('stackstone-icon-dark-outlined.svg');

    const staticHome = renderPublicHomeHtml('/');
    const staticHeader =
      staticHome.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
    const staticFooter =
      staticHome.match(
        /<footer class="public-home-footer"[\s\S]*?<\/footer>/,
      )?.[0] ?? '';
    expect(staticHeader).not.toContain('made by Stackstone');
    expect(staticHeader).not.toContain('stackstone-icon-dark-outlined.svg');
    expect(staticFooter).toContain('made by Stackstone Consulting');
    expect(staticFooter).toContain(
      'href="https://stackstoneconsulting.co.uk/"',
    );
    expect(staticFooter).toContain('/brand/stackstone-icon.svg');
  });

  it('renders accessible 404', async () => {
    const html = await render('/nope');
    expect(html).toContain(en.notFound.heading);
    expect(html).toContain('<main');
  });
});
