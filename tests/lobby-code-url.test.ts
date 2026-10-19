import { expect, it } from 'vitest';
import {
  lobbyCodeJoinUrl,
  parseLobbyCodeFragment,
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
