import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandFooter, BrandSurfaceContext } from './BrandFooter';

const readAsset = (path: string) =>
  readFileSync(new URL(path, import.meta.url));

const sha256 = (path: string) =>
  createHash('sha256').update(readAsset(path)).digest('hex');

describe('official Stackstone footer marks', () => {
  it('keeps the official light and dark SVG files byte-for-byte', () => {
    expect(sha256('../public/brand/stackstone-icon.svg')).toBe(
      '5df93c7ac0ad2d3d5523fb29e6d5b56a4a1f23a77ffa161d8a4814c7b0a69b63',
    );
    expect(sha256('../public/brand/stackstone-icon-dark.svg')).toBe(
      'c1c406f5b569b1f4556c204e7ee6eaafcbcefd885262e5138c29932c29471046',
    );
    expect(
      readAsset('../public/favicon.svg').equals(
        readAsset('../public/brand/stackstone-icon-dark.svg'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        new URL(
          '../public/brand/stackstone-icon-dark-outlined.svg',
          import.meta.url,
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        new URL(
          '../public/brand/stackstone-logo-dark-outlined.svg',
          import.meta.url,
        ),
      ),
    ).toBe(false);
  });

  it('uses the official mark that matches each footer background', () => {
    const lightSurface = renderToStaticMarkup(
      <BrandFooter context="game" surface="light" />,
    );
    const darkSurface = renderToStaticMarkup(
      <BrandFooter context="game" surface="dark" />,
    );
    const publicSurface = renderToStaticMarkup(
      <BrandFooter context="public" surface="dark" />,
    );
    const inheritedLightSurface = renderToStaticMarkup(
      <BrandSurfaceContext.Provider value="light">
        <BrandFooter context="game" />
      </BrandSurfaceContext.Provider>,
    );

    expect(lightSurface).toContain('src="/brand/stackstone-icon.svg"');
    expect(darkSurface).toContain('src="/brand/stackstone-icon-dark.svg"');
    expect(publicSurface).toContain('src="/brand/stackstone-icon-dark.svg"');
    expect(inheritedLightSurface).toContain('src="/brand/stackstone-icon.svg"');
    for (const markup of [lightSurface, darkSurface, publicSurface]) {
      expect(markup).toContain('alt="Stackstone Consulting"');
    }
  });

  it('does not recolour or tint official marks in CSS', () => {
    for (const stylesheet of ['./theme.css', './public-home.css']) {
      const css = readFileSync(new URL(stylesheet, import.meta.url), 'utf8');
      expect(css).not.toMatch(
        /\.brand-mark-small[^{}]*\{[^}]*\b(?:filter|opacity)\s*:/s,
      );
    }
  });
});
