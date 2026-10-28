import { config } from './config';
import { en } from './locale/en-GB';
import {
  deploymentMode,
  shouldNoindexPath,
  type DeploymentMode,
} from '@workspace/security/deployment';
import {
  APP_ROUTE_PATHS,
  PUBLIC_MARKETING_ROUTE_PATHS,
} from '@workspace/shared/app-routes';

export interface PublicFact {
  id: string;
  label: string;
  value: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normaliseBasePath(basePath: string): string {
  if (!basePath.startsWith('/')) {
    throw new Error('The public base path must start with a slash.');
  }
  return basePath.endsWith('/') ? basePath : `${basePath}/`;
}

function renderOathstoneWordmark(basePath: string): string {
  const firstPart = config.appName.slice(
    0,
    config.appName.length - config.wordmarkAccentSuffix.length,
  );
  return `
      <a class="oathstone-wordmark" href="${escapeHtml(basePath)}" aria-label="${escapeHtml(config.appName)}">
        <span>${escapeHtml(firstPart)}</span><span class="text-gilt">${escapeHtml(config.wordmarkAccentSuffix)}</span>
      </a>`;
}

export function renderPublicAppShellHtml(basePath = '/'): string {
  return `
    <header class="public-home-brand public-shell-header player-shell-header">
      ${renderOathstoneWordmark(basePath)}
    </header>`;
}

function renderPublicHeader(
  basePath: string,
  mode: DeploymentMode = deploymentMode,
): string {
  const playLink = mode.comingSoonMode
    ? ''
    : `<a href="${escapeHtml(`${basePath}play`)}">${escapeHtml(en.nav.play)}</a>`;
  return `
    <a class="public-skip-link" href="#main">Skip to content</a>
    <header class="public-home-brand">
      ${renderOathstoneWordmark(basePath)}
      <details class="public-home-menu">
        <summary>${escapeHtml(en.nav.menu)}</summary>
        <div>
          <a href="${escapeHtml(basePath)}">${escapeHtml(en.nav.home)}</a>
          <a href="${escapeHtml(`${basePath}about`)}">${escapeHtml(en.publicSite.aboutHeading)}</a>
          <a href="${escapeHtml(`${basePath}how-to-play`)}">${escapeHtml(en.publicSite.howToPlayHeading)}</a>
          <a href="${escapeHtml(`${basePath}faq`)}">${escapeHtml(en.publicSite.faqHeading)}</a>
          <a href="${escapeHtml(`${basePath}compare`)}">${escapeHtml(en.publicSite.compareHeading)}</a>
          ${playLink}
          <a href="${escapeHtml(config.companyPageUrl)}">About Oathstone</a>
        </div>
      </details>
    </header>
  `;
}

/** The game host is a play surface; public information documents stay separate. */
export function renderGameEntryHtml(basePath = '/'): string {
  const base = normaliseBasePath(basePath);
  return `${renderPublicHeader(base)}
    <main id="main" class="game-entry-static">
      <h1>${escapeHtml(config.appName)}</h1>
      <p>${escapeHtml(en.entry.welcomeDescription)}</p>
      <nav aria-label="${escapeHtml(config.appName)}">
        <a href="${escapeHtml(`${base}join`)}">${escapeHtml(en.entry.joinGame)}</a>
        <a href="${escapeHtml(`${base}?entry=create`)}">${escapeHtml(en.entry.createGame)}</a>
        <a href="${escapeHtml(`${base}?entry=rehearsal`)}">${escapeHtml(en.entry.practiseAlone)}</a>
      </nav>
      <a class="game-entry-about" href="${escapeHtml(config.companyPageUrl)}">About Oathstone</a>
      <p class="game-entry-beta"><span class="beta-tag" data-testid="beta-tag">${escapeHtml(en.app.beta)}</span> ${escapeHtml(en.entry.betaNote)}</p>
    </main>
    ${renderStackstoneFooterLink(base)}`;
}

function renderStackstoneFooterLink(basePath: string): string {
  return `<a class="brand-credit-link inline-flex min-h-11 min-w-11 items-center justify-center" href="${escapeHtml(config.organisation.url)}" aria-label="${escapeHtml(en.app.brandLink)}"><small>${escapeHtml(config.byline)}</small><img class="brand-mark-small" src="${escapeHtml(`${basePath}${config.stackstoneIcons.onLight}`)}" alt="Stackstone Consulting" width="24" height="24"></a>`;
}

function renderPublicFooter(
  basePath: string,
  extra = '',
  includeIndependence = true,
): string {
  return `<footer class="public-home-footer" data-testid="brand-footer-static">${renderStackstoneFooterLink(basePath)}${includeIndependence ? `<p class="public-independence">${escapeHtml(en.publicSite.independenceStatement)}</p>` : ''}${extra}</footer>`;
}

function renderFaqDetails(
  items: ReadonlyArray<{ question: string; answer: string }>,
): string {
  return items
    .map(
      (item) =>
        `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`,
    )
    .join('');
}

function renderFactsBlock(headingId: string): string {
  const facts = getPublicFacts()
    .map(
      (fact) =>
        `<div class="public-fact"><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`,
    )
    .join('');
  return `
    <section class="public-home-section" aria-labelledby="${escapeHtml(headingId)}">
      <h2 id="${escapeHtml(headingId)}">${escapeHtml(en.publicSite.factsHeading)}</h2>
      <p class="text-ash">${escapeHtml(en.publicSite.factsIntro)}</p>
      <dl class="public-home-facts">${facts}</dl>
    </section>
  `;
}

export function getPublicTitle(): string {
  return `${config.appName}: a free game of traitors and faithful for 5 to 40 players`;
}

export function getPublicFacts(): PublicFact[] {
  const { factLabels, factValues } = en.publicSite;
  return [
    { id: 'players', label: factLabels.players, value: factValues.players },
    { id: 'duration', label: factLabels.duration, value: factValues.duration },
    { id: 'devices', label: factLabels.devices, value: factValues.devices },
    { id: 'price', label: factLabels.price, value: factValues.price },
    { id: 'privacy', label: factLabels.privacy, value: factValues.privacy },
    { id: 'builder', label: factLabels.builder, value: config.builder },
  ];
}

export function structuredPublicData({
  includeFaqPage = false,
}: { includeFaqPage?: boolean } = {}): Record<string, unknown>[] {
  const description = en.publicSite.comingSoonBody;
  const facts = getPublicFacts().map((fact) => ({
    '@type': 'PropertyValue',
    name: fact.label,
    value: fact.value,
  }));
  const organisationId = new URL('#organization', config.organisation.url).href;
  const websiteId = new URL('#website', config.siteOrigin).href;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': organisationId,
      name: config.organisation.name,
      url: config.organisation.url,
      address: {
        '@type': 'PostalAddress',
        addressLocality: config.organisation.location.locality,
        addressRegion: config.organisation.location.region,
        addressCountry: 'GB',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': websiteId,
      name: config.appName,
      url: config.siteOrigin,
      inLanguage: 'en-GB',
      publisher: { '@id': organisationId },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      '@id': new URL('#application', config.siteOrigin).href,
      name: config.appName,
      url: config.siteOrigin,
      inLanguage: 'en-GB',
      description,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any modern web browser',
      isAccessibleForFree: true,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'GBP',
      },
      featureList: [
        'Phone and tablet browser play',
        'The organiser plays too',
        'Privacy shield designed for private reveals',
      ],
      numberOfPlayers: {
        '@type': 'QuantitativeValue',
        minValue: 5,
        maxValue: 40,
      },
      additionalProperty: facts,
      publisher: { '@id': organisationId },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Game',
      '@id': new URL('#game', config.siteOrigin).href,
      name: `${config.appName} hidden-role game`,
      url: config.siteOrigin,
      description,
      numberOfPlayers: {
        '@type': 'QuantitativeValue',
        minValue: 5,
        maxValue: 40,
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'GBP',
      },
      additionalProperty: facts,
    },
    ...(includeFaqPage
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: en.publicSite.faq.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
              },
            })),
          },
        ]
      : []),
  ];
}

