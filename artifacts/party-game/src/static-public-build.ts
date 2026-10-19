import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { APP_ROUTE_PATHS } from '@workspace/shared/app-routes';
import {
  renderRobotsTxt,
  type DeploymentMode,
} from '@workspace/security/deployment';
import {
  renderPublicPageDocument,
  type PublicPageSlug,
} from './public-site-content';

const publicPages: ReadonlyArray<{
  route: string;
  slug: PublicPageSlug;
}> = [
  { route: APP_ROUTE_PATHS.home, slug: 'home' },
  { route: APP_ROUTE_PATHS.about, slug: 'about' },
  { route: APP_ROUTE_PATHS.howToPlay, slug: 'how-to-play' },
  { route: APP_ROUTE_PATHS.faq, slug: 'faq' },
  { route: APP_ROUTE_PATHS.compare, slug: 'compare' },
  { route: APP_ROUTE_PATHS.comingSoon, slug: 'coming-soon' },
];

function pageOutputPath(outputDirectory: string, route: string): string {
  return route === '/'
    ? join(outputDirectory, 'index.html')
    : join(outputDirectory, route.slice(1), 'index.html');
}

async function copyBrandIcons(
  sourceDirectory: string,
  outputDirectory: string,
): Promise<void> {
  const sourceBrandDirectory = join(sourceDirectory, 'brand');
  const outputBrandDirectory = join(outputDirectory, 'brand');
  let entries;
  try {
    entries = await readdir(sourceBrandDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await mkdir(outputBrandDirectory, { recursive: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.svg')) continue;
    await copyFile(
      join(sourceBrandDirectory, entry.name),
      join(outputBrandDirectory, entry.name),
    );
  }
}

export async function buildStaticPublicSite({
  sourceDirectory,
  outputDirectory,
  deploymentMode,
}: {
  sourceDirectory: string;
  outputDirectory: string;
  deploymentMode: DeploymentMode;
}): Promise<void> {
  const source = resolve(sourceDirectory);
  const output = resolve(outputDirectory);
  if (
    source === output ||
    output.startsWith(`${source}${sep}`) ||
    source.startsWith(`${output}${sep}`)
  ) {
    throw new Error(
      'Static public output must be separate from the app build.',
    );
  }

  const sourceAssetsDirectory = join(source, 'assets');
  const outputAssetsDirectory = join(output, 'assets');
  await rm(output, { recursive: true, force: true });
  await mkdir(outputAssetsDirectory, { recursive: true });

  const faqDocument = await readFile(join(source, 'faq', 'index.html'), 'utf8');
  const stylesheetFiles = [
    ...new Set(
      [
        ...faqDocument.matchAll(
          /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g,
        ),
      ]
        .map((match) => match[1])
        .filter((href): href is string => Boolean(href))
        .map((href) =>
          basename(new URL(href, 'https://turnstone.invalid').pathname),
        )
        .filter((file) => file.endsWith('.css')),
    ),
  ];
  if (stylesheetFiles.length === 0) {
    throw new Error('The built public pages do not reference a stylesheet.');
  }

  const assetEntries = await readdir(sourceAssetsDirectory, {
    withFileTypes: true,
  });
  const fontFiles = assetEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.woff2'))
    .map((entry) => entry.name)
    .sort();
  for (const file of [...stylesheetFiles, ...fontFiles]) {
    await copyFile(
      join(sourceAssetsDirectory, file),
      join(outputAssetsDirectory, file),
    );
  }
  await copyFile(join(source, 'favicon.svg'), join(output, 'favicon.svg'));
  await copyBrandIcons(source, output);

  const stylesheetHrefs = stylesheetFiles.map((file) => `/assets/${file}`);
  const fontPreloadHrefs = fontFiles.map((file) => `/assets/${file}`);
  for (const page of publicPages) {
    const html = renderPublicPageDocument({
      page: page.slug,
      basePath: '/',
      stylesheetHrefs,
      fontPreloadHrefs,
      mode: deploymentMode,
    });
    const outputPath = pageOutputPath(output, page.route);
    await mkdir(join(outputPath, '..'), { recursive: true });
    await writeFile(outputPath, html, 'utf8');
  }

  const appFallback = renderPublicPageDocument({
    page: 'coming-soon',
    basePath: '/',
    stylesheetHrefs,
    fontPreloadHrefs,
    mode: deploymentMode,
    robotsDirective: 'noindex, nofollow',
    canonicalUrl: null,
    includeStructuredData: false,
  });
  await writeFile(join(output, 'app-shell.html'), appFallback, 'utf8');
  await writeFile(join(output, '404.html'), appFallback, 'utf8');
  await writeFile(
    join(output, 'robots.txt'),
    renderRobotsTxt(deploymentMode),
    'utf8',
  );
}
