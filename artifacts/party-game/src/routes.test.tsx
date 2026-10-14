import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/App';
import { en } from '@/locale/en-GB';

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
    expect(html).toContain('How do we play a traitor game at home with 15 people?');
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
  it('routes player links to a private-first loading screen', () => {
    const html = render('/game/rehearsal-id');
    expect(html).toContain('Loading your game');
    expect(html).not.toContain('Faithful');
    expect(html).not.toContain('Traitor');
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
  it('renders accessible 404', () => {
    const html = render('/nope');
    expect(html).toContain(en.notFound.heading);
    expect(html).toContain('<main');
  });
});
