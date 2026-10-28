import { describe, expect, it } from 'vitest';
import {
  renderRobotsTxt,
  shouldNoindexPath,
  type DeploymentMode,
} from '../lib/security/src/deployment';
import { config } from '../artifacts/party-game/src/config';
import { buildNewGameConfig } from '../artifacts/party-game/src/new-game-config';
import {
  publicSiteCopy,
  renderLlmsTxt,
  renderPublicPageDocument,
  structuredPublicData,
  type PublicPageSlug,
} from '../artifacts/party-game/src/public-site-content';

// D119 (owner, 28 October 2026): the game domain stays out of search results
// (noindex everywhere) but robots.txt lets agents read the public pages. No
// sitemap. Missions are off in the beta, so public copy must not promise them.
const preLaunch: DeploymentMode = {
  preLaunchNoindex: true,
  comingSoonMode: false,
};
const publicRoutes = ['/', '/about', '/how-to-play', '/faq', '/compare'];
const slugs: PublicPageSlug[] = [
  'home',
  'about',
  'how-to-play',
  'faq',
  'compare',
  'coming-soon',
];

function page(slug: PublicPageSlug): string {
  return renderPublicPageDocument({
    page: slug,
    stylesheetHrefs: ['/assets/public.css'],
    fontPreloadHrefs: [],
    mode: preLaunch,
  });
}

describe('pre-launch robots.txt', () => {
  const robots = renderRobotsTxt(
    preLaunch,
    new URL('/sitemap.xml', config.siteOrigin).href,
  );
  const lines = robots.split('\n');

  it('lets crawlers read the public pages and llms.txt', () => {
    expect(lines).not.toContain('Disallow: /');
    for (const route of [...publicRoutes, '/llms.txt'])
      expect(lines, route).toContain(
        route === '/' ? 'Allow: /$' : `Allow: ${route}`,
      );
  });

  it('keeps app, API and identifier-carrying routes closed', () => {
    for (const route of [
      '/api/',
      '/socket.io/',
      '/join',
      '/join-request',
      '/game',
      '/coordinate',
      '/tv',
      '/play',
      '/practice',
      '/create',
      '/account',
      '/admin',
      '/recap',
      '/app-shell.html',
      '/*?',
    ])
      expect(lines, route).toContain(`Disallow: ${route}`);
  });

  it('advertises no sitemap', () => {
    expect(robots).not.toMatch(/sitemap/i);
  });

  it('still marks every route noindex', () => {
    for (const route of [
      ...publicRoutes,
      '/coming-soon',
      '/play',
      '/join',
      '/game/abc',
    ])
      expect(shouldNoindexPath(route, preLaunch), route).toBe(true);
    for (const slug of slugs)
      expect(page(slug), slug).toContain(
        '<meta name="robots" content="noindex, nofollow">',
      );
  });
});

const fullDetails = `Full details: ${config.companyPageUrl}`;
const play = `Play: ${config.siteOrigin}`;

describe('cross-links and canonical', () => {
  it('points every public page canonical at the company page and links both ways', () => {
    for (const slug of slugs) {
      const html = page(slug);
      expect(html, slug).toContain(
        `<link rel="canonical" href="${config.companyPageUrl}">`,
      );
      expect(html, slug).toContain(`href="${config.companyPageUrl}"`);
      expect(html, slug).toContain('Full details');
      expect(html, slug).toContain(`href="${config.siteOrigin}/"`);
      expect(html, slug).toContain('Play');
    }
  });

  it('states both links in llms.txt and lists no sitemap', () => {
    const text = renderLlmsTxt();
    expect(text).toContain(fullDetails);
    expect(text).toContain(play);
    expect(text).not.toMatch(/sitemap/i);
  });
});

