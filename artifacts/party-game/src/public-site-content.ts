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
  const playUrl = `${base}play`;
  const facts = getPublicFacts()
    .map(
      (fact) =>
        `<div class="public-fact"><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`,
    )
    .join('');
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
  const questions = en.publicSite.faq
    .map(
      (item) =>
        `<details><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`,
    )
    .join('');

  return `
    <header class="public-home-brand">
      <a href="${escapeHtml(config.organisation.url)}" aria-label="${escapeHtml(en.entry.markAlt)}">
        <img src="${escapeHtml(`${base}${config.appIconPath}`)}" alt="" width="32" height="32">
      </a>
    </header>
    <main id="main" class="public-home">
      <section class="public-home-hero" aria-labelledby="public-home-title">
        <div class="public-home-hero-copy">
          <h1 id="public-home-title" class="public-home-wordmark"><span>${escapeHtml(firstPart)}</span><span class="text-gilt">${escapeHtml(config.wordmarkAccentSuffix)}</span></h1>
          <p class="public-home-subtitle">${escapeHtml(en.entry.subtitle)}</p>
          <p class="public-home-byline">${escapeHtml(en.entry.welcomeDescription)}</p>
          <p class="public-home-answer">${escapeHtml(en.publicSite.answer(config.appName))}</p>
          <nav aria-label="${escapeHtml(en.nav.label)}">
            <a class="primary-action no-underline" href="${escapeHtml(playUrl)}">${escapeHtml(en.publicSite.play)}</a>
          </nav>
        </div>
        <aside class="public-home-demo" aria-label="${escapeHtml(en.entry.subtitle)}">
          <p class="display text-2xl">${escapeHtml(en.publicSite.demoHeading)}</p>
          <p>${escapeHtml(en.publicSite.demoDescription)}</p>
          <a class="quiet-action no-underline" href="${escapeHtml(playUrl)}">${escapeHtml(en.publicSite.demoLink)}</a>
        </aside>
      </section>
      <section class="public-home-section" aria-labelledby="public-how-heading">
        <h2 id="public-how-heading">${escapeHtml(en.publicSite.howItWorksHeading)}</h2>
        <ol class="public-home-steps">${steps}</ol>
      </section>
      <section class="public-home-section" aria-labelledby="public-formats-heading">
        <h2 id="public-formats-heading">${escapeHtml(en.publicSite.formatsHeading)}</h2>
        <div class="public-home-formats">${formats}</div>
      </section>
      <section class="public-home-section" aria-labelledby="public-facts-heading">
        <h2 id="public-facts-heading">${escapeHtml(en.publicSite.factsHeading)}</h2>
        <dl class="public-home-facts">${facts}</dl>
      </section>
      <section class="public-home-section" aria-labelledby="public-faq-heading">
        <h2 id="public-faq-heading">${escapeHtml(en.publicSite.faqHeading)}</h2>
        <div class="public-home-faq">${questions}</div>
      </section>
    </main>
    <footer class="public-home-footer">${escapeHtml(en.entry.footer)}</footer>
    <span class="sr-only">${appName}</span>
  `;
}
