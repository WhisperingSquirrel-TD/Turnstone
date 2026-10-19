import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { config } from '../artifacts/party-game/src/config';

const webArtifact = readFileSync(
  'artifacts/party-game/.replit-artifact/artifact.toml',
  'utf8',
);
const apiArtifact = readFileSync(
  'artifacts/api-server/.replit-artifact/artifact.toml',
  'utf8',
);

function artifactTitle(source: string): string | undefined {
  return /^title = "([^"]+)"/m.exec(source)?.[1];
}

describe('Replit artifact identity and realtime routing', () => {
  it('keeps the web preview title aligned with the single app name', () => {
    expect(artifactTitle(webArtifact)).toBe(config.appName);
  });

  it('labels the API artifact as part of the Oathstone product', () => {
    expect(artifactTitle(apiArtifact)).toBe(`${config.appName} API`);
  });

  it('routes Socket.IO to the API service in the same-origin preview', () => {
    const paths = /^\s*paths = \[([^\]]*)\]/m.exec(apiArtifact)?.[1] ?? '';
    expect(paths).toContain('"/api"');
    expect(paths).toContain('"/socket.io"');
  });
});