const groupPlay = 'Players discuss suspicions and vote together.';
const missionsSoon = 'Missions are coming soon.';
const faqAnswers = [
  [
    'How do we play a traitor game at home with 15 people?',
    `The organiser starts a game, joins as a player and shares the six-character code. Each person joins in a phone or tablet browser and receives a private role. ${groupPlay}`,
  ],
  [
    'Is there a traitor game where nobody has to host?',
    'Yes. The organiser handles timing and approvals but also receives a secret role and plays like everyone else.',
  ],
  [
    'What is a good game for a big family gathering?',
    'A group can play together using their own phones or tablets, with family-friendly wording and paired seats for anyone sharing a device.',
  ],
  [
    'Is there a party game where everyone gets a secret role on their phone?',
    'Yes. Players reveal their role privately on their own browser screen, while public announcements are shared with the whole group.',
  ],
  [
    'Is there a team-building game like this for 30 or 40 people?',
    'The game supports groups from 5 to 40 players and can be scheduled for a quick session, a day or a multi-day event.',
  ],
  [
    'Is there a free alternative to boxed traitor games that takes more players?',
    'This browser game is free to play and supports 5 to 40 players. Players use a phone or tablet browser; there is nothing to download.',
  ],
  [
    'Can children and grandparents play?',
    'Yes. Family-friendly wording, larger text, simpler language, tap-to-reveal and paired seats help different ages play together.',
  ],
  [
    'How long does a game take?',
    'A quick game takes about one hour. A day format can span a gathering, and a multi-day game can run for two to fourteen days.',
  ],
  [
    'Is there a free alternative to chat-based hidden-traitor games?',
    'Yes. Many versions of this kind of game play out as group-chat messages over a week, charge per player and limit numbers. Oathstone is different: it is free for everyone, with no per-player tickets; it takes up to 40 players, and families with children can play together; you play face to face in one room, with phones used only for secrets; there are no phone numbers or group chats, just a code and a first name; secrets stay secret with hold-to-reveal and identical screens for every role; and it works anywhere, for an hour or a fortnight.',
  ],
  [
    'Is Oathstone affiliated with a television programme?',
    `No. ${publicSiteCopy().independenceStatement}`,
  ],
  [
    'Do I need WhatsApp or an app?',
    'No. Oathstone runs in any modern phone or tablet browser. You can add it to your Home Screen if you like, but you never have to.',
  ],
] as const;

describe('beta copy with missions switched off', () => {
  it('is driven by the same switch that keeps missions out of new games', () => {
    expect(config.missionsAvailable).toBe(false);
    expect(
      buildNewGameConfig({
        gameName: 'Test',
        playerCount: 8,
        coCoordinatorCount: 0,
        presenterEnabled: false,
      }).missions.enabled,
    ).toBe(config.missionsAvailable);
  });

  it('keeps exactly the eleven FAQ answers, changing only the mission sentence', () => {
    expect(
      publicSiteCopy().faq.map((item) => [item.question, item.answer]),
    ).toEqual(faqAnswers);
  });

  it('mentions no missions or prize pot anywhere public except the coming-soon line', () => {
    const surfaces = {
      llms: renderLlmsTxt(),
      jsonLd: JSON.stringify(structuredPublicData({ includeFaqPage: true })),
      ...Object.fromEntries(slugs.map((slug) => [slug, page(slug)])),
    };
    for (const [name, text] of Object.entries(surfaces)) {
      const withoutNotice = text.replaceAll(missionsSoon, '');
      expect(withoutNotice, name).not.toMatch(/mission|prize|\bpot\b/i);
    }
    for (const name of ['llms', 'jsonLd', 'home', 'how-to-play', 'faq'])
      expect(surfaces[name as keyof typeof surfaces], name).toMatch(
        /discuss suspicions and vote together\./i,
      );
    for (const name of ['llms', 'home', 'how-to-play'])
      expect(surfaces[name as keyof typeof surfaces], name).toContain(
        missionsSoon,
      );
  });

  it('restores the existing mission copy when missions are switched on', () => {
    const on = publicSiteCopy(true);
    expect(on.faq[0]!.answer).toContain(
      'Players complete missions, build the prize pot, discuss suspicions and vote together.',
    );
    expect(on.howItWorks[2]!.body).toBe(
      'Complete missions, build the prize pot, discuss suspicions and vote together.',
    );
    expect(on.formats[0]!.description).toBe(
      'A fast game for one gathering, with short discussions and simple missions.',
    );
    expect(on.missionsNotice).toBeNull();
    expect(publicSiteCopy(false).missionsNotice).toBe(missionsSoon);
  });
});