export function renderPublicHomeHtml(
  basePath = '/',
  options: { staticOnly?: boolean; mode?: DeploymentMode } = {},
): string {
  const base = normaliseBasePath(basePath);
  const mode = options.mode ?? deploymentMode;
  const comingSoon = mode.comingSoonMode;
  const firstPart = config.appName.slice(
    0,
    config.appName.length - config.wordmarkAccentSuffix.length,
  );
  const appName = escapeHtml(config.appName);
  const playUrl = `${base}play?entry=create`;
  const joinUrl = `${base}join`;
  const practiseUrl = `${base}play?entry=rehearsal`;
  const steps = en.publicSite.howItWorks
    .map(
      (step, index) =>
        `<li><h3>${index + 1}. ${escapeHtml(step.heading)}</h3><p>${escapeHtml(step.body)}</p></li>`,
    )
    .join('');
  const formats = en.publicSite.formats
    .map(
      (format) =>
        `<article><h3>${escapeHtml(format.name)}</h3><p class="public-format-duration">${escapeHtml(format.duration)}</p><p>${escapeHtml(format.description)}</p></article>`,
    )
    .join('');
  const questions = renderFaqDetails(en.publicSite.faq);
  const demo =
    options.staticOnly || comingSoon
      ? ''
      : `<section class="home-role-demo public-home-demo" aria-label="${escapeHtml(en.publicSite.demoHeading)}">
          <h2 id="home-demo-heading">${escapeHtml(en.publicSite.demoHeading)}</h2>
          <p>${escapeHtml(en.publicSite.demoDescription)}</p>
          <button class="home-role-seal" type="button" aria-labelledby="home-demo-heading home-demo-seal-label" data-public-role-demo data-demo-prompt="${escapeHtml(en.publicSite.demoPrompt)}" data-traitor-label="${escapeHtml(en.game.roleTraitor)}" data-faithful-label="${escapeHtml(en.game.roleFaithful)}"><span aria-hidden="true" class="home-role-seal-ring"></span><span id="home-demo-seal-label" class="home-role-label" aria-live="polite" aria-atomic="true">${escapeHtml(en.publicSite.demoPrompt)}</span></button>
          <a class="home-demo-link" href="${escapeHtml(playUrl)}">${escapeHtml(en.publicSite.demoLink)}</a>
        </section>`;

  return `
    ${renderPublicHeader(base, mode)}
    <main id="main" class="public-home-content">
      <section class="public-home-hero" aria-labelledby="public-home-title">
        <div class="public-home-hero-copy">
          <h1 id="public-home-title" class="public-home-wordmark"><span>${escapeHtml(firstPart)}</span><span class="text-gilt">${escapeHtml(config.wordmarkAccentSuffix)}</span></h1>
          <p class="public-home-subtitle">${escapeHtml(en.entry.subtitle)}</p>
          <p class="public-home-byline">${escapeHtml(en.entry.welcomeDescription)}</p>
          ${
            comingSoon
              ? `<p>${escapeHtml(en.publicSite.comingSoonBody)}</p><p>${escapeHtml(en.publicSite.comingSoonByline)}</p>`
              : `<nav class="public-home-actions" aria-label="Get started">
            <a class="primary-action no-underline" href="${escapeHtml(playUrl)}">${escapeHtml(en.publicSite.play)}</a>
            <a class="secondary-action no-underline" href="${escapeHtml(joinUrl)}">${escapeHtml(en.publicSite.joinGame)}</a>
            <a class="quiet-action no-underline" href="${escapeHtml(practiseUrl)}">${escapeHtml(en.publicSite.practiseAlone)}</a>
          </nav>`
          }
        </div>
        ${demo}
      </section>
      <section class="public-home-section public-home-answer-section">
        <p class="public-home-answer">${escapeHtml(en.publicSite.answer(config.appName))}</p>
      </section>
      <section class="public-home-section" aria-labelledby="public-how-heading">
        <h2 id="public-how-heading">${escapeHtml(en.publicSite.howItWorksHeading)}</h2>
        <ol class="public-home-steps">${steps}</ol>
      </section>
      <section class="public-home-section" aria-labelledby="public-formats-heading">
        <h2 id="public-formats-heading">${escapeHtml(en.publicSite.formatsHeading)}</h2>
        <div class="public-home-formats">${formats}</div>
      </section>
      ${renderFactsBlock('public-facts-heading')}
      <section class="public-home-section" aria-labelledby="public-faq-heading">
        <h2 id="public-faq-heading">${escapeHtml(en.publicSite.faqHeading)}</h2>
        <div class="public-home-faq">${questions}</div>
        <a class="public-page-link" href="${escapeHtml(`${base}faq`)}">${escapeHtml(en.publicSite.seeAllQuestions)}</a>
      </section>
    </main>
    ${renderPublicFooter(base, `<a href="${escapeHtml(`${base}compare`)}">${escapeHtml(en.publicSite.compareHeading)}</a>`)}
    <span class="sr-only">${appName}</span>
  `;
}

