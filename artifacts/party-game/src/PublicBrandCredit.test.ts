import { describe, expect, it } from 'vitest';
import { renderPublicPageDocument } from './public-site-content';

describe('served public-page branding', () => {
  for (const page of [
    'home',
    'about',
    'how-to-play',
    'faq',
    'compare',
    'coming-soon',
  ] as const) {
    it(`has one linked official credit on ${page}`, () => {
      const html = renderPublicPageDocument({
        page,
        stylesheetHrefs: [],
        fontPreloadHrefs: [],
      });
      expect(html.match(/data-testid="brand-footer-static"/g)).toHaveLength(1);
      expect(html).toContain('made by Stackstone Consulting');
      expect(html).toContain('href="https://stackstoneconsulting.co.uk/"');
      expect(html).toContain('alt="Stackstone Consulting"');
      expect(html).toContain('/brand/stackstone-icon.svg');
    });
  }
});
