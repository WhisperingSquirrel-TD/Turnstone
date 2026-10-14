import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.CSRF_TEST_PORT ?? 8081);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid CSRF test server port');
}

const csrfCookieName = 'turnstone-csrf';
const csrfToken = randomBytes(32).toString('base64url');

function cookieValue(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator >= 0 && part.slice(0, separator).trim() === csrfCookieName) {
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
    const cookie = cookieValue(request.headers.cookie);
    const header = request.headers['x-csrf-token'];
    const valid =
      cookie !== null &&
      typeof header === 'string' &&
      cookie.length === header.length &&
      timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
    response.writeHead(valid ? 204 : 403).end();
    return;
  }

  response.writeHead(404).end();
});

server.listen(port, '127.0.0.1');
