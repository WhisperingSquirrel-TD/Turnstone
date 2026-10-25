/** Maps the legacy /play location to the canonical root, preserving query and hash. */
export function canonicalPlayTarget(
  location: { pathname: string; search: string; hash: string },
  playPath = '/play',
): string | null {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path !== playPath) return null;
  return `/${location.search}${location.hash}`;
}
