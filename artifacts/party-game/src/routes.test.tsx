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
  it('renders home content and footer', () => {
    const html = render('/');
    expect(html).toContain(en.home.heading);
    expect(html).toContain('Built by Stackstone Consulting');
  });
  it('renders honest play placeholder and footer', () => {
    const html = render('/play');
    expect(html).toContain(en.play.heading);
    expect(html).toContain(en.play.body);
    expect(html).toContain('Built by Stackstone Consulting');
  });
  it('renders accessible 404', () => {
    const html = render('/nope');
    expect(html).toContain(en.notFound.heading);
    expect(html).toContain('<main');
  });
});