export function renderPublicFaqHtml(
  basePath = '/',
  mode: DeploymentMode = deploymentMode,
): string {
  const base = normaliseBasePath(basePath);
  return `
    ${renderPublicHeader(base, mode)}
    <main id="main" class="public-home-content">
      <section class="public-home-section" aria-labelledby="public-faq-heading">
        <h1 id="public-faq-heading">${escapeHtml(en.publicSite.faqHeading)}</h1>
        <p class="public-home-answer">${escapeHtml(en.publicSite.answer(config.appName))}</p>
        <div class="public-home-faq">${renderFaqDetails(en.publicSite.faq)}</div>
      </section>
      ${renderFactsBlock('public-faq-facts-heading')}
    </main>
  `;
}

export function renderPublicCompareHtml(
  basePath = '/',
  mode: DeploymentMode = deploymentMode,
): string {
  const base = normaliseBasePath(basePath);
  const categories = en.publicSite.comparisonCategories
    .map(
      (category) =>
        `<tr><th scope="row">${escapeHtml(category.name)}</th><td>${escapeHtml(category.description)}</td></tr>`,
    )
    .join('');
  return `
    ${renderPublicHeader(base, mode)}
    <main id="main" class="public-home-content">
      <section class="public-home-section" aria-labelledby="public-compare-heading">
        <h1 id="public-compare-heading">${escapeHtml(en.publicSite.compareHeading)}</h1>
        <p class="public-home-answer">${escapeHtml(en.publicSite.compareIntro)}</p>
        <table class="public-comparison-table">
          <caption>How different hidden-role game formats work</caption>
          <thead><tr><th scope="col">Game format</th><th scope="col">What to expect</th></tr></thead>
          <tbody>${categories}</tbody>
        </table>
      </section>
      <section class="public-home-section" aria-labelledby="public-compare-faq-heading">
        <h2 id="public-compare-faq-heading">${escapeHtml(en.publicSite.faqHeading)}</h2>
        <div class="public-home-faq">${renderFaqDetails(en.publicSite.faq.slice(-3))}</div>
      </section>
    </main>
  `;
}

