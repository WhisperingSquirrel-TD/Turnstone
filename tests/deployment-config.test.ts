import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The first Reserved VM publish (27 October 2026) crash-looped: `.replit`
// selected the artifact application router, so Replit ran each artifact's own
// production build and run. Neither ran `build:oathstone`, whose last step
// writes the compressed client files the server requires (D115).
const replit = readFileSync('.replit', 'utf8');
const rootPackage = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};

function deploymentSection(): string {
  const start = replit.indexOf('[deployment]\n');
  expect(start, '.replit has a [deployment] section').toBeGreaterThanOrEqual(0);
  const rest = replit.slice(start + '[deployment]\n'.length);
  const next = rest.search(/^\[/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function stringArray(section: string, key: string): string[] | undefined {
  const match = new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]`, 'm').exec(
    section,
  );
  return match
    ? [...match[1]!.matchAll(/"([^"]*)"/g)].map((item) => item[1]!)
    : undefined;
}

function artifactManifests(): string[] {
  return readdirSync('artifacts')
    .map((name) => join('artifacts', name, '.replit-artifact', 'artifact.toml'))
    .filter((path) => existsSync(path));
}

describe('production deployment configuration', () => {
  it('deploys one Reserved VM process with the release plan commands', () => {
    const deployment = deploymentSection();
    expect(deployment).toMatch(/^deploymentTarget\s*=\s*"gce"\s*$/m);
    expect(stringArray(deployment, 'build')).toEqual([
      'pnpm',
      'run',
      'build:oathstone',
    ]);
    expect(stringArray(deployment, 'run')).toEqual([
      'pnpm',
      'run',
      'start:oathstone',
    ]);
  });

  it('does not deploy through the artifact application router', () => {
    expect(deploymentSection()).not.toMatch(/^router\s*=/m);
  });

  it('defines no artifact production service, so party-game never serves production', () => {
    const manifests = artifactManifests();
    expect(manifests).toContain(
      join('artifacts', 'party-game', '.replit-artifact', 'artifact.toml'),
    );
    for (const path of manifests)
      expect(readFileSync(path, 'utf8'), path).not.toMatch(
        /^\[services\.production/m,
      );
  });

  it('builds the compressed client before the server can start', () => {
    const build = rootPackage.scripts['build:oathstone']!;
    expect(build.trim().endsWith('run build:client')).toBe(true);
    expect(build).toContain('@workspace/party-game run build');
    expect(build).toContain('@workspace/api-server run build ');
  });

  it('starts the single production server on the platform port', () => {
    const start = rootPackage.scripts['start:oathstone']!;
    expect(start).toContain('NODE_ENV=production');
    expect(start).toContain('PORT=${PORT:-5000}');
    expect(start).toContain('@workspace/api-server run start');
    expect(start).not.toContain('party-game');
  });
});
