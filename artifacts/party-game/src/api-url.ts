export function apiUrl(path: string, apiOrigin: string | null): string {
  const prefix = apiOrigin?.replace(/\/+$/, '') ?? '';
  return `${prefix}/api${path}`;
}
