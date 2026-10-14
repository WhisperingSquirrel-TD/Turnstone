import { config } from './config';
import { en } from './locale/en-GB';

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

function renderPublicHeader(basePath: string): string {
  const firstPart = config.appName.slice(
    0,
    config.appName.length - config.wordmarkAccentSuffix.length,
  );
  return `
    <header class="public-home-brand">
      <a class="turnstone-wordmark" href="${escapeHtml(basePath)}" aria-label="${escapeHtml(config.appName)}">
        <span>${escapeHtml(firstPart)}</span><span class="text-gilt">${escapeHtml(config.wordmarkAccentSuffix)}</span>
      </a>
      <nav class="public-home-nav" aria-label="${escapeHtml(en.nav.label)}">
        <a href="${escapeHtml(basePath)}">${escapeHtml(en.nav.home)}</a>
        <a href="${escapeHtml(`${basePath}faq`)}">${escapeHtml(en.publicSite.faqHeading)}</a>
        <a href="${escapeHtml(`${basePath}compare`)}">${escapeHtml(en.publicSite.compareHeading)}</a>
        <a href="${escapeHtml(`${basePath}play`)}">${escapeHtml(en.nav.play)}</a>
      </nav>
      <details class="public-home-menu">
        <summary>${escapeHtml(en.nav.menu)}</summary>
        <div>
          <a href="${escapeHtml(basePath)}">${escapeHtml(en.nav.home)}</a>
          <a href="${escapeHtml(`${basePath}faq`)}">${escapeHtml(en.publicSite.faqHeading)}</a>
          <a href="${escapeHtml(`${basePath}compare`)}">${escapeHtml(en.publicSite.compareHeading)}</a>
          <a href="${escapeHtml(`${basePath}play`)}">${escapeHtml(en.nav.play)}</a>
        </div>
      </details>
      <a class="public-home-brand-mark" href="${escapeHtml(basePath)}" aria-label="${escapeHtml(en.app.turnstoneHomeLink)}">
        <img src="${escapeHtml(`${basePath}${config.appIconPath}`)}" alt="" width="32" height="32">
      </a>
    </header>
  `;
}

