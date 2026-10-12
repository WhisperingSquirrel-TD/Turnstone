import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const response = await page.goto(
    'https://stackstoneconsulting.co.uk/brand/',
    {
      waitUntil: 'networkidle',
      timeout: 45000,
    },
  );
  const evidence = await page.evaluate(() => ({
    url: window.location.href,
    text: document.body.innerText,
    observedPageFonts: [
      ...new Set(
        [...document.querySelectorAll('body, h1, h2')].map(
          (node) => window.getComputedStyle(node).fontFamily,
        ),
      ),
    ],
    images: [...document.images].map((image) => ({
      src: image.currentSrc || image.src,
      alt: image.alt,
    })),
    links: [...document.querySelectorAll('a[href]')].map((link) => ({
      href: link.href,
      text: link.textContent,
    })),
    inlineSvg: [...document.querySelectorAll('svg')].map((svg) => ({
      label: svg.getAttribute('aria-label'),
      markup: svg.outerHTML,
    })),
  }));
  mkdirSync('generated-artifacts/brand-inspection', { recursive: true });
  writeFileSync(
    'generated-artifacts/brand-inspection/page.json',
    JSON.stringify(
      {
        status: response?.status(),
        ...evidence,
      },
      null,
      2,
    ),
  );
  const assetDirectory = 'assets/brand/stackstone';
  mkdirSync(assetDirectory, { recursive: true });
  const assets = [];
  for (const image of evidence.images.filter(
    (image) => image.src.endsWith('.svg') && image.src.includes('/brand/'),
  )) {
    const asset = await page.request.get(image.src);
    if (!asset.ok()) throw new Error(`Asset unavailable: ${image.src}`);
    const svg = await asset.text();
    if (
      !svg.includes('<svg') ||
      /<script|<foreignObject|\bon\w+\s*=|javascript:/i.test(svg)
    ) {
      throw new Error(`Unsafe/non-SVG brand asset: ${image.src}`);
    }
    const file = image.src.split('/').at(-1);
    writeFileSync(`${assetDirectory}/${file}`, svg);
    assets.push({
      file,
      sourceUrl: image.src,
      bytes: Buffer.byteLength(svg),
      artworkColours: [...new Set(svg.match(/#[0-9a-f]{3,8}\b/gi) ?? [])],
      artworkFontDeclarations: [
        ...svg.matchAll(/font-family=(?:"([^"]*)"|'([^']*)')/gi),
      ].map((match) => match[1] ?? match[2]),
    });
  }
  writeFileSync(
    `${assetDirectory}/source.json`,
    JSON.stringify(
      {
        sourceUrl: evidence.url,
        retrievedAt: new Date().toISOString(),
        statedPalette: null,
        statedTypography: null,
        note: 'The rendered brand page states no palette or typography. SVG artwork colours/font declarations and computed page fonts are observations, not permission to replace the game theme.',
        observedPageFonts: evidence.observedPageFonts,
        assets,
      },
      null,
      2,
    ) + '\n',
  );
  await page.screenshot({
    path: 'generated-artifacts/brand-inspection/page.png',
    fullPage: true,
  });
  console.info(
    JSON.stringify(
      {
        status: response?.status(),
        text: evidence.text,
        observedPageFonts: evidence.observedPageFonts,
        assets,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
