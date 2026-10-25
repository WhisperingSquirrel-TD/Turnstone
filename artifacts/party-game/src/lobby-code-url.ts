const lobbyCodePattern = /^[A-HJ-NP-Z2-9]{6}$/;
const configuredPublicBaseUrl = import.meta.env?.PUBLIC_BASE_URL;

function isDevelopmentHost(origin: string): boolean {
  const host = new URL(origin).hostname.toLowerCase().replace(/\.$/, '');
  return host === 'replit.dev' || host.endsWith('.replit.dev');
}

/** Public, build-time configuration only; never an authentication/API origin. */
export function validatePublicBaseUrl(
  value: string | undefined,
): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      isDevelopmentHost(url.origin)
    )
      throw new Error();
    return url.toString();
  } catch {
    throw new Error(
      'PUBLIC_BASE_URL must be a public HTTPS URL without credentials, query or fragment',
    );
  }
}

export function previewShareWarning(
  origin: string,
  configuredBaseUrl: string | undefined = configuredPublicBaseUrl,
): string | null {
  return !validatePublicBaseUrl(configuredBaseUrl) && isDevelopmentHost(origin)
    ? 'Players outside your Replit account cannot open this preview link. It will work once the game is published.'
    : null;
}

export function publicShareUrl(input: {
  origin: string;
  path: string;
  fragment: string;
  configuredBaseUrl?: string;
  previewBasePath?: string;
}): string {
  const configured = validatePublicBaseUrl(
    input.configuredBaseUrl ?? configuredPublicBaseUrl,
  );
  if (!configured && isDevelopmentHost(input.origin)) return '';
  const base = new URL(configured ?? input.origin);
  if (!input.path.startsWith('/') || input.path.startsWith('//'))
    throw new Error('Invalid join path');
  let path = input.path;
  if (configured) {
    const previewPrefix = (
      input.previewBasePath ??
      import.meta.env?.BASE_URL ??
      '/'
    ).replace(/\/+$/, '');
    if (previewPrefix && path.startsWith(`${previewPrefix}/`))
      path = path.slice(previewPrefix.length);
    path = `${base.pathname.replace(/\/+$/, '')}${path}`;
  }
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error('Invalid join path');
  url.hash = input.fragment;
  return url.toString();
}

export function lobbyCodeJoinUrl(input: {
  origin: string;
  joinPath: string;
  code: string;
  configuredBaseUrl?: string;
  previewBasePath?: string;
}): string {
  const code = input.code.toUpperCase();
  if (!lobbyCodePattern.test(code)) throw new Error('Invalid lobby code');

  return publicShareUrl({
    ...input,
    path: input.joinPath,
    fragment: `code=${code}`,
  });
}

export function parseLobbyCodeFragment(fragment: string): string | null {
  const match = /^#?code=([A-HJ-NP-Z2-9]{6})$/i.exec(fragment);
  return match?.[1]?.toUpperCase() ?? null;
}
