const STATIC_DESTINATIONS = new Set(['script', 'style', 'font', 'image']);
const EXCLUDED_PATHS = ['/api/', '/socket.io/'];

self.shouldCacheStaticRequest = (request, origin) => {
  const url = new URL(request.url);
  return (
    request.method === 'GET' &&
    url.origin === origin &&
    !EXCLUDED_PATHS.some((path) => url.pathname.includes(path)) &&
    STATIC_DESTINATIONS.has(request.destination)
  );
};