function renderStackstoneFooterLink(basePath: string): string {
  return `<a class="inline-flex min-h-11 min-w-11 items-center justify-center" href="${escapeHtml(config.organisation.url)}" aria-label="${escapeHtml(en.app.brandLink)}"><img class="brand-mark-small" src="${escapeHtml(`${basePath}${config.stackstoneIconPath}`)}" alt="" width="32" height="32"></a>`;
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

export function structuredPublicData(): Record<string, unknown>[] {
  const answer = en.publicSite.answer(config.appName);
  const facts = getPublicFacts().map((fact) => ({
    '@type': 'PropertyValue',
    name: fact.label,
    value: fact.value,
  }));
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: config.appName,
      url: config.siteOrigin,
      inLanguage: 'en-GB',
      description: answer,
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
      additionalProperty: facts,
      publisher: {
        '@type': 'Organization',
        name: config.organisation.name,
        url: config.organisation.url,
        address: {
          '@type': 'PostalAddress',
          addressLocality: config.organisation.location.locality,
          addressRegion: config.organisation.location.region,
          addressCountry: 'GB',
        },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Game',
      name: `${config.appName} hidden-role game`,
      url: config.siteOrigin,
      description: answer,
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
  ];
}

export function renderPublicHomeHtml(basePath = '/'): string {
  const base = normaliseBasePath(basePath);
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

  return `
    ${renderPublicHeader(base)}
    <main id="main" class="public-home-content">
      <section class="public-home-hero" aria-labelledby="public-home-title">
        <div class="public-home-hero-copy">
          <h1 id="public-home-title" class="public-home-wordmark"><span>${escapeHtml(firstPart)}</span><span class="text-gilt">${escapeHtml(config.wordmarkAccentSuffix)}</span></h1>
          <p class="public-home-subtitle">${escapeHtml(en.entry.subtitle)}</p>
          <p class="public-home-byline">${escapeHtml(en.entry.welcomeDescription)}</p>
          <nav class="public-home-actions" aria-label="Get started">
            <a class="primary-action no-underline" href="${escapeHtml(playUrl)}">${escapeHtml(en.publicSite.play)}</a>
            <a class="secondary-action no-underline" href="${escapeHtml(joinUrl)}">${escapeHtml(en.publicSite.joinGame)}</a>
            <a class="quiet-action no-underline" href="${escapeHtml(practiseUrl)}">${escapeHtml(en.publicSite.practiseAlone)}</a>
          </nav>
        </div>
        <section class="home-role-demo public-home-demo" aria-label="${escapeHtml(en.publicSite.demoHeading)}">
          <h2 id="home-demo-heading">${escapeHtml(en.publicSite.demoHeading)}</h2>
          <p>${escapeHtml(en.publicSite.demoDescription)}</p>
          <button class="home-role-seal" type="button" aria-labelledby="home-demo-heading home-demo-seal-label" data-public-role-demo data-demo-prompt="${escapeHtml(en.publicSite.demoPrompt)}" data-traitor-label="${escapeHtml(en.game.roleTraitor)}" data-faithful-label="${escapeHtml(en.game.roleFaithful)}"><span aria-hidden="true" class="home-role-seal-ring"></span><span id="home-demo-seal-label" class="home-role-label" aria-live="polite" aria-atomic="true">${escapeHtml(en.publicSite.demoPrompt)}</span></button>
          <a class="home-demo-link" href="${escapeHtml(playUrl)}">${escapeHtml(en.publicSite.demoLink)}</a>
        </section>
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
    <footer class="public-home-footer"><span>${escapeHtml(en.entry.footer)}</span>${renderStackstoneFooterLink(base)}<a href="${escapeHtml(`${base}compare`)}">${escapeHtml(en.publicSite.compareHeading)}</a></footer>
    <span class="sr-only">${appName}</span>
  `;
}

export function renderPublicFaqHtml(basePath = '/'): string {
  const base = normaliseBasePath(basePath);
  return `
    ${renderPublicHeader(base)}
    <main id="main" class="public-home-content">
      <section class="public-home-section" aria-labelledby="public-faq-heading">
        <h1 id="public-faq-heading">${escapeHtml(en.publicSite.faqHeading)}</h1>
        <p class="public-home-answer">${escapeHtml(en.publicSite.answer(config.appName))}</p>
        <div class="public-home-faq">${renderFaqDetails(en.publicSite.faq)}</div>
      </section>
      ${renderFactsBlock('public-faq-facts-heading')}
    </main>
    <footer class="public-home-footer"><span>${escapeHtml(en.entry.footer)}</span>${renderStackstoneFooterLink(base)}</footer>
  `;
}

export function renderPublicCompareHtml(basePath = '/'): string {
  const base = normaliseBasePath(basePath);
  const categories = en.publicSite.comparisonCategories
    .map(
      (category) =>
        `<tr><th scope="row">${escapeHtml(category.name)}</th><td>${escapeHtml(category.description)}</td></tr>`,
    )
    .join('');
  return `
    ${renderPublicHeader(base)}
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
    <footer class="public-home-footer"><span>${escapeHtml(en.entry.footer)}</span>${renderStackstoneFooterLink(base)}</footer>
  `;
}

export function renderLlmsTxt(): string {
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

export function renderPublicStaticDocument({
  content,
  title,
  description,
  canonicalUrl,
  basePath,
  stylesheetHrefs,
  fontPreloadHrefs,
}: {
  content: string;
  title: string;
  description: string;
  canonicalUrl: string;
  basePath: string;
  stylesheetHrefs: readonly string[];
  fontPreloadHrefs: readonly string[];
}): string {
  const jsonLd = JSON.stringify(structuredPublicData()).replaceAll(
    '<',
    '\\u003c',
  );
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
    <meta name="robots" content="${config.preLaunch ? 'noindex, nofollow' : 'index, follow'}">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website">
    <link rel="icon" type="image/svg+xml" href="${escapeHtml(`${normaliseBasePath(basePath)}favicon.svg`)}">
    ${fontPreloads}
    ${stylesheets}
    <script type="application/ld+json">${jsonLd}</script>
  </head>
  <body>
    <div id="static-home" class="safe-page">${content}</div>
  </body>
</html>`;
}
