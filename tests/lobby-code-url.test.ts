import { expect, it } from 'vitest';
import {
  lobbyCodeJoinUrl,
  parseLobbyCodeFragment,
  publicShareUrl,
  previewShareWarning,
  validatePublicBaseUrl,
} from '../artifacts/party-game/src/lobby-code-url';

it('puts a lobby code only in the fragment of a join URL', () => {
  expect(
    lobbyCodeJoinUrl({
      origin: 'https://oathstone.example',
      joinPath: '/party-game/join',
      code: 'ABC234',
    }),
  ).toBe('https://oathstone.example/party-game/join#code=ABC234');
});

it('uses the configured public mount for QR links, never the preview host or preview mount', () => {
  const url = lobbyCodeJoinUrl({
    origin: 'https://private.kirk.replit.dev',
    joinPath: '/party-game/join',
    code: 'ABC234',
    configuredBaseUrl: 'https://public.example/game/',
    previewBasePath: '/party-game/',
  });
  expect(url).toBe('https://public.example/game/join#code=ABC234');
  expect(url).not.toContain('replit.dev');
  expect(parseLobbyCodeFragment(new URL(url).hash)).toBe('ABC234');
});

it('rebases invitation fragments through the same configured public URL', () => {
  expect(
    publicShareUrl({
      origin: 'https://private.replit.dev',
      path: '/party-game/join/game-id',
      fragment: 'invitation-token',
      configuredBaseUrl: 'https://public.example/',
      previewBasePath: '/party-game/',
    }),
  ).toBe('https://public.example/join/game-id#invitation-token');
});

it('does not create a share link for an unconfigured private preview, but preserves the code parser', () => {
  expect(
    lobbyCodeJoinUrl({
      origin: 'https://private.kirk.replit.dev',
      joinPath: '/join',
      code: 'ABC234',
      configuredBaseUrl: '',
    }),
  ).toBe('');
  expect(previewShareWarning('https://private.kirk.replit.dev', '')).toBe(
    'Players outside your Replit account cannot open this preview link. It will work once the game is published.',
  );
  expect(parseLobbyCodeFragment('#code=ABC234')).toBe('ABC234');
});

it.each([
  'https://public.example',
  'http://localhost:22814',
  'https://not-replit.dev.example',
])('warns only on a genuine unconfigured replit.dev host, not %s', (origin) => {
  expect(previewShareWarning(origin, '')).toBeNull();
  expect(
    publicShareUrl({
      origin,
      path: '/join',
      fragment: 'code=ABC234',
      configuredBaseUrl: '',
    }),
  ).toBe(`${origin}/join#code=ABC234`);
});

it('does not warn when a public base is configured even on a preview', () => {
  expect(
    previewShareWarning('https://private.replit.dev', 'https://public.example'),
  ).toBeNull();
});

it('recognises a DNS-equivalent trailing-dot preview hostname', () => {
  expect(previewShareWarning('https://private.replit.dev.', '')).not.toBeNull();
});

it.each([
  'http://public.example',
  'javascript:alert(1)',
  'https://user:password@public.example',
  'https://public.example/?query=1',
  'https://public.example/#hash',
  'https://private.replit.dev',
])(
  'rejects an unsafe public base without silently using the preview: %s',
  (value) => {
    expect(() => validatePublicBaseUrl(value)).toThrow('PUBLIC_BASE_URL');
  },
);

it('rejects invalid lobby codes before making a QR URL', () => {
  expect(() =>
    lobbyCodeJoinUrl({
      origin: 'https://oathstone.example',
      joinPath: '/party-game/join',
      code: 'ABCI01',
    }),
  ).toThrow('Invalid lobby code');
});

it('reads a QR code fragment without putting the code in the request path', () => {
  const url = new URL(
    lobbyCodeJoinUrl({
      origin: 'https://oathstone.example',
      joinPath: '/party-game/join',
      code: 'ABC234',
    }),
  );

  expect(url.pathname).toBe('/party-game/join');
  expect(url.search).toBe('');
  expect(parseLobbyCodeFragment(url.hash)).toBe('ABC234');
  expect(parseLobbyCodeFragment('#code=ABCI01')).toBeNull();
});
