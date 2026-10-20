import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { cookieNameForGame } from '../../artifacts/api-server/src/session-auth';
import { coldSeatGameId, coldSeatToken, createPublicView } from './public-view';

const port = Number(process.env.CSRF_TEST_PORT ?? 8081);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid CSRF test server port');
}

const csrfCookieName = 'oathstone-csrf';
const csrfToken = randomBytes(32).toString('base64url');

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator >= 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/healthz' && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }

  if (pathname === '/api/csrf' && request.method === 'GET') {
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `${csrfCookieName}=${csrfToken}; Path=/; HttpOnly; SameSite=Strict`,
    });
    response.end(JSON.stringify({ csrfToken }));
    return;
  }

  if (pathname === '/api/csrf-check' && request.method === 'POST') {
    const cookie = cookieValue(request.headers.cookie, csrfCookieName);
    const header = request.headers['x-csrf-token'];
    const valid =
      cookie !== null &&
      typeof header === 'string' &&
      cookie.length === header.length &&
      timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
    response.writeHead(valid ? 204 : 403).end();
    return;
  }

  if (
    pathname === `/api/games/${coldSeatGameId}/view` &&
    request.method === 'GET'
  ) {
    const seatToken = cookieValue(
      request.headers.cookie,
      cookieNameForGame(coldSeatGameId),
    );
    if (seatToken !== coldSeatToken) {
      response
        .writeHead(401, { 'Content-Type': 'application/json' })
        .end(
          JSON.stringify({ message: 'The saved seat session is required.' }),
        );
      return;
    }

    const view = createPublicView(coldSeatGameId);
    view.phase = 'VOTE';
    view.deadline = Date.now() + 48 * 60 * 60 * 1_000;
    response
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(
        JSON.stringify({ serverNow: Date.now(), version: view.version, view }),
      );
    return;
  }

  response.writeHead(404).end();
});

server.listen(port, '127.0.0.1');