export function renderPublicAboutHtml(
  basePath = '/',
  mode: DeploymentMode = deploymentMode,
): string {
  const base = normaliseBasePath(basePath);
  return `
    ${renderPublicHeader(base, mode)}
    <main id="main" class="public-home-content">
      <section class="public-home-section" aria-labelledby="public-about-heading">
        <h1 id="public-about-heading">${escapeHtml(en.publicSite.aboutHeading)}</h1>
        <p class="public-home-answer">${escapeHtml(en.publicSite.answer(config.appName))}</p>
        <p>${escapeHtml(en.publicSite.independenceStatement)}</p>
      </section>
    </main>
  `;
}

export function renderPublicHowToPlayHtml(
  basePath = '/',
  mode: DeploymentMode = deploymentMode,
): string {
  const base = normaliseBasePath(basePath);
  const steps = en.publicSite.howItWorks
    .map(
      (step, index) =>
        `<li><h2>${index + 1}. ${escapeHtml(step.heading)}</h2><p>${escapeHtml(step.body)}</p></li>`,
    )
    .join('');
  return `
    ${renderPublicHeader(base, mode)}
    <main id="main" class="public-home-content">
      <section class="public-home-section" aria-labelledby="public-how-to-play-heading">
        <h1 id="public-how-to-play-heading">${escapeHtml(en.publicSite.howToPlayHeading)}</h1>
        <p class="public-home-answer">${escapeHtml(en.publicSite.howToPlayDescription)}</p>
        <ol class="public-home-steps">${steps}</ol>
      </section>
    </main>
  `;
}

