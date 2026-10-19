import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const formerName = ['turn', 'stone'].join('');
const oldNamePattern = new RegExp(
  `\\b${formerName}(?:game)?(?:[-_][a-z0-9_-]*)?(?=$|[^a-z0-9])`,
  'gi',
);
const githubOwner = 'WhisperingSquirrel-TD';
const repositoryUrlPrefix = `https://github.com/${githubOwner}/`;
const protectedIdentifiers = new Map<string, ReadonlySet<string>>([
  [
    '.github/workflows/promote.yml',
    new Set([['TURN', 'STONE', '_PROMOTION_ENABLED'].join('')]),
  ],
  [
    'docs/DECISIONS.md',
    new Set([
      ['TURN', 'STONE', '_GITHUB_TOKEN'].join(''),
      ['TURN', 'STONE', '_PROMOTION_ENABLED'].join(''),
    ]),
  ],
  [
    'docs/PROGRESS.md',
    new Set([
      ['TURN', 'STONE', '_GITHUB_TOKEN'].join(''),
      ['TURN', 'STONE', '_PROMOTION_ENABLED'].join(''),
    ]),
  ],
  [
    'tests/pipeline.test.ts',
    new Set([['TURN', 'STONE', '_PROMOTION_ENABLED'].join('')]),
  ],
]);

function matches(text: string) {
  const pattern = new RegExp(oldNamePattern.source, oldNamePattern.flags);
  return [...text.matchAll(pattern)].map((match) => ({
    index: match.index!,
    value: match[0],
  }));
}

function isAllowed(
  path: string,
  text: string,
  index: number,
  value: string,
): boolean {
  const prefix = text.slice(0, index);
  const lowerPrefix = prefix.toLowerCase();
  const urlPrefix = repositoryUrlPrefix.toLowerCase();
  if (value.toLowerCase() === formerName && lowerPrefix.endsWith(urlPrefix))
    return true;

  if (protectedIdentifiers.get(path)?.has(value.toUpperCase())) return true;

  if (path === 'docs/PROGRESS.md') {
    const historyStart = text.indexOf('## Previous verification history');
    if (historyStart >= 0 && index > historyStart) return true;
  }

  return false;
}

it('keeps the former product name out of tracked files except the documented owner exclusions', () => {
  const paths = execFileSync('git', ['ls-files', '-z'])
    .toString()
    .split('\0')
    .filter(Boolean);
  const violations: string[] = [];

  for (const path of paths) {
    for (const { index, value } of matches(path)) {
      if (!isAllowed(path, path, index, value))
        violations.push(`${path} (tracked path)`);
    }

    const text = readFileSync(path).toString('latin1');
    for (const { index, value } of matches(text)) {
      if (!isAllowed(path, text, index, value)) {
        const line = text.slice(0, index).split('\n').length;
        violations.push(`${path}:${line}`);
      }
    }
  }

  expect(
    violations,
    'former-name matches outside the explicit allowlist',
  ).toEqual([]);
});
