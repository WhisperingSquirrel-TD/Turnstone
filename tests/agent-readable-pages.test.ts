import { describe, expect, it } from 'vitest';
import {
  APP_ROUTE_PATHS,
  PUBLIC_MARKETING_ROUTE_PATHS,
} from '../lib/shared/src/app-routes';
import {
  renderRobotsTxt,
  type DeploymentMode,
} from '../lib/security/src/deployment';
import { config } from '../artifacts/party-game/src/config';
import {
  renderLlmsTxt,
  renderPublicPageDocument,
  renderSitemapXml,
  structuredPublicData,
  type PublicPageSlug,
} from '../artifacts/party-game/src/public-site-content';

const comingSoonMode: DeploymentMode = {
  preLaunchNoindex: true,
  comingSoonMode: true,
};
const pages: ReadonlyArray<{ slug: PublicPageSlug; route: string }> = [
  { slug: 'home', route: APP_ROUTE_PATHS.home },
  { slug: 'about', route: APP_ROUTE_PATHS.about },
  { slug: 'how-to-play', route: APP_ROUTE_PATHS.howToPlay },
  { slug: 'faq', route: APP_ROUTE_PATHS.faq },
  { slug: 'compare', route: APP_ROUTE_PATHS.compare },
  { slug: 'coming-soon', route: APP_ROUTE_PATHS.comingSoon },
];

function publicDocument(slug: PublicPageSlug): string {
  return renderPublicPageDocument({
    page: slug,
    stylesheetHrefs: ['/assets/public.css'],
    fontPreloadHrefs: ['/assets/display.woff2', '/assets/body.woff2'],
    mode: comingSoonMode,
  });
}

describe('agent-readable public pages', () => {
  it('uses the owner-approved coming-soon copy without a date or signup form', () => {
    const html = publicDocument('coming-soon');
    expect(html).toContain('A game of traitors and faithful.');
    expect(html).toContain('Everyone plays. Even the host.');
    expect(html).toContain(
      'Oathstone is a free hidden-traitor party game for 5 to 40 people, played on phones in the same room or over a video call. It is coming soon.',
    );
    expect(html).toContain('A Stackstone game.');
    expect(html).toContain(
      'Oathstone is an independent game made by Stackstone Consulting.',
    );
    expect(html).not.toContain('<form');
    expect(html).not.toContain('type="email"');
  });

  it('gives every public page unique canonical, description and share metadata', () => {
    const documents = pages.map(({ slug }) => publicDocument(slug));
    const titles = documents.map(
      (html) => html.match(/<title>(.*?)<\/title>/)?.[1],
    );
    const descriptions = documents.map(
      (html) => html.match(/<meta name="description" content="(.*?)">/)?.[1],
    );

    expect(new Set(titles).size).toBe(pages.length);
    expect(new Set(descriptions).size).toBe(pages.length);
    for (const [index, page] of pages.entries()) {
      const canonical = new URL(page.route, config.siteOrigin).href;
      const html = documents[index]!;
      expect(html).toContain(`rel="canonical" href="${canonical}"`);
      expect(html).toContain(`property="og:url" content="${canonical}"`);
      expect(html).toContain('property="og:title"');
      expect(html).toContain('property="og:description"');
      expect(html).toContain('name="twitter:card"');
      expect(html).toContain('name="twitter:title"');
      expect(html).toContain('name="twitter:description"');
      expect(html).toContain('content="index, follow"');
      expect(html).not.toMatch(/<script[^>]+(?:src=|type="module")/i);
    }
  });

  it('exposes public pages and required FAQ content to language models', () => {
    const text = renderLlmsTxt();
    for (const route of PUBLIC_MARKETING_ROUTE_PATHS) {
      expect(text).toContain(new URL(route, config.siteOrigin).href);
    }
    expect(text).toContain(
      'Is there a free alternative to the WhatsApp traitors game?',
    );
    expect(text).not.toContain(`${config.siteOrigin}/play`);
    expect(text).not.toContain(`${config.siteOrigin}/api`);
  });

  it('lists only the public pages in the XML sitemap', () => {
    const sitemap = renderSitemapXml();
    const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
      (match) => match[1],
    );
    expect(locations).toEqual(
      pages.map(({ route }) => new URL(route, config.siteOrigin).href),
    );
    expect(sitemap).not.toContain('/play');
    expect(sitemap).not.toContain('/api');
  });

  it('allows named search bots only the public surface', () => {
    const sitemapUrl = new URL('/sitemap.xml', config.siteOrigin).href;
    const robots = renderRobotsTxt(comingSoonMode, sitemapUrl);
    for (const agent of [
      'OAI-SearchBot',
      'GPTBot',
      'ChatGPT-User',
      'ClaudeBot',
      'Claude-SearchBot',
      'Claude-User',
      'PerplexityBot',
      'Google-Extended',
      'Applebot-Extended',
    ]) {
      expect(robots).toContain(`User-agent: ${agent}`);
    }
    for (const route of ['/play', '/join', '/practice', '/api/']) {
      expect(robots).toContain(`Disallow: ${route}`);
    }
    expect(robots).toContain(`Sitemap: ${sitemapUrl}`);
    expect(robots).not.toContain('Disallow: /faq');
    expect(robots).not.toContain('Disallow: /compare');
  });

  it('publishes organization, website and game schemas, with FAQ schema only on FAQ', () => {
    const globalTypes = structuredPublicData().map((entry) => entry['@type']);
    expect(globalTypes).toEqual(
      expect.arrayContaining([
        'Organization',
        'WebSite',
        'WebApplication',
        'Game',
      ]),
    );
    expect(globalTypes).not.toContain('FAQPage');
    const faqTypes = structuredPublicData({ includeFaqPage: true }).map(
      (entry) => entry['@type'],
    );
    expect(faqTypes).toContain('FAQPage');
    const app = structuredPublicData().find(
      (entry) => entry['@type'] === 'WebApplication',
    );
    expect(app).toMatchObject({
      isAccessibleForFree: true,
      numberOfPlayers: {
        '@type': 'QuantitativeValue',
        minValue: 5,
        maxValue: 40,
      },
    });
    expect(app?.featureList).toContain('Phone and tablet browser play');
    const homeJsonLd = JSON.parse(
      publicDocument('home').match(
        /<script type="application\/ld\+json">([^<]+)<\/script>/,
      )?.[1] ?? '[]',
    ) as Array<Record<string, unknown>>;
    const faqJsonLd = JSON.parse(
      publicDocument('faq').match(
        /<script type="application\/ld\+json">([^<]+)<\/script>/,
      )?.[1] ?? '[]',
    ) as Array<Record<string, unknown>>;
    expect(homeJsonLd.map((entry) => entry['@type'])).not.toContain('FAQPage');
    const faqPage = faqJsonLd.find((entry) => entry['@type'] === 'FAQPage');
    expect(faqPage).toBeDefined();
    expect(JSON.stringify(faqPage)).toContain(
      'Is there a free alternative to the WhatsApp traitors game?',
    );
  });
});