export function renderPublicComingSoonHtml(
  basePath = '/',
  mode: DeploymentMode = deploymentMode,
): string {
  const base = normaliseBasePath(basePath);
  const firstPart = config.appName.slice(
    0,
    config.appName.length - config.wordmarkAccentSuffix.length,
  );
  return `
    ${renderPublicHeader(base, mode)}
    <main id="main" class="public-home-content">
      <section class="public-home-hero" aria-labelledby="coming-soon-title">
        <div class="public-home-hero-copy">
          <h1 id="coming-soon-title" class="public-home-wordmark"><span>${escapeHtml(firstPart)}</span><span class="text-gilt">${escapeHtml(config.wordmarkAccentSuffix)}</span></h1>
          <p class="public-home-subtitle">${escapeHtml(en.entry.subtitle)}</p>
          <p class="public-home-byline">${escapeHtml(en.entry.welcomeDescription)}</p>
          <p>${escapeHtml(en.publicSite.comingSoonBody)}</p>
          <p>${escapeHtml(en.publicSite.comingSoonByline)}</p>
          <p><a class="public-page-link" href="${escapeHtml(base)}">Back to home</a></p>
        </div>
      </section>
    </main>
  `;
}

export function renderLlmsTxt(): string {
  const pageLabels: Record<
    (typeof PUBLIC_MARKETING_ROUTE_PATHS)[number],
    string
  > = {
    [APP_ROUTE_PATHS.home]: en.nav.home,
    [APP_ROUTE_PATHS.about]: en.publicSite.aboutHeading,
    [APP_ROUTE_PATHS.howToPlay]: en.publicSite.howToPlayHeading,
    [APP_ROUTE_PATHS.faq]: en.publicSite.faqHeading,
    [APP_ROUTE_PATHS.compare]: en.publicSite.compareHeading,
    [APP_ROUTE_PATHS.comingSoon]: en.publicSite.comingSoonPageTitle,
  };
  const pages = PUBLIC_MARKETING_ROUTE_PATHS.filter(
    (route) => route !== APP_ROUTE_PATHS.comingSoon,
  )
    .map(
      (route) =>
        `- [${pageLabels[route]}](${new URL(route, config.siteOrigin).href})`,
    )
    .join('\n');
  const facts = getPublicFacts()
    .map((fact) => `- ${fact.label}: ${fact.value}`)
    .join('\n');
  const questions = en.publicSite.faq
    .map((item) => `### ${item.question}\n${item.answer}`)
    .join('\n\n');
  const comparisons = en.publicSite.comparisonCategories
    .map((category) => `- ${category.name}: ${category.description}`)
    .join('\n');
  return `# ${config.appName}

${en.publicSite.answer(config.appName)}

## Public pages
${pages}

## Key facts
${facts}

## Game formats
${en.publicSite.formats.map((format) => `- ${format.name}: ${format.duration} — ${format.description}`).join('\n')}

## Compare game formats
${comparisons}

## Frequently asked questions
${questions}
`;
}

export function renderSitemapXml(): string {
  const entries = PUBLIC_MARKETING_ROUTE_PATHS.filter(
    (route) => route !== APP_ROUTE_PATHS.comingSoon,
  )
    .map(
      (route) =>
        `  <url><loc>${escapeHtml(new URL(route, config.siteOrigin).href)}</loc></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

export function renderPublicStaticDocument({
  content,
  title,
  description,
  canonicalUrl,
  basePath,
  stylesheetHrefs,
  fontPreloadHrefs,
  robotsDirective,
  includeStructuredData = true,
  structuredData,
}: {
  content: string;
  title: string;
  description: string;
  canonicalUrl: string | null;
  basePath: string;
  stylesheetHrefs: readonly string[];
  fontPreloadHrefs: readonly string[];
  robotsDirective?: string;
  includeStructuredData?: boolean;
  structuredData?: Record<string, unknown>[];
}): string {
  const jsonLd = JSON.stringify(
    structuredData ?? structuredPublicData(),
  ).replaceAll('<', '\\u003c');
  const stylesheets = stylesheetHrefs
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('');
  const fontPreloads = fontPreloadHrefs
    .map(
      (href) =>
        `<link rel="preload" href="${escapeHtml(href)}" as="font" type="font/woff2" crossorigin>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="${escapeHtml(robotsDirective ?? (config.preLaunch ? 'noindex, nofollow' : 'index, follow'))}">
    ${canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : ''}
    ${canonicalUrl ? `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">` : ''}
    <meta property="og:site_name" content="${escapeHtml(config.appName)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website">
    ${canonicalUrl ? `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:url" content="${escapeHtml(canonicalUrl)}">` : ''}
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <link rel="icon" type="image/svg+xml" href="${escapeHtml(`${normaliseBasePath(basePath)}favicon.svg`)}">
    ${fontPreloads}
    ${stylesheets}
    ${includeStructuredData ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
  </head>
  <body>
    <div id="static-home" class="safe-page">${content}</div>
  </body>
</html>`;
}

export type PublicPageSlug =
  'home' | 'about' | 'how-to-play' | 'faq' | 'compare' | 'coming-soon';

const PUBLIC_PAGE_PATHS: Record<PublicPageSlug, string> = {
  home: APP_ROUTE_PATHS.home,
  about: APP_ROUTE_PATHS.about,
  'how-to-play': APP_ROUTE_PATHS.howToPlay,
  faq: APP_ROUTE_PATHS.faq,
  compare: APP_ROUTE_PATHS.compare,
  'coming-soon': APP_ROUTE_PATHS.comingSoon,
};

export function renderPublicPageDocument({
  page,
  basePath = '/',
  stylesheetHrefs,
  fontPreloadHrefs,
  mode = deploymentMode,
  robotsDirective,
  canonicalUrl,
  includeStructuredData = true,
}: {
  page: PublicPageSlug;
  basePath?: string;
  stylesheetHrefs: readonly string[];
  fontPreloadHrefs: readonly string[];
  mode?: DeploymentMode;
  robotsDirective?: string;
  canonicalUrl?: string | null;
  includeStructuredData?: boolean;
}): string {
  const route = PUBLIC_PAGE_PATHS[page];
  const title = {
    home: getPublicTitle(),
    about: `${config.appName}: ${en.publicSite.aboutHeading}`,
    'how-to-play': `${config.appName}: ${en.publicSite.howToPlayHeading}`,
    faq: `${config.appName}: ${en.publicSite.faqHeading}`,
    compare: `${config.appName}: ${en.publicSite.compareHeading}`,
    'coming-soon': en.publicSite.comingSoonPageTitle,
  }[page];
  const description = {
    home: en.publicSite.answer(config.appName),
    about: en.publicSite.aboutDescription,
    'how-to-play': en.publicSite.howToPlayDescription,
    faq: en.publicSite.faqDescription,
    compare: en.publicSite.compareDescription,
    'coming-soon': en.publicSite.comingSoonDescription,
  }[page];
  const content = {
    home: renderPublicHomeHtml(basePath, { staticOnly: true, mode }),
    about: renderPublicAboutHtml(basePath, mode),
    'how-to-play': renderPublicHowToPlayHtml(basePath, mode),
    faq: renderPublicFaqHtml(basePath, mode),
    compare: renderPublicCompareHtml(basePath, mode),
    'coming-soon': renderPublicComingSoonHtml(basePath, mode),
  }[page];
  const contentWithIndependence =
    page === 'home'
      ? content
      : content.replace(
          '</main>',
          `${renderPublicFooter(basePath, '', !content.includes(escapeHtml(en.publicSite.independenceStatement)))}</main>`,
        );

  return renderPublicStaticDocument({
    content: contentWithIndependence,
    title,
    description,
    canonicalUrl:
      canonicalUrl === undefined
        ? new URL(
            page === 'coming-soon' ? APP_ROUTE_PATHS.home : route,
            config.siteOrigin,
          ).href
        : canonicalUrl,
    basePath,
    stylesheetHrefs,
    fontPreloadHrefs,
    robotsDirective:
      robotsDirective ??
      (shouldNoindexPath(route, mode) ? 'noindex, nofollow' : 'index, follow'),
    includeStructuredData,
    structuredData: structuredPublicData({ includeFaqPage: page === 'faq' }),
  });
}
